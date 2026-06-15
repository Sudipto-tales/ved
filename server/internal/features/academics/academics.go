// Package academics is the M5 academic-backbone slice (docs/database/05-academics.md,
// docs/17-academics-model.md). Structure (program → stage → subject/section/enrollment)
// is ordinary mutable config; the design CARE POINT is the two APPEND-ONLY ledgers —
// attendance_event and mark_entry. Corrections insert NEW rows (the latest by hlc wins);
// counts/averages are SUMMED on read, never stored; a DB trigger blocks UPDATE/DELETE.
//
// It reuses the shared kernel engine (onboarding.Engine) for the tenant-scoped tx, the
// outbox+audit writer, and HLC — the same rails every slice rides.
package academics

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/onboarding"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrNoYear       = errors.New("no current academic year")
	ErrInvalidInput = errors.New("invalid input")
)

type Service struct {
	pool   *pgxpool.Pool
	engine *onboarding.Engine
}

func NewService(pool *pgxpool.Pool, engine *onboarding.Engine) *Service {
	return &Service{pool: pool, engine: engine}
}

// currentYear returns the tenant's current academic_year id (within a tx).
func currentYear(ctx context.Context, tx pgx.Tx) (uuid.UUID, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM academic_year WHERE is_current AND deleted_at IS NULL`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNoYear
	}
	return id, err
}

// insertSimple inserts a tenant-scoped config row + outbox + audit in one tx.
func (s *Service) insertSimple(ctx context.Context, tenantID, actor uuid.UUID, aggregate, action string, build func(tx pgx.Tx, id uuid.UUID, hlc string) (map[string]any, error)) (uuid.UUID, error) {
	id := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		payload, err := build(tx, id, hlc)
		if err != nil {
			return err
		}
		b, _ := json.Marshal(payload)
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, aggregate, id, action, actor, b, hlc)
	})
	return id, err
}

// ---- Structure setup -------------------------------------------------------------

func (s *Service) CreateProgram(ctx context.Context, tenantID, actor uuid.UUID, name, code string) (uuid.UUID, error) {
	return s.insertSimple(ctx, tenantID, actor, "program", "program.create", func(tx pgx.Tx, id uuid.UUID, hlc string) (map[string]any, error) {
		_, err := tx.Exec(ctx,
			`INSERT INTO program (id, tenant_id, name, code, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,1,$7)`,
			id, tenantID, name, code, onboarding.NilUUID(actor), hlc, s.engine.NodeID())
		return map[string]any{"id": id, "name": name, "code": code}, err
	})
}

func (s *Service) CreateStage(ctx context.Context, tenantID, actor, programID uuid.UUID, name string, ordinal int) (uuid.UUID, error) {
	return s.insertSimple(ctx, tenantID, actor, "program_stage", "stage.create", func(tx pgx.Tx, id uuid.UUID, hlc string) (map[string]any, error) {
		_, err := tx.Exec(ctx,
			`INSERT INTO program_stage (id, tenant_id, program_id, name, ordinal, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8)`,
			id, tenantID, programID, name, ordinal, onboarding.NilUUID(actor), hlc, s.engine.NodeID())
		return map[string]any{"id": id, "program_id": programID, "name": name, "ordinal": ordinal}, err
	})
}

func (s *Service) CreateSubject(ctx context.Context, tenantID, actor uuid.UUID, name, code, kind string) (uuid.UUID, error) {
	if kind == "" {
		kind = "THEORY"
	}
	return s.insertSimple(ctx, tenantID, actor, "subject", "subject.create", func(tx pgx.Tx, id uuid.UUID, hlc string) (map[string]any, error) {
		_, err := tx.Exec(ctx,
			`INSERT INTO subject (id, tenant_id, name, code, kind, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8)`,
			id, tenantID, name, code, kind, onboarding.NilUUID(actor), hlc, s.engine.NodeID())
		return map[string]any{"id": id, "name": name, "code": code, "kind": kind}, err
	})
}

func (s *Service) CreateSection(ctx context.Context, tenantID, actor, stageID uuid.UUID, name string, capacity *int) (uuid.UUID, error) {
	id := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		year, err := currentYear(ctx, tx)
		if err != nil {
			return err
		}
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO section (id, tenant_id, program_stage_id, academic_year_id, name, capacity, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9)`,
			id, tenantID, stageID, year, name, capacity, onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert section: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"id": id, "program_stage_id": stageID, "name": name})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "section", id, "section.create", actor, b, hlc)
	})
	return id, err
}

