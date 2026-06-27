//go:build integration

// Integration tests for the guardian Tier-2 guarded writes (M7, docs/18). These prove:
//   - request_leave / update_own_contact follow the golden rule (row + outbox + audit),
//   - the child-scoping boundary holds on WRITES too (a foreign child is rejected),
//   - pay_fees is gated by can_pay AND records a real CREDIT in the finance ledger,
//   - the maker-checker APPLY step (approve contact change → guardian record updated).
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/guardian/...)
package guardian

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/access"
	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

// promoteFor onboards a child (with one guardian) and promotes that guardian to a portal
// user, returning the child id, the guardian id, and the guardian's membership id.
func promoteFor(t *testing.T, ctx context.Context, pool *pgxpool.Pool, svc *students.Service, tenantID, actor uuid.UUID, name, adm string, canPay bool) (uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	child, err := svc.Onboard(ctx, tenantID, actor, students.OnboardInput{
		Name: name, AdmissionNo: adm,
		Guardians: []students.GuardianInput{{Name: name + " Parent", Phone: "555-0", Relation: "FATHER", IsPrimary: true, CanPay: canPay}},
	})
	require.NoError(t, err)
	var gid uuid.UUID
	require.NoError(t, testdb.InTenant(ctx, pool, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT guardian_id FROM guardian_student WHERE student_id=$1 LIMIT 1`, child.StudentID).Scan(&gid)
	}))
	promo, err := svc.PromoteGuardian(ctx, tenantID, actor, gid)
	require.NoError(t, err)
	return child.StudentID, gid, promo.MembershipID
}

func TestGuardianT2Writes(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenant := testdb.NewTenant(t, pool, nodeID)
	ctx := context.Background()

	studentSvc := students.NewService(students.NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))
	accessRepo := access.NewRepo(pool, nodeID)
	// Seed the catalog + default roles up front so the seeded "Guardian" role (with
	// pay_fees) exists before any promotion. No admin attach needed (uuid.Nil).
	require.NoError(t, access.SeedCatalog(ctx, accessRepo))
	require.NoError(t, access.BootstrapTenant(ctx, accessRepo, tenant.ID, uuid.Nil))

	// A paying guardian for child A; a non-paying guardian for child C; child B unrelated.
	childA, _, memA := promoteFor(t, ctx, pool, studentSvc, tenant.ID, tenant.Actor, "Alpha", "ADM-T2-A", true)
	childC, _, memC := promoteFor(t, ctx, pool, studentSvc, tenant.ID, tenant.Actor, "Gamma", "ADM-T2-C", false)
	childB, err := studentSvc.Onboard(ctx, tenant.ID, tenant.Actor, students.OnboardInput{Name: "Beta", AdmissionNo: "ADM-T2-B"})
	require.NoError(t, err)

	gsvc := NewService(pool, onboarding.NewEngine(pool, nodeID))

	t.Run("request_leave golden rule + scoping", func(t *testing.T) {
		id, err := gsvc.RequestLeave(ctx, tenant.ID, memA, childA, LeaveInput{FromDate: "2026-07-01", ToDate: "2026-07-03", Reason: "family trip"})
		require.NoError(t, err)

		// Golden rule: exactly one outbox + one audit for this aggregate.
		var ob, au int
		require.NoError(t, testdb.InTenant(ctx, pool, tenant.ID, func(tx pgx.Tx) error {
			if e := tx.QueryRow(ctx, `SELECT count(*) FROM outbox WHERE aggregate='leave_request' AND aggregate_id=$1`, id).Scan(&ob); e != nil {
				return e
			}
			return tx.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE resource_type='leave_request' AND resource_id=$1`, id).Scan(&au)
		}))
		assert.Equal(t, 1, ob, "one outbox row")
		assert.Equal(t, 1, au, "one audit row")

		// Foreign child rejected on the WRITE path.
		_, err = gsvc.RequestLeave(ctx, tenant.ID, memA, childB.StudentID, LeaveInput{FromDate: "2026-07-01", ToDate: "2026-07-02", Reason: "x"})
		assert.ErrorIs(t, err, ErrForbidden, "guardian A cannot request leave for a foreign child")

		// Staff queue shows it PENDING; decide → APPROVED.
		pend, err := gsvc.PendingLeave(ctx, tenant.ID)
		require.NoError(t, err)
		require.NotEmpty(t, pend)
		require.NoError(t, gsvc.DecideLeave(ctx, tenant.ID, tenant.Actor, id, DecisionInput{Approve: true, Note: "ok"}))
		var status string
		require.NoError(t, testdb.InTenant(ctx, pool, tenant.ID, func(tx pgx.Tx) error {
			return tx.QueryRow(ctx, `SELECT status FROM leave_request WHERE id=$1`, id).Scan(&status)
		}))
		assert.Equal(t, "APPROVED", status)
		// A second decision on an already-decided row is a no-op (ErrNotFound).
		assert.ErrorIs(t, gsvc.DecideLeave(ctx, tenant.ID, tenant.Actor, id, DecisionInput{Approve: false}), ErrNotFound)
	})

	t.Run("pay_fees gated by can_pay, records a CREDIT", func(t *testing.T) {
		// Paying guardian: success → real receipt + CREDIT in the ledger.
		res, err := gsvc.PayFees(ctx, tenant.ID, memA, childA, PayInput{Amount: 1500})
		require.NoError(t, err)
		assert.NotEmpty(t, res.ReceiptNo)
		var credits int
		require.NoError(t, testdb.InTenant(ctx, pool, tenant.ID, func(tx pgx.Tx) error {
			return tx.QueryRow(ctx, `SELECT count(*) FROM ledger_entry WHERE student_id=$1 AND direction='CREDIT'`, childA).Scan(&credits)
		}))
		assert.Equal(t, 1, credits, "payment wrote one CREDIT ledger entry")

		// Non-paying guardian: rejected by can_pay.
		_, err = gsvc.PayFees(ctx, tenant.ID, memC, childC, PayInput{Amount: 100})
		assert.ErrorIs(t, err, ErrCannotPay, "a non-paying guardian cannot transact")
	})

	t.Run("update_own_contact maker-checker apply", func(t *testing.T) {
		const newPhone = "999-NEW"
		id, err := gsvc.UpdateOwnContact(ctx, tenant.ID, memA, ContactInput{Phone: newPhone})
		require.NoError(t, err)

		pend, err := gsvc.PendingContact(ctx, tenant.ID)
		require.NoError(t, err)
		require.NotEmpty(t, pend)

		// Approve → the guardian record is actually updated, in the same tx.
		require.NoError(t, gsvc.DecideContact(ctx, tenant.ID, tenant.Actor, id, DecisionInput{Approve: true}))
		var phone, status string
		require.NoError(t, testdb.InTenant(ctx, pool, tenant.ID, func(tx pgx.Tx) error {
			if e := tx.QueryRow(ctx, `SELECT status FROM contact_change_request WHERE id=$1`, id).Scan(&status); e != nil {
				return e
			}
			return tx.QueryRow(ctx, `SELECT phone FROM guardian WHERE membership_id=$1`, memA).Scan(&phone)
		}))
		assert.Equal(t, "APPROVED", status)
		assert.Equal(t, newPhone, phone, "approved contact change was applied to the guardian record")
	})
}
