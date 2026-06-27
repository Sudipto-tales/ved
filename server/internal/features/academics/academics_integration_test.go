//go:build integration

// Integration tests for the academics slice. The design care point is the APPEND-ONLY
// attendance ledger: a correction inserts a NEW row (it never updates), and the effective
// value is the latest-by-hlc. Plus RLS isolation on the structure tables.
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/academics/...)
package academics

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/features/teachers"
	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

// seedAcademicYear gives the tenant a current academic_year (sections/exams/enrollments
// resolve against it). Mirrors academics/provisioning.go.
func seedAcademicYear(t *testing.T, pool *pgxpool.Pool, tenant testdb.Tenant, nodeID uuid.UUID) {
	t.Helper()
	err := testdb.InTenant(context.Background(), pool, tenant.ID, func(tx pgx.Tx) error {
		_, err := tx.Exec(context.Background(),
			`INSERT INTO academic_year (id, tenant_id, name, start_date, end_date, is_current, hlc, version, origin_node_id)
			 VALUES ($1,$2,'2026-27','2026-04-01','2027-03-31',true,$3,1,$4)`,
			uuid.Must(uuid.NewV7()), tenant.ID, onboarding.NowHLC(), nodeID)
		return err
	})
	require.NoError(t, err, "seed academic_year")
}

func TestAttendanceIsAppendOnlyLatestWins(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenant := testdb.NewTenant(t, pool, nodeID)
	seedAcademicYear(t, pool, tenant, nodeID)

	ctx := context.Background()

	// A real student to enroll (enrollment FKs to student).
	studentSvc := students.NewService(students.NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))
	sres, err := studentSvc.Onboard(ctx, tenant.ID, tenant.Actor, students.OnboardInput{Name: "Pat Pupil", AdmissionNo: "ADM-AC-001"})
	require.NoError(t, err)

	// attendance_event.marked_by FKs to teacher(id) — onboard a real teacher to mark.
	teacherSvc := teachers.NewService(onboarding.NewEngine(pool, nodeID))
	tres, err := teacherSvc.Onboard(ctx, tenant.ID, tenant.Actor, teachers.OnboardInput{Name: "Tess Teacher"})
	require.NoError(t, err)

	svc := NewService(pool, onboarding.NewEngine(pool, nodeID))
	programID, err := svc.CreateProgram(ctx, tenant.ID, tenant.Actor, "Primary", "PRI")
	require.NoError(t, err)
	stageID, err := svc.CreateStage(ctx, tenant.ID, tenant.Actor, programID, "Grade 1", 1)
	require.NoError(t, err)
	sectionID, err := svc.CreateSection(ctx, tenant.ID, tenant.Actor, stageID, "A", nil)
	require.NoError(t, err)
	enrollID, err := svc.Enroll(ctx, tenant.ID, tenant.Actor, sectionID, sres.StudentID, "1")
	require.NoError(t, err)

	const date = "2026-06-16"
	require.NoError(t, svc.MarkAttendance(ctx, tenant.ID, tenant.Actor, sectionID, tres.TeacherID, date,
		[]AttendanceEntry{{EnrollmentID: enrollID, Status: "PRESENT"}}))
	// Correction: a NEW row, not an update.
	require.NoError(t, svc.MarkAttendance(ctx, tenant.ID, tenant.Actor, sectionID, tres.TeacherID, date,
		[]AttendanceEntry{{EnrollmentID: enrollID, Status: "ABSENT"}}))

	rows := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM attendance_event WHERE enrollment_id = $1`, enrollID)
	assert.Equal(t, 2, rows, "both marks are preserved (append-only; correction is a new row)")

	eff, err := svc.GetAttendance(ctx, tenant.ID, sectionID, date)
	require.NoError(t, err)
	require.Len(t, eff, 1, "one effective row per enrollment (latest-by-hlc dedup)")
	assert.Equal(t, "ABSENT", eff[0]["status"], "the correction supersedes the original")
}

func TestRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenantA := testdb.NewTenant(t, pool, nodeID)
	tenantB := testdb.NewTenant(t, pool, nodeID)

	svc := NewService(pool, onboarding.NewEngine(pool, nodeID))
	progA, err := svc.CreateProgram(context.Background(), tenantA.ID, tenantA.Actor, "Primary", "PRI")
	require.NoError(t, err)
	_, err = svc.CreateProgram(context.Background(), tenantB.ID, tenantB.Actor, "Secondary", "SEC")
	require.NoError(t, err)

	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM program WHERE deleted_at IS NULL`),
		"tenant A sees its own 1 program")
	assert.Equal(t, 0, testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM program WHERE id = $1`, progA),
		"tenant B must NOT see tenant A's program")
}
