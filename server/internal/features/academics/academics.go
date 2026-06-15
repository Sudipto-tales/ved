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

// ---- HTTP ------------------------------------------------------------------------

func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, res *authz.Resolver) {
	svc := NewService(pool, onboarding.NewEngine(pool, nodeID))
	manage := authz.Require(res, "academics.manage")

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
