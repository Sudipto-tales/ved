//go:build integration

// Integration tests for the access (RBAC) slice — RLS isolation + golden-rule atomicity
// against a real Postgres. The canonical mutation here is role creation (row + outbox +
// audit in one tx). Roles use empty permission bundles to avoid depending on the global
// catalog seed (permIDsByKeys is empty-safe).
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/access/...)
package access

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/platform/testdb"
)

func createRole(t *testing.T, svc *Service, tenant testdb.Tenant, name string) RoleDTO {
	t.Helper()
	dto, err := svc.CreateRole(context.Background(), tenant.ID, tenant.Actor, name, nil)
	require.NoError(t, err, "create role should succeed")
	return dto
}

func TestRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(NewRepo(pool, nodeID))

	tenantA := testdb.NewTenant(t, pool, nodeID)
	tenantB := testdb.NewTenant(t, pool, nodeID)

	roleA := createRole(t, svc, tenantA, "Librarian")
	createRole(t, svc, tenantA, "Counselor")
	createRole(t, svc, tenantB, "Warden")

	assert.Equal(t, 2, testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM roles WHERE deleted_at IS NULL`),
		"tenant A sees its own 2 roles")
	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM roles WHERE deleted_at IS NULL`),
		"tenant B sees its own 1 role")
	assert.Equal(t, 0, testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM roles WHERE id = $1`, roleA.ID),
		"tenant B must NOT see tenant A's role")
}

func TestGoldenRuleAtomicity(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(NewRepo(pool, nodeID))
	tenant := testdb.NewTenant(t, pool, nodeID)

	dto := createRole(t, svc, tenant, "Lab Assistant")

	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM roles WHERE id = $1`, dto.ID), "exactly one role row")
	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate = 'role' AND aggregate_id = $1`, dto.ID),
		"exactly one outbox[role] row")
	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE resource_type = 'role' AND action = 'role.create' AND resource_id = $1`, dto.ID),
		"exactly one audit[role.create] row")
}

func TestGoldenRuleRollback(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(NewRepo(pool, nodeID))
	tenant := testdb.NewTenant(t, pool, nodeID)

	createRole(t, svc, tenant, "Duplicate Role")

	outboxBefore := testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM outbox WHERE aggregate = 'role'`)
	auditBefore := testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM audit_log WHERE resource_type = 'role'`)

	// Same name → unique (tenant_id, name) violation → whole tx rolls back.
	_, err := svc.CreateRole(context.Background(), tenant.ID, tenant.Actor, "Duplicate Role", nil)
	require.Error(t, err, "duplicate role name must be rejected")

	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM roles WHERE deleted_at IS NULL`),
		"only the first role persists")
	assert.Equal(t, outboxBefore, testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM outbox WHERE aggregate = 'role'`),
		"failed create left no orphan outbox row")
	assert.Equal(t, auditBefore, testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM audit_log WHERE resource_type = 'role'`),
		"failed create left no orphan audit row")
}
