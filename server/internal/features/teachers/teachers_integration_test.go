//go:build integration

// Integration tests for the teachers slice — same two invariants proven on students,
// replicated here (RLS isolation + golden-rule atomicity/rollback) against a real PG.
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/teachers/...)
package teachers

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
		Name:           name,
		EmployeeCode:   employeeCode,
		Specialization: "Mathematics",
	})
	require.NoError(t, err, "onboard should succeed")
	return res
}

// TestRLSIsolation: teachers onboarded under tenant A are invisible to tenant B.
func TestRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(onboarding.NewEngine(pool, nodeID))

	tenantA := testdb.NewTenant(t, pool, nodeID)
	tenantB := testdb.NewTenant(t, pool, nodeID)

	a1 := onboardOne(t, svc, tenantA, "Alan Turing", "EMP-A-001")
	onboardOne(t, svc, tenantA, "Ada Lovelace", "EMP-A-002")
	onboardOne(t, svc, tenantB, "Grace Hopper", "EMP-B-001")

	aFromA := testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM teacher WHERE deleted_at IS NULL`)
	bFromB := testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM teacher WHERE deleted_at IS NULL`)
	assert.Equal(t, 2, aFromA, "tenant A sees its own 2 teachers")
	assert.Equal(t, 1, bFromB, "tenant B sees its own 1 teacher")

	leakAintoB := testdb.CountInTenant(t, pool, tenantB.ID,
		`SELECT count(*) FROM teacher WHERE id = $1`, a1.TeacherID)
	assert.Equal(t, 0, leakAintoB, "tenant B must NOT see tenant A's teacher")
}

// TestGoldenRuleAtomicity: one teacher.onboard ⇒ 1 teacher + 1 outbox + 1 audit.
func TestGoldenRuleAtomicity(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(onboarding.NewEngine(pool, nodeID))
	tenant := testdb.NewTenant(t, pool, nodeID)

	res := onboardOne(t, svc, tenant, "Katherine Johnson", "EMP-GR-001")

	teachers := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM teacher WHERE id = $1`, res.TeacherID)
	outbox := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate = 'teacher' AND aggregate_id = $1`, res.TeacherID)
	audit := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE resource_type = 'teacher' AND action = 'teacher.onboarded' AND resource_id = $1`, res.TeacherID)

	assert.Equal(t, 1, teachers, "exactly one teacher row")
	assert.Equal(t, 1, outbox, "exactly one outbox[teacher] row for this aggregate")
	assert.Equal(t, 1, audit, "exactly one audit[teacher.onboarded] row for this aggregate")
}

// TestGoldenRuleRollback: a duplicate employee_code aborts the tx with no orphan rows.
func TestGoldenRuleRollback(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(onboarding.NewEngine(pool, nodeID))
	tenant := testdb.NewTenant(t, pool, nodeID)

	onboardOne(t, svc, tenant, "First Teacher", "EMP-DUP-001")

	outboxBefore := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate = 'teacher'`)
	auditBefore := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE resource_type = 'teacher'`)

	_, err := svc.Onboard(context.Background(), tenant.ID, tenant.Actor, OnboardInput{
		Name:         "Dup Teacher",
		EmployeeCode: "EMP-DUP-001",
	})
	require.Error(t, err, "duplicate employee code must be rejected")

	teacherCount := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM teacher WHERE deleted_at IS NULL`)
	outboxAfter := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate = 'teacher'`)
	auditAfter := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE resource_type = 'teacher'`)

	assert.Equal(t, 1, teacherCount, "only the first teacher persists")
	assert.Equal(t, outboxBefore, outboxAfter, "failed onboard left no orphan outbox row")
	assert.Equal(t, auditBefore, auditAfter, "failed onboard left no orphan audit row")
}