func (s *Service) CreateExam(ctx context.Context, tenantID, actor uuid.UUID, name string, maxMarks float64) (uuid.UUID, error) {
	id := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		year, err := currentYear(ctx, tx)
		if err != nil {
			return err
		}
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO exam (id, tenant_id, academic_year_id, name, max_marks, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8)`,
			id, tenantID, year, name, maxMarks, onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert exam: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"id": id, "name": name, "max_marks": maxMarks})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "exam", id, "exam.create", actor, b, hlc)
	})
	return id, err
}

func (s *Service) Enroll(ctx context.Context, tenantID, actor, sectionID, studentID uuid.UUID, rollNo string) (uuid.UUID, error) {
	id := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var year uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT academic_year_id FROM section WHERE id=$1 AND deleted_at IS NULL`, sectionID).Scan(&year); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO enrollment (id, tenant_id, student_id, section_id, academic_year_id, roll_no, status, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$8,1,$9)`,
			id, tenantID, studentID, sectionID, year, onboarding.NullString(rollNo), onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert enrollment: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"id": id, "student_id": studentID, "section_id": sectionID})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "enrollment", id, "student.enrolled_section", actor, b, hlc)
	})
	return id, err
}

// CreateTeachingAssignment binds a teacher to a (section, subject) for the current year —
// the anchor every LMS row (assignment, material) hangs off (docs/database/07-lms.md).
func (s *Service) CreateTeachingAssignment(ctx context.Context, tenantID, actor, sectionID, subjectID, teacherID uuid.UUID) (uuid.UUID, error) {
	id := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var year uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT academic_year_id FROM section WHERE id=$1 AND deleted_at IS NULL`, sectionID).Scan(&year); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO teaching_assignment (id, tenant_id, section_id, subject_id, teacher_id, academic_year_id, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9)`,
			id, tenantID, sectionID, subjectID, teacherID, year, onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert teaching_assignment: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"id": id, "section_id": sectionID, "subject_id": subjectID, "teacher_id": teacherID})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "teaching_assignment", id, "teaching_assignment.create", actor, b, hlc)
	})
	return id, err
}

// ---- Append-only: attendance -----------------------------------------------------

type AttendanceEntry struct {
	EnrollmentID uuid.UUID `json:"enrollment_id"`
	Status       string    `json:"status"`
}

// MarkAttendance appends one attendance_event per entry (append-only) + one batch event +
// audit, in a single tx. A re-mark for the same (enrollment, date) is just another row.
func (s *Service) MarkAttendance(ctx context.Context, tenantID, actor, sectionID, markedBy uuid.UUID, date string, entries []AttendanceEntry) error {
	if len(entries) == 0 || date == "" {
		return fmt.Errorf("%w: section, date, entries required", ErrInvalidInput)
	}
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return fmt.Errorf("%w: date must be YYYY-MM-DD", ErrInvalidInput)
	}
	return s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		for _, e := range entries {
			if _, err := tx.Exec(ctx,
				`INSERT INTO attendance_event (id, tenant_id, enrollment_id, section_id, date, status, marked_by, created_by, hlc, origin_node_id)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				uuid.Must(uuid.NewV7()), tenantID, e.EnrollmentID, sectionID, d, e.Status, markedBy,
				onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
				return fmt.Errorf("insert attendance: %w", err)
			}
		}
		b, _ := json.Marshal(map[string]any{"section_id": sectionID, "date": date, "count": len(entries)})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "attendance", sectionID, "attendance.marked", actor, b, hlc)
	})
}

