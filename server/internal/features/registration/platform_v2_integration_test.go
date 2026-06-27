//go:build integration

// Integration tests for the M9 super-admin surface (docs/promts.md): license lifecycle
// (suspend mirrors revoked; extend re-signs a valid token + writes a cp_outbox push),
// payment-proof clarification (status + public poll), plan archive (hidden from the public
// catalog), and the analytics aggregates. Owner pool, control_plane schema (no RLS).
//
// Run: ./ved.sh test ./internal/features/registration/...
package registration

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/license"
	"github.com/weloin/ved/internal/platform/testdb"
)

const testSignKey = "test-license-key"

// v2Fixture seeds plans + a superadmin and approves one school, returning the service,
// approver id, and the approval result (tenant + license + expiry).
func v2Fixture(t *testing.T) (*Service, *license.Signer, uuid.UUID, ApproveResult) {
	t.Helper()
	pool := testdb.ControlPlanePool(t)
	ctx := context.Background()

	platRepo := platform.NewRepo(pool)
	require.NoError(t, platform.SeedPlans(ctx, platRepo))
	require.NoError(t, platform.SeedSuperAdmin(ctx, platRepo))

	var planID, adminID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM control_plane.plan_catalog WHERE is_active ORDER BY price DESC LIMIT 1`).Scan(&planID))
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM control_plane.platform_admin LIMIT 1`).Scan(&adminID))

	signer := license.NewSigner(testSignKey)
	svc := NewService(pool, uuid.Must(uuid.NewV7()), signer)

	h := uuid.NewString()
	slug := "v2" + h[len(h)-12:]
	reg, err := svc.Register(ctx, RegisterInput{
		SchoolName: "V2 School", Slug: slug, AdminName: "Head", AdminEmail: slug + "@t.com", PlanID: planID.String(),
	})
	require.NoError(t, err)
	require.NoError(t, svc.SubmitProof(ctx, reg.ID, ProofInput{
		Amount: 5000, Currency: "INR", Method: "BANK_TRANSFER", TxnID: "TXN-" + slug, PayerName: "Head",
	}))
	res, err := svc.Approve(ctx, adminID, reg.ID)
	require.NoError(t, err)
	return svc, signer, adminID, res
}

func TestLicenseSuspendAndExtend(t *testing.T) {
	svc, signer, _, a := v2Fixture(t)
	ctx := context.Background()

	// Suspend → status SUSPENDED, revoked mirror true, and a cp_outbox push is queued.
	require.NoError(t, svc.SetLicenseState(ctx, a.LicenseID, "SUSPENDED", true))
	var status string
	var revoked bool
	require.NoError(t, svc.pool.QueryRow(ctx,
		`SELECT status, revoked FROM control_plane.license WHERE id=$1`, a.LicenseID).Scan(&status, &revoked))
	assert.Equal(t, "SUSPENDED", status)
	assert.True(t, revoked, "revoked mirrors the suspend for the node")

	var pushes int
	require.NoError(t, svc.pool.QueryRow(ctx,
		`SELECT count(*) FROM control_plane.cp_outbox WHERE tenant_id=$1 AND aggregate='license'`, a.TenantID).Scan(&pushes))
	assert.GreaterOrEqual(t, pushes, 1, "license change emits a cloud→node config push")

	// Resume, then extend by 30 days: a NEW signed license supersedes the old one and the
	// fresh token verifies with a later expiry.
	require.NoError(t, svc.SetLicenseState(ctx, a.LicenseID, "ACTIVE", false))
	newID, err := svc.ExtendLicense(ctx, a.LicenseID, 30)
	require.NoError(t, err)
	assert.NotEqual(t, a.LicenseID, newID, "extend re-issues a new license row")

	var oldSuperseded *uuid.UUID
	require.NoError(t, svc.pool.QueryRow(ctx, `SELECT superseded_by FROM control_plane.license WHERE id=$1`, a.LicenseID).Scan(&oldSuperseded))
	require.NotNil(t, oldSuperseded)
	assert.Equal(t, newID, *oldSuperseded, "old license points at its successor")

	var token, sig string
	require.NoError(t, svc.pool.QueryRow(ctx, `SELECT signed_token, signature FROM control_plane.license WHERE id=$1`, newID).Scan(&token, &sig))
	claims, err := signer.Verify(token, sig)
	require.NoError(t, err, "re-signed token verifies")
	assert.True(t, claims.ExpiresAt.After(a.LicenseExpires), "expiry pushed out ~30 days")
}

