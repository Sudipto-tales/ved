//go:build integration

// Integration tests for the staff slice — RLS isolation + golden-rule atomicity/rollback
// against a real Postgres (same shape as teachers; aggregate = employee).
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/staff/...)
package staff

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

func onboardOne(t *testing.T, svc *Service, tenant testdb.Tenant, name, employeeCode string) OnboardResult {
	t.Helper()
	res, err := svc.Onboard(context.Background(), tenant.ID, tenant.Actor, OnboardInput{
		Name:         name,
		Department:   "Administration",
		Designation:  "Clerk",
		EmployeeCode: employeeCode,
	})
	require.NoError(t, err, "onboard should succeed")
	return res
}

func TestRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(onboarding.NewEngine(pool, nodeID))

	tenantA := testdb.NewTenant(t, pool, nodeID)
	tenantB := testdb.NewTenant(t, pool, nodeID)

	a1 := onboardOne(t, svc, tenantA, "Henrietta Clerk", "EMP-A-001")
	onboardOne(t, svc, tenantA, "Margaret Bursar", "EMP-A-002")
	onboardOne(t, svc, tenantB, "Dorothy Registrar", "EMP-B-001")

	assert.Equal(t, 2, testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM employee WHERE deleted_at IS NULL`),
		"tenant A sees its own 2 staff")
	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM employee WHERE deleted_at IS NULL`),
		"tenant B sees its own 1 staff")
	assert.Equal(t, 0, testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM employee WHERE id = $1`, a1.EmployeeID),
		"tenant B must NOT see tenant A's staff")
}

func TestGoldenRuleAtomicity(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(onboarding.NewEngine(pool, nodeID))
	tenant := testdb.NewTenant(t, pool, nodeID)

	res := onboardOne(t, svc, tenant, "Evelyn Admin", "EMP-GR-001")

	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM employee WHERE id = $1`, res.EmployeeID), "exactly one employee row")
	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate = 'employee' AND aggregate_id = $1`, res.EmployeeID),
		"exactly one outbox[employee] row")
	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE resource_type = 'employee' AND action = 'staff.onboarded' AND resource_id = $1`, res.EmployeeID),
		"exactly one audit[staff.onboarded] row")
}

func TestGoldenRuleRollback(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(onboarding.NewEngine(pool, nodeID))
	tenant := testdb.NewTenant(t, pool, nodeID)

	onboardOne(t, svc, tenant, "First Staff", "EMP-DUP-001")

	outboxBefore := testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM outbox WHERE aggregate = 'employee'`)
	auditBefore := testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM audit_log WHERE resource_type = 'employee'`)

	_, err := svc.Onboard(context.Background(), tenant.ID, tenant.Actor, OnboardInput{
		Name:         "Dup Staff",
		EmployeeCode: "EMP-DUP-001",
	})
	require.Error(t, err, "duplicate employee code must be rejected")

	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM employee WHERE deleted_at IS NULL`),
		"only the first staff persists")
	assert.Equal(t, outboxBefore, testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM outbox WHERE aggregate = 'employee'`),
		"failed onboard left no orphan outbox row")
	assert.Equal(t, auditBefore, testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM audit_log WHERE resource_type = 'employee'`),
		"failed onboard left no orphan audit row")
}