// GetAttendance returns the EFFECTIVE attendance for a section+date: the latest event per
// enrollment by hlc (corrections supersede).
func (s *Service) GetAttendance(ctx context.Context, tenantID, sectionID uuid.UUID, date string) ([]map[string]any, error) {
	out := []map[string]any{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT DISTINCT ON (enrollment_id) enrollment_id, status
			   FROM attendance_event
			  WHERE section_id=$1 AND date=$2
			  ORDER BY enrollment_id, hlc DESC`, sectionID, date)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var eid uuid.UUID
			var st string
			if err := rows.Scan(&eid, &st); err != nil {
				return err
			}
			out = append(out, map[string]any{"enrollment_id": eid, "status": st})
		}
		return rows.Err()
	})
	return out, err
}

// AttendanceSummary sums the latest-per-date events for an enrollment (derived, not stored).
func (s *Service) AttendanceSummary(ctx context.Context, tenantID, enrollmentID uuid.UUID) (map[string]int, error) {
	out := map[string]int{"PRESENT": 0, "ABSENT": 0, "LATE": 0, "EXCUSED": 0, "TOTAL": 0}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`WITH latest AS (
			   SELECT DISTINCT ON (date) date, status
			     FROM attendance_event WHERE enrollment_id=$1
			    ORDER BY date, hlc DESC)
			 SELECT status, count(*) FROM latest GROUP BY status`, enrollmentID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var st string
			var n int
			if err := rows.Scan(&st, &n); err != nil {
				return err
			}
			out[st] = n
			out["TOTAL"] += n
		}
		return rows.Err()
	})
	return out, err
}

// ---- Append-only: marks ----------------------------------------------------------

type MarkEntry struct {
	EnrollmentID uuid.UUID `json:"enrollment_id"`
	SubjectID    uuid.UUID `json:"subject_id"`
	Marks        float64   `json:"marks"`
}

// EnterMarks appends one mark_entry per entry (append-only) + one batch event + audit.
func (s *Service) EnterMarks(ctx context.Context, tenantID, actor, examID, gradedBy uuid.UUID, entries []MarkEntry) error {
	if len(entries) == 0 {
		return fmt.Errorf("%w: exam and entries required", ErrInvalidInput)
	}
	return s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		for _, e := range entries {
			if _, err := tx.Exec(ctx,
				`INSERT INTO mark_entry (id, tenant_id, exam_id, enrollment_id, subject_id, marks, graded_by, created_by, hlc, origin_node_id)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				uuid.Must(uuid.NewV7()), tenantID, examID, e.EnrollmentID, e.SubjectID, e.Marks, gradedBy,
				onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
				return fmt.Errorf("insert mark: %w", err)
			}
		}
		b, _ := json.Marshal(map[string]any{"exam_id": examID, "count": len(entries)})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "marks", examID, "marks.entered", actor, b, hlc)
	})
}

// GetMarks returns the EFFECTIVE marks for an enrollment in an exam: latest per subject by hlc.
func (s *Service) GetMarks(ctx context.Context, tenantID, examID, enrollmentID uuid.UUID) ([]map[string]any, error) {
	out := []map[string]any{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT DISTINCT ON (subject_id) subject_id, marks
			   FROM mark_entry WHERE exam_id=$1 AND enrollment_id=$2
			  ORDER BY subject_id, hlc DESC`, examID, enrollmentID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var sid uuid.UUID
			var m float64
			if err := rows.Scan(&sid, &m); err != nil {
				return err
			}
			out = append(out, map[string]any{"subject_id": sid, "marks": m})
		}
		return rows.Err()
	})
	return out, err
}

// ---- Read-only list queries (over the existing mutable structure tables) ----------
//
// Plain SELECTs run inside engine.WithTenant so RLS scopes every row to the caller's
// tenant (the pool connects as ved_app). They drive the academics setup screens.

func (s *Service) listMaps(ctx context.Context, tenantID uuid.UUID, query string, cols []string, args ...any) ([]map[string]any, error) {
	out := []map[string]any{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			vals, err := rows.Values()
			if err != nil {
				return err
			}
			m := make(map[string]any, len(cols))
			for i, c := range cols {
				m[c] = normalizeVal(vals[i])
			}
			out = append(out, m)
		}
		return rows.Err()
	})
	return out, err
}

// normalizeVal makes pgx's raw `rows.Values()` results JSON-safe: the pool registers no
// uuid type, so uuid columns come back as [16]byte (which would JSON-encode as a number
// array, breaking client-side ids/links) — convert them to canonical uuid strings; and
// numerics come back as pgtype.Numeric — convert to a float.
func normalizeVal(v any) any {
	switch t := v.(type) {
	case [16]byte:
		return uuid.UUID(t).String()
	case pgtype.Numeric:
		if f, err := t.Float64Value(); err == nil && f.Valid {
			return f.Float64
		}
		return nil
	default:
		return v
	}
}

func (s *Service) ListPrograms(ctx context.Context, tenantID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT id, name, code, enrollment_mode, status FROM program
		  WHERE deleted_at IS NULL ORDER BY name`,
		[]string{"id", "name", "code", "enrollment_mode", "status"})
}