func TestPaymentClarificationFlow(t *testing.T) {
	svc, _, adminID, _ := v2Fixture(t)
	ctx := context.Background()

	// A fresh registration awaiting review with a pending proof.
	h := uuid.NewString()
	slug := "cl" + h[len(h)-12:]
	var planID uuid.UUID
	require.NoError(t, svc.pool.QueryRow(ctx, `SELECT id FROM control_plane.plan_catalog WHERE is_active LIMIT 1`).Scan(&planID))
	reg, err := svc.Register(ctx, RegisterInput{SchoolName: "Clar", Slug: slug, AdminName: "A", AdminEmail: slug + "@t.com", PlanID: planID.String()})
	require.NoError(t, err)
	require.NoError(t, svc.SubmitProof(ctx, reg.ID, ProofInput{Amount: 100, Method: "UPI", TxnID: "TXN-" + slug}))

	var proofID uuid.UUID
	require.NoError(t, svc.pool.QueryRow(ctx, `SELECT id FROM control_plane.payment_proof WHERE registration_id=$1`, reg.ID).Scan(&proofID))

	require.NoError(t, svc.RequestClarification(ctx, adminID, proofID, "please re-upload a clearer screenshot"))

	// The proof is INFO_REQUESTED with the note, and the public registration poll surfaces it.
	var status string
	var note *string
	require.NoError(t, svc.pool.QueryRow(ctx, `SELECT status, clarification_note FROM control_plane.payment_proof WHERE id=$1`, proofID).Scan(&status, &note))
	assert.Equal(t, "INFO_REQUESTED", status)
	require.NotNil(t, note)
	assert.Contains(t, *note, "screenshot")

	detail, err := svc.Detail(ctx, reg.ID)
	require.NoError(t, err)
	require.NotNil(t, detail.Proof)
	assert.Equal(t, "INFO_REQUESTED", detail.Proof.Status)

	// Re-requesting on a settled proof is a no-op (not PENDING anymore).
	assert.ErrorIs(t, svc.RequestClarification(ctx, adminID, proofID, "again"), ErrNotFound)
}

func TestPlanArchiveHidesFromCatalog(t *testing.T) {
	svc, _, _, _ := v2Fixture(t)
	ctx := context.Background()

	id, err := svc.CreatePlan(ctx, PlanInput{Name: "Ephemeral", Tier: "T1", BillingCycle: "MONTHLY", Price: 499, Seats: 50})
	require.NoError(t, err)

	active := func() bool {
		var exists bool
		require.NoError(t, svc.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM control_plane.plan_catalog WHERE id=$1 AND is_active)`, id).Scan(&exists))
		return exists
	}
	assert.True(t, active(), "new plan starts active (in the public catalog)")

	require.NoError(t, svc.ArchivePlan(ctx, id))
	assert.False(t, active(), "archived plan drops out of the public catalog")

	var st string
	require.NoError(t, svc.pool.QueryRow(ctx, `SELECT status FROM control_plane.plan_catalog WHERE id=$1`, id).Scan(&st))
	assert.Equal(t, "ARCHIVED", st)
}

func TestAnalyticsAggregates(t *testing.T) {
	svc, _, _, a := v2Fixture(t)
	ctx := context.Background()

	reg, err := svc.RegistrationAnalytics(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, reg.Total, 1)
	assert.GreaterOrEqual(t, reg.Approved, 1, "the fixture approved one school")
	assert.Len(t, reg.Funnel, 4, "funnel has all four stages")

	sub, err := svc.SubscriptionAnalytics(ctx)
	require.NoError(t, err)
	assert.Greater(t, sub.MRR, 0.0, "an active subscription contributes to MRR")
	assert.Equal(t, round1(sub.MRR*12), sub.ARR, "ARR = MRR×12")
	assert.GreaterOrEqual(t, sub.LicensesActive, 1)

	lic, err := svc.LicenseAnalytics(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, lic.Total, 1)
	assert.GreaterOrEqual(t, lic.Active, 1)

	// Enriched tenant list includes our approved tenant with its plan + user count.
	tenants, err := svc.ListTenantsEnriched(ctx)
	require.NoError(t, err)
	var found bool
	for _, tn := range tenants {
		if tn.ID == a.TenantID {
			found = true
			assert.NotNil(t, tn.Plan, "tenant carries its plan name")
			assert.GreaterOrEqual(t, tn.Users, 1, "provisioned admin counts as a user")
		}
	}
	assert.True(t, found, "approved tenant appears in the enriched list")
}
