//go:build integration

// Integration tests for the guardian portal (M7). The slice owns no tables — its whole
// job is the child-scoping SECURITY BOUNDARY: a guardian sees ONLY students in their
// guardian_student set. This proves it directly: a promoted guardian resolves to exactly
// their linked child, and a foreign child is rejected (the 403 boundary at the query layer).
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/guardian/...)
package guardian

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/access"
	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

func TestGuardianSeesOnlyLinkedChildren(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenant := testdb.NewTenant(t, pool, nodeID)
	ctx := context.Background()

	studentSvc := students.NewService(students.NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))

	// Child A has a guardian; child B is unrelated (the "foreign child").
	childA, err := studentSvc.Onboard(ctx, tenant.ID, tenant.Actor, students.OnboardInput{
		Name: "Child Alpha", AdmissionNo: "ADM-G-A1",
		Guardians: []students.GuardianInput{{Name: "Parent Alpha", Phone: "555-1", Relation: "FATHER", IsPrimary: true, CanPay: true}},
	})
	require.NoError(t, err)
	childB, err := studentSvc.Onboard(ctx, tenant.ID, tenant.Actor, students.OnboardInput{
		Name: "Child Beta", AdmissionNo: "ADM-G-B1",
	})
	require.NoError(t, err)

	// Promotion attaches the seeded "Guardian" default role, so the tenant needs the
	// RBAC bootstrap (catalog + default roles). The harness doesn't run it; do it here.
	accessRepo := access.NewRepo(pool, nodeID)
	require.NoError(t, access.SeedCatalog(ctx, accessRepo))
	require.NoError(t, access.BootstrapTenant(ctx, accessRepo, tenant.ID, childA.MembershipID))

	// Resolve guardian A's id from the link, then promote them to a portal user.
	var guardianAID uuid.UUID
	require.NoError(t, testdb.InTenant(ctx, pool, tenant.ID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT g.id FROM guardian g JOIN guardian_student gs ON gs.guardian_id = g.id WHERE gs.student_id = $1 LIMIT 1`,
			childA.StudentID).Scan(&guardianAID)
	}))
	promo, err := studentSvc.PromoteGuardian(ctx, tenant.ID, tenant.Actor, guardianAID)
	require.NoError(t, err)

	gsvc := NewService(pool, onboarding.NewEngine(pool, nodeID))

	// The promoted membership resolves back to guardian A.
	gid, err := gsvc.guardianID(ctx, tenant.ID, promo.MembershipID)
	require.NoError(t, err)
	assert.Equal(t, guardianAID, gid)

	// Children() returns exactly the one linked child.
	children, err := gsvc.Children(ctx, tenant.ID, gid)
	require.NoError(t, err)
	require.Len(t, children, 1, "guardian sees exactly their one linked child")
	assert.Equal(t, childA.StudentID, children[0].StudentID)

	// The boundary: linked child OK, foreign child rejected.
	assert.NoError(t, gsvc.linkedStudent(ctx, tenant.ID, gid, childA.StudentID), "own child is accessible")
	assert.Error(t, gsvc.linkedStudent(ctx, tenant.ID, gid, childB.StudentID), "a foreign child must be rejected (the 403 boundary)")
}