func (s *Service) ListStages(ctx context.Context, tenantID, programID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT id, name, ordinal FROM program_stage
		  WHERE program_id=$1 AND deleted_at IS NULL ORDER BY ordinal`,
		[]string{"id", "name", "ordinal"}, programID)
}

func (s *Service) ListAllStages(ctx context.Context, tenantID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT ps.id, ps.name, ps.ordinal, ps.program_id, p.name AS program_name
		   FROM program_stage ps JOIN program p ON p.id = ps.program_id
		  WHERE ps.deleted_at IS NULL ORDER BY p.name, ps.ordinal`,
		[]string{"id", "name", "ordinal", "program_id", "program_name"})
}

func (s *Service) ListSubjects(ctx context.Context, tenantID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT id, name, code, kind FROM subject
		  WHERE deleted_at IS NULL ORDER BY name`,
		[]string{"id", "name", "code", "kind"})
}

func (s *Service) ListSections(ctx context.Context, tenantID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT sec.id, sec.name, sec.program_stage_id, sec.academic_year_id, sec.capacity,
		        ps.name AS stage_name, p.name AS program_name
		   FROM section sec
		   JOIN program_stage ps ON ps.id = sec.program_stage_id
		   JOIN program p        ON p.id  = ps.program_id
		  WHERE sec.deleted_at IS NULL ORDER BY p.name, ps.ordinal, sec.name`,
		[]string{"id", "name", "program_stage_id", "academic_year_id", "capacity", "stage_name", "program_name"})
}

func (s *Service) ListEnrollments(ctx context.Context, tenantID, sectionID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT e.id, e.student_id, e.roll_no, e.status, u.login_identifier
		   FROM enrollment e
		   JOIN student s     ON s.id = e.student_id
		   JOIN memberships m ON m.id = s.membership_id
		   JOIN users u       ON u.id = m.user_id
		  WHERE e.section_id=$1 AND e.deleted_at IS NULL
		  ORDER BY e.roll_no NULLS LAST, u.login_identifier`,
		[]string{"id", "student_id", "roll_no", "status", "login_identifier"}, sectionID)
}

func (s *Service) ListTeachingAssignments(ctx context.Context, tenantID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT id, section_id, subject_id, teacher_id FROM teaching_assignment
		  WHERE deleted_at IS NULL ORDER BY created_at DESC`,
		[]string{"id", "section_id", "subject_id", "teacher_id"})
}

