//go:build integration

// Integration tests for the students reference slice — the two invariants the whole
// platform rests on, proven automatically against a real Postgres (previously only
// curl+psql by hand):
//
//  1. RLS isolation — a tenant reads ONLY its own rows, enforced by the DB as ved_app.
//  2. The golden rule — student.onboard writes row + outbox + audit in ONE tx, and a
//     mid-tx failure rolls ALL of it back (no orphan outbox/audit).
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/students/...)
package students

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

// onboardOne admits a single student in the given tenant and returns the result.
func onboardOne(t *testing.T, svc *Service, tenant testdb.Tenant, name, admissionNo string) OnboardResult {
	t.Helper()
	res, err := svc.Onboard(context.Background(), tenant.ID, tenant.Actor, OnboardInput{
		Name:        name,
		AdmissionNo: admissionNo,
		Guardians: []GuardianInput{
			{Name: "Parent " + name, Phone: "555-0100", Relation: "FATHER", IsPrimary: true, CanPay: true},
		},
	})
	require.NoError(t, err, "onboard should succeed")
	return res
}

// TestRLSIsolation: students onboarded under tenant A are invisible to tenant B, and
// visible to A — enforced by RLS (the pool runs as ved_app / NOBYPASSRLS).
func TestRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))

	tenantA := testdb.NewTenant(t, pool, nodeID)
	tenantB := testdb.NewTenant(t, pool, nodeID)

	onboardOne(t, svc, tenantA, "Ada Lovelace", "ADM-A-001")
	onboardOne(t, svc, tenantA, "Alan Turing", "ADM-A-002")
	onboardOne(t, svc, tenantB, "Grace Hopper", "ADM-B-001")

	aFromA := testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM student WHERE deleted_at IS NULL`)
	bFromB := testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM student WHERE deleted_at IS NULL`)

	assert.Equal(t, 2, aFromA, "tenant A sees its own 2 students")
	assert.Equal(t, 1, bFromB, "tenant B sees its own 1 student")

	// Cross-tenant: A's admission numbers are invisible under B's RLS context (and vice versa).
	leakAintoB := testdb.CountInTenant(t, pool, tenantB.ID,
		`SELECT count(*) FROM student WHERE admission_no = $1`, "ADM-A-001")
	leakBintoA := testdb.CountInTenant(t, pool, tenantA.ID,
		`SELECT count(*) FROM student WHERE admission_no = $1`, "ADM-B-001")
	assert.Equal(t, 0, leakAintoB, "tenant B must NOT see tenant A's student")
	assert.Equal(t, 0, leakBintoA, "tenant A must NOT see tenant B's student")
}

// TestGoldenRuleAtomicity: one student.onboard ⇒ exactly 1 student + 1 outbox
// [student.enrolled] + 1 audit, all committed together.
func TestGoldenRuleAtomicity(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))
	tenant := testdb.NewTenant(t, pool, nodeID)

	res := onboardOne(t, svc, tenant, "John Doe", "ADM-GR-001")

	students := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM student WHERE id = $1`, res.StudentID)
	outbox := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate = 'student' AND aggregate_id = $1`, res.StudentID)
	audit := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE resource_type = 'student' AND action = 'student.enrolled' AND resource_id = $1`, res.StudentID)

	assert.Equal(t, 1, students, "exactly one student row")
	assert.Equal(t, 1, outbox, "exactly one outbox[student] row for this aggregate")
	assert.Equal(t, 1, audit, "exactly one audit[student.enrolled] row for this aggregate")
}

// TestGoldenRuleRollback: a failing onboard (duplicate admission number) must leave NO
// trace — no student, and critically no orphan outbox/audit row from the aborted tx.
func TestGoldenRuleRollback(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))
	tenant := testdb.NewTenant(t, pool, nodeID)

	onboardOne(t, svc, tenant, "First Student", "ADM-DUP-001")

	// Baseline counts after the one good onboard.
	outboxBefore := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate = 'student'`)
	auditBefore := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE resource_type = 'student'`)

	// Second onboard reuses the admission number → must fail and roll back atomically.
	_, err := svc.Onboard(context.Background(), tenant.ID, tenant.Actor, OnboardInput{
		Name:        "Dup Student",
		AdmissionNo: "ADM-DUP-001",
	})
	require.Error(t, err, "duplicate admission number must be rejected")

	studentCount := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM student WHERE deleted_at IS NULL`)
	outboxAfter := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate = 'student'`)
	auditAfter := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE resource_type = 'student'`)

	assert.Equal(t, 1, studentCount, "only the first student persists")
	assert.Equal(t, outboxBefore, outboxAfter, "failed onboard left no orphan outbox row")
	assert.Equal(t, auditBefore, auditAfter, "failed onboard left no orphan audit row")
}
