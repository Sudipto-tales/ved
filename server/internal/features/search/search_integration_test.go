//go:build integration

// Integration tests for the global-search slice — the two guarantees the feature
// rests on, proven against a real Postgres as the ved_app role:
//
//  1. RLS isolation — a search in tenant A returns ONLY tenant A's rows.
//  2. Permission scoping — an entity is searched ONLY if the caller's PermSet holds
//     its `.read`. A caller with student.read but not teacher.read never sees teacher
//     hits, even when ?types=teacher is forced (the client cannot widen scope).
//     tenant.admin (the wildcard) sees every entity.
//
// Run: ./ved.sh test  (or: go test -tags=integration ./internal/features/search/...)
package search

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/features/teachers"
	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

func seedStudent(t *testing.T, svc *students.Service, tn testdb.Tenant, name, admissionNo string) {
	t.Helper()
	_, err := svc.Onboard(context.Background(), tn.ID, tn.Actor, students.OnboardInput{
		Name:        name,
		AdmissionNo: admissionNo,
		Guardians: []students.GuardianInput{
			{Name: "Parent " + name, Phone: "555-0100", Relation: "FATHER", IsPrimary: true, CanPay: true},
		},
	})
	require.NoError(t, err, "seed student")
}

func seedTeacher(t *testing.T, svc *teachers.Service, tn testdb.Tenant, name, code string) {
	t.Helper()
	_, err := svc.Onboard(context.Background(), tn.ID, tn.Actor, teachers.OnboardInput{
		Name:         name,
		EmployeeCode: code,
	})
	require.NoError(t, err, "seed teacher")
}

// adminPerms is the wildcard PermSet (School Admin) — Has() short-circuits to true.
func adminPerms() authz.PermSet { return authz.PermSet{authz.TenantAdmin: {}} }

// TestSearchRLSIsolation: a search scoped to tenant A never returns tenant B's rows.
func TestSearchRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	stuSvc := students.NewService(students.NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))
	searchSvc := NewService(pool)

	a := testdb.NewTenant(t, pool, nodeID)
	b := testdb.NewTenant(t, pool, nodeID)

	seedStudent(t, stuSvc, a, "Ada Lovelace", "ADMX-A-001")
	seedStudent(t, stuSvc, a, "Alan Turing", "ADMX-A-002")
	seedStudent(t, stuSvc, b, "Grace Hopper", "ADMX-B-001")

	ctx := context.Background()

	resA, err := searchSvc.Search(ctx, a.ID, adminPerms(), nil, "ADMX-A", 10)
	require.NoError(t, err)
	assert.Len(t, resA.Groups["student"], 2, "tenant A sees its own 2 matching students")

	// Tenant B searching A's admission prefix sees nothing (RLS).
	resB, err := searchSvc.Search(ctx, b.ID, adminPerms(), nil, "ADMX-A", 10)
	require.NoError(t, err)
	assert.Empty(t, resB.Groups["student"], "tenant B must NOT see tenant A's students")
}

// TestSearchPermissionScoping: the result set is bounded by the caller's permissions,
// and the client's types filter can only narrow it, never widen it.
func TestSearchPermissionScoping(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	engine := onboarding.NewEngine(pool, nodeID)
	stuSvc := students.NewService(students.NewRepo(pool, nodeID), engine)
	teaSvc := teachers.NewService(engine)
	searchSvc := NewService(pool)

	tn := testdb.NewTenant(t, pool, nodeID)
	seedStudent(t, stuSvc, tn, "Sam Student", "ADMX-S-100")
	seedTeacher(t, teaSvc, tn, "Tina Teacher", "EMPX-T-100")

	ctx := context.Background()

	// Caller with student.read but NOT teacher.read.
	studentOnly := authz.PermSet{"student.read": {}}

	// Sees students…
	r1, err := searchSvc.Search(ctx, tn.ID, studentOnly, nil, "ADMX-S", 10)
	require.NoError(t, err)
	assert.Len(t, r1.Groups["student"], 1, "student.read caller sees students")

	// …but never teachers, even though a matching teacher exists.
	r2, err := searchSvc.Search(ctx, tn.ID, studentOnly, nil, "EMPX-T", 10)
	require.NoError(t, err)
	assert.NotContains(t, r2.Groups, "teacher", "no teacher.read ⇒ no teacher hits")

	// Forcing ?types=teacher cannot widen scope past the missing permission.
	r3, err := searchSvc.Search(ctx, tn.ID, studentOnly, []string{"teacher"}, "EMPX-T", 10)
	require.NoError(t, err)
	assert.NotContains(t, r3.Groups, "teacher", "client cannot widen scope via types=")
	assert.Empty(t, r3.Groups, "narrowed to a forbidden type ⇒ no groups at all")

	// tenant.admin (wildcard) sees the teacher.
	r4, err := searchSvc.Search(ctx, tn.ID, adminPerms(), nil, "EMPX-T", 10)
	require.NoError(t, err)
	assert.Len(t, r4.Groups["teacher"], 1, "tenant.admin sees teachers")
}

// TestSearchMinQueryLength: queries shorter than 2 chars return empty without touching the DB.
func TestSearchMinQueryLength(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	searchSvc := NewService(pool)
	tn := testdb.NewTenant(t, pool, nodeID)

	res, err := searchSvc.Search(context.Background(), tn.ID, adminPerms(), nil, "a", 10)
	require.NoError(t, err)
	assert.Empty(t, res.Groups, "1-char query returns no groups")
}