func (s *Service) ListExams(ctx context.Context, tenantID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT id, name, max_marks FROM exam
		  WHERE deleted_at IS NULL ORDER BY created_at DESC`,
		[]string{"id", "name", "max_marks"})
}

func (s *Service) ListCurriculum(ctx context.Context, tenantID, stageID uuid.UUID) ([]map[string]any, error) {
	return s.listMaps(ctx, tenantID,
		`SELECT c.id, c.subject_id, c.requirement, sub.name AS subject_name, sub.code AS subject_code
		   FROM curriculum c JOIN subject sub ON sub.id = c.subject_id
		  WHERE c.program_stage_id=$1 AND c.deleted_at IS NULL
		  ORDER BY sub.name`,
		[]string{"id", "subject_id", "requirement", "subject_name", "subject_code"}, stageID)
}

// StudentAcademics returns a per-student academics summary for the student profile:
// the current enrollment (section + roll), the derived attendance tally (latest event
// per day, summed), and the effective exam marks (latest per exam×subject). Empty when
// the student isn't enrolled yet.
func (s *Service) StudentAcademics(ctx context.Context, tenantID, studentID uuid.UUID) (map[string]any, error) {
	out := map[string]any{"enrolled": false, "attendance": map[string]int{}, "marks": []map[string]any{}}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var enrollment uuid.UUID
		var section string
		var roll, status *string
		e := tx.QueryRow(ctx,
			`SELECT e.id, sec.name, e.roll_no, e.status
			   FROM enrollment e JOIN section sec ON sec.id = e.section_id
			  WHERE e.student_id=$1 AND e.deleted_at IS NULL
			  ORDER BY (e.status='ACTIVE') DESC, e.enrolled_at DESC LIMIT 1`, studentID).
			Scan(&enrollment, &section, &roll, &status)
		if errors.Is(e, pgx.ErrNoRows) {
			return nil // not enrolled — return the empty shell
		}
		if e != nil {
			return e
		}
		out["enrolled"] = true
		out["enrollment_id"] = enrollment.String()
		out["section_name"] = section
		out["roll_no"] = roll
		out["status"] = status

		// Attendance: latest event per date, counted by status (derived, never stored).
		att := map[string]int{"PRESENT": 0, "ABSENT": 0, "LATE": 0, "EXCUSED": 0, "TOTAL": 0}
		arows, err := tx.Query(ctx,
			`WITH latest AS (SELECT DISTINCT ON (date) date, status FROM attendance_event
			   WHERE enrollment_id=$1 ORDER BY date, hlc DESC)
			 SELECT status, count(*) FROM latest GROUP BY status`, enrollment)
		if err != nil {
			return err
		}
		for arows.Next() {
			var st string
			var n int
			if err := arows.Scan(&st, &n); err != nil {
				arows.Close()
				return err
			}
			att[st] = n
			att["TOTAL"] += n
		}
		arows.Close()
		out["attendance"] = att

		// Exam marks: latest entry per (exam, subject). (Assignment-sourced marks have a
		// NULL exam_id and are shown in the LMS, not here.)
		marks := []map[string]any{}
		mrows, err := tx.Query(ctx,
			`SELECT DISTINCT ON (me.exam_id, me.subject_id) ex.name, sub.name, me.marks, ex.max_marks
			   FROM mark_entry me
			   JOIN exam ex     ON ex.id = me.exam_id
			   JOIN subject sub ON sub.id = me.subject_id
			  WHERE me.enrollment_id=$1
			  ORDER BY me.exam_id, me.subject_id, me.hlc DESC`, enrollment)
		if err != nil {
			return err
		}
		for mrows.Next() {
			var exam, subject string
			var m, max float64
			if err := mrows.Scan(&exam, &subject, &m, &max); err != nil {
				mrows.Close()
				return err
			}
			marks = append(marks, map[string]any{"exam": exam, "subject": subject, "marks": m, "max_marks": max})
		}
		mrows.Close()
		if err := mrows.Err(); err != nil {
			return err
		}
		out["marks"] = marks
		return nil
	})
	return out, err
}

// ---- HTTP ------------------------------------------------------------------------

func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, res *authz.Resolver) {
	svc := NewService(pool, onboarding.NewEngine(pool, nodeID))
	manage := authz.Require(res, "academics.manage")

	// Student academics summary — gated student.read so the student profile page (also
	// student.read) can show enrollment/attendance/marks.
	r.With(authz.Require(res, "student.read")).Get("/api/v1/academics/students/{id}/academics",
		func(w http.ResponseWriter, req *http.Request) {
			sid, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid student id")
				return
			}
			res, err := svc.StudentAcademics(req.Context(), httpx.TenantID(req.Context()), sid)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, res)
		})

	r.With(manage).Post("/api/v1/academics/programs", func(w http.ResponseWriter, req *http.Request) {
		var in struct{ Name, Code string }
		if decode(w, req, &in) != nil || in.Name == "" || in.Code == "" {
			return
		}
		id, err := svc.CreateProgram(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.Name, in.Code)
		respond(w, id, err)
	})
	r.With(manage).Post("/api/v1/academics/programs/{id}/stages", func(w http.ResponseWriter, req *http.Request) {
		pid, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid program id")
			return
		}
		var in struct {
			Name    string `json:"name"`
			Ordinal int    `json:"ordinal"`
		}
		if decode(w, req, &in) != nil || in.Name == "" {
			return
		}
		id, e := svc.CreateStage(req.Context(), httpx.TenantID(req.Context()), actorID(req), pid, in.Name, in.Ordinal)
		respond(w, id, e)
	})
	r.With(manage).Post("/api/v1/academics/subjects", func(w http.ResponseWriter, req *http.Request) {
		var in struct{ Name, Code, Kind string }
		if decode(w, req, &in) != nil || in.Name == "" || in.Code == "" {
			return
		}
		id, e := svc.CreateSubject(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.Name, in.Code, in.Kind)
		respond(w, id, e)
	})
	r.With(manage).Post("/api/v1/academics/sections", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			ProgramStageID uuid.UUID `json:"program_stage_id"`
			Name           string    `json:"name"`
			Capacity       *int      `json:"capacity"`
		}
		if decode(w, req, &in) != nil || in.Name == "" {
			return
		}
		id, e := svc.CreateSection(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.ProgramStageID, in.Name, in.Capacity)
		respond(w, id, e)
	})
	r.With(manage).Post("/api/v1/academics/sections/{id}/enroll", func(w http.ResponseWriter, req *http.Request) {
		sid, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid section id")
			return
		}
		var in struct {
			StudentID uuid.UUID `json:"student_id"`
			RollNo    string    `json:"roll_no"`
		}
		if decode(w, req, &in) != nil {
			return
		}
		id, e := svc.Enroll(req.Context(), httpx.TenantID(req.Context()), actorID(req), sid, in.StudentID, in.RollNo)
		respond(w, id, e)
	})
	r.With(manage).Post("/api/v1/academics/teaching-assignments", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			SectionID uuid.UUID `json:"section_id"`
			SubjectID uuid.UUID `json:"subject_id"`
			TeacherID uuid.UUID `json:"teacher_id"`
		}
		if decode(w, req, &in) != nil {
			return
		}
		id, e := svc.CreateTeachingAssignment(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.SectionID, in.SubjectID, in.TeacherID)
		respond(w, id, e)
	})
	r.With(manage).Post("/api/v1/academics/exams", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			Name     string  `json:"name"`
			MaxMarks float64 `json:"max_marks"`
		}
		if decode(w, req, &in) != nil || in.Name == "" {
			return
		}
		id, e := svc.CreateExam(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.Name, in.MaxMarks)
		respond(w, id, e)
	})

	// Read-only structure lists (drive the academics setup screens).
	r.With(manage).Get("/api/v1/academics/programs", func(w http.ResponseWriter, req *http.Request) {
		list, err := svc.ListPrograms(req.Context(), httpx.TenantID(req.Context()))
		listResp(w, "programs", list, err)
	})
	r.With(manage).Get("/api/v1/academics/programs/{id}/stages", func(w http.ResponseWriter, req *http.Request) {
		pid, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid program id")
			return
		}
		list, e := svc.ListStages(req.Context(), httpx.TenantID(req.Context()), pid)
		listResp(w, "stages", list, e)
	})
	r.With(manage).Get("/api/v1/academics/program-stages", func(w http.ResponseWriter, req *http.Request) {
		list, err := svc.ListAllStages(req.Context(), httpx.TenantID(req.Context()))
		listResp(w, "stages", list, err)
	})
	r.With(manage).Get("/api/v1/academics/subjects", func(w http.ResponseWriter, req *http.Request) {
		list, err := svc.ListSubjects(req.Context(), httpx.TenantID(req.Context()))
		listResp(w, "subjects", list, err)
	})
	r.With(manage).Get("/api/v1/academics/sections", func(w http.ResponseWriter, req *http.Request) {
		list, err := svc.ListSections(req.Context(), httpx.TenantID(req.Context()))
		listResp(w, "sections", list, err)
	})
	r.With(manage).Get("/api/v1/academics/sections/{id}/enrollments", func(w http.ResponseWriter, req *http.Request) {
		sid, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid section id")
			return
		}
		list, e := svc.ListEnrollments(req.Context(), httpx.TenantID(req.Context()), sid)
		listResp(w, "enrollments", list, e)
	})
	r.With(manage).Get("/api/v1/academics/teaching-assignments", func(w http.ResponseWriter, req *http.Request) {
		list, err := svc.ListTeachingAssignments(req.Context(), httpx.TenantID(req.Context()))
		listResp(w, "teaching_assignments", list, err)
	})
	r.With(manage).Get("/api/v1/academics/exams", func(w http.ResponseWriter, req *http.Request) {
		list, err := svc.ListExams(req.Context(), httpx.TenantID(req.Context()))
		listResp(w, "exams", list, err)
	})
	r.With(manage).Get("/api/v1/academics/curriculum", func(w http.ResponseWriter, req *http.Request) {
		sid, err := uuid.Parse(req.URL.Query().Get("program_stage_id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid program_stage_id")
			return
		}
		list, e := svc.ListCurriculum(req.Context(), httpx.TenantID(req.Context()), sid)
		listResp(w, "curriculum", list, e)
	})

	// Append-only: attendance.
	r.With(authz.Require(res, "attendance.mark")).Post("/api/v1/academics/attendance", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			SectionID uuid.UUID         `json:"section_id"`
			MarkedBy  uuid.UUID         `json:"marked_by"`
			Date      string            `json:"date"`
			Entries   []AttendanceEntry `json:"entries"`
		}
		if decode(w, req, &in) != nil {
			return
		}
		if err := svc.MarkAttendance(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.SectionID, in.MarkedBy, in.Date, in.Entries); err != nil {
			writeErr(w, err)
			return
		}
		w.WriteHeader(http.StatusCreated)
	})
	r.With(authz.Require(res, "attendance.mark")).Get("/api/v1/academics/attendance", func(w http.ResponseWriter, req *http.Request) {
		sid, _ := uuid.Parse(req.URL.Query().Get("section_id"))
		date := req.URL.Query().Get("date")
		list, err := svc.GetAttendance(req.Context(), httpx.TenantID(req.Context()), sid, date)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"attendance": list})
	})
	r.With(authz.Require(res, "attendance.mark")).Get("/api/v1/academics/attendance/summary", func(w http.ResponseWriter, req *http.Request) {
		eid, _ := uuid.Parse(req.URL.Query().Get("enrollment_id"))
		sum, err := svc.AttendanceSummary(req.Context(), httpx.TenantID(req.Context()), eid)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, sum)
	})

	// Append-only: marks.
	r.With(authz.Require(res, "marks.enter")).Post("/api/v1/academics/marks", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			ExamID   uuid.UUID   `json:"exam_id"`
			GradedBy uuid.UUID   `json:"graded_by"`
			Entries  []MarkEntry `json:"entries"`
		}
		if decode(w, req, &in) != nil {
			return
		}
		if err := svc.EnterMarks(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.ExamID, in.GradedBy, in.Entries); err != nil {
			writeErr(w, err)
			return
		}
		w.WriteHeader(http.StatusCreated)
	})
	r.With(authz.Require(res, "marks.enter")).Get("/api/v1/academics/marks", func(w http.ResponseWriter, req *http.Request) {
		eid, _ := uuid.Parse(req.URL.Query().Get("enrollment_id"))
		xid, _ := uuid.Parse(req.URL.Query().Get("exam_id"))
		list, err := svc.GetMarks(req.Context(), httpx.TenantID(req.Context()), xid, eid)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"marks": list})
	})
}

// ---- helpers ---------------------------------------------------------------------

func decode(w http.ResponseWriter, req *http.Request, v any) error {
	if err := json.NewDecoder(req.Body).Decode(v); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return err
	}
	return nil
}

func listResp(w http.ResponseWriter, key string, list []map[string]any, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{key: list})
}

func respond(w http.ResponseWriter, id uuid.UUID, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id})
}

func actorID(req *http.Request) uuid.UUID {
	ident, ok := httpx.IdentityFrom(req.Context())
	if !ok {
		return uuid.Nil
	}
	tenantID := httpx.TenantID(req.Context())
	for _, m := range ident.Memberships {
		if m.TenantID == tenantID {
			return m.MembershipID
		}
	}
	return uuid.Nil
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not found")
	case errors.Is(err, ErrNoYear):
		httpx.Error(w, http.StatusFailedDependency, "no current academic year")
	case errors.Is(err, ErrInvalidInput):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}
