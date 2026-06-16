//go:build integration

// Integration tests for the learning (LMS) slice. Proves the M8 design care points:
//   - submission + grade are APPEND-ONLY (resubmit/re-grade insert new rows, latest wins)
//   - grading an assignment with max_marks writes an append-only mark_entry into the ONE
//     academics marks ledger in the SAME tx (the marquee integration point)
//   - RLS isolation on assignments
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/learning/...)
package learning

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/academics"
	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/features/teachers"
	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

func seedAcademicYear(t *testing.T, pool *pgxpool.Pool, tenant testdb.Tenant, nodeID uuid.UUID) {
	t.Helper()
	require.NoError(t, testdb.InTenant(context.Background(), pool, tenant.ID, func(tx pgx.Tx) error {
		_, err := tx.Exec(context.Background(),
			`INSERT INTO academic_year (id, tenant_id, name, start_date, end_date, is_current, hlc, version, origin_node_id)
			 VALUES ($1,$2,'2026-27','2026-04-01','2027-03-31',true,$3,1,$4)`,
			uuid.Must(uuid.NewV7()), tenant.ID, onboarding.NowHLC(), nodeID)
		return err
	}))
}

// setupTeachingAssignment builds the full chain a learning assignment anchors on and
// returns (teachingAssignmentID, studentMembershipID).
func setupTeachingAssignment(t *testing.T, pool *pgxpool.Pool, tenant testdb.Tenant, nodeID uuid.UUID) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	eng := onboarding.NewEngine(pool, nodeID)
	seedAcademicYear(t, pool, tenant, nodeID)

	studentSvc := students.NewService(students.NewRepo(pool, nodeID), eng)
	sres, err := studentSvc.Onboard(ctx, tenant.ID, tenant.Actor, students.OnboardInput{Name: "Sam Student", AdmissionNo: "ADM-LRN-001"})
	require.NoError(t, err)

	teacherSvc := teachers.NewService(eng)
	tres, err := teacherSvc.Onboard(ctx, tenant.ID, tenant.Actor, teachers.OnboardInput{Name: "Tom Teacher"})
	require.NoError(t, err)

	ac := academics.NewService(pool, eng)
	programID, err := ac.CreateProgram(ctx, tenant.ID, tenant.Actor, "Primary", "PRI")
	require.NoError(t, err)
	stageID, err := ac.CreateStage(ctx, tenant.ID, tenant.Actor, programID, "Grade 1", 1)
	require.NoError(t, err)
	sectionID, err := ac.CreateSection(ctx, tenant.ID, tenant.Actor, stageID, "A", nil)
	require.NoError(t, err)
	subjectID, err := ac.CreateSubject(ctx, tenant.ID, tenant.Actor, "Math", "MATH", "THEORY")
	require.NoError(t, err)
	taID, err := ac.CreateTeachingAssignment(ctx, tenant.ID, tenant.Actor, sectionID, subjectID, tres.TeacherID)
	require.NoError(t, err)

	return taID, sres.MembershipID
}

func TestSubmitAndGradeAppendOnlyAndMarksLedger(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenant := testdb.NewTenant(t, pool, nodeID)
	taID, studentMembership := setupTeachingAssignment(t, pool, tenant, nodeID)

	ctx := context.Background()
	svc := NewService(onboarding.NewEngine(pool, nodeID))

	maxMarks := 100.0
	assignmentID, err := svc.CreateAssignment(ctx, tenant.ID, tenant.Actor, taID, "Homework 1", "Do it", "", &maxMarks)
	require.NoError(t, err)

	// Student submits, then resubmits → append-only (2 rows; SUBMITTED then RESUBMITTED).
	_, status1, err := svc.Submit(ctx, tenant.ID, studentMembership, assignmentID, []SubmissionFile{{StorageKey: "k1", Filename: "a.pdf", Size: 10}})
	require.NoError(t, err)
	assert.Equal(t, "SUBMITTED", status1)
	sub2, status2, err := svc.Submit(ctx, tenant.ID, studentMembership, assignmentID, []SubmissionFile{{StorageKey: "k2", Filename: "b.pdf", Size: 20}})
	require.NoError(t, err)
	assert.Equal(t, "RESUBMITTED", status2)

	subRows := testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM submission WHERE assignment_id = $1`, assignmentID)
	assert.Equal(t, 2, subRows, "both submissions preserved (append-only)")

	// Teacher grades the latest submission, then re-grades → append-only grade + mark_entry.
	_, err = svc.Grade(ctx, tenant.ID, tenant.Actor, sub2, 72, "good")
	require.NoError(t, err)
	_, err = svc.Grade(ctx, tenant.ID, tenant.Actor, sub2, 85, "after recheck")
	require.NoError(t, err)

	gradeRows := testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM grade WHERE submission_id = $1`, sub2)
	assert.Equal(t, 2, gradeRows, "both grades preserved (append-only)")

	// The marquee integration: each grade wrote a mark_entry into the academics ledger.
	markRows := testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM mark_entry WHERE assignment_id = $1`, assignmentID)
	assert.Equal(t, 2, markRows, "grading fed the ONE marks ledger (append-only mark_entry per grade)")

	// Effective view: latest grade wins.
	subs, err := svc.ListSubmissions(ctx, tenant.ID, assignmentID)
	require.NoError(t, err)
	require.Len(t, subs, 1, "latest submission per student")
	marks, ok := subs[0]["marks"].(*float64)
	require.True(t, ok && marks != nil, "latest submission carries its grade")
	assert.EqualValues(t, 85, *marks, "the re-grade supersedes the original")
}

func TestRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenantA := testdb.NewTenant(t, pool, nodeID)
	tenantB := testdb.NewTenant(t, pool, nodeID)

	taA, _ := setupTeachingAssignment(t, pool, tenantA, nodeID)
	svc := NewService(onboarding.NewEngine(pool, nodeID))
	aID, err := svc.CreateAssignment(context.Background(), tenantA.ID, tenantA.Actor, taA, "HW", "", "", nil)
	require.NoError(t, err)

	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM assignment WHERE deleted_at IS NULL`),
		"tenant A sees its own assignment")
	assert.Equal(t, 0, testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM assignment WHERE id = $1`, aID),
		"tenant B must NOT see tenant A's assignment")
}
