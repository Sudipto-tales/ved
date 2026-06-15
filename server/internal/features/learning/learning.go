// Package learning is the M8 LMS slice (docs/database/07-lms.md, docs/19-lms.md): the
// staged growth of academics from RECORDING learning to DELIVERING it. T3a (assignments,
// materials) + T3b (submission → grading). Everything anchors on teaching_assignment.
//
// Two append-only invariants (docs/08): submission and grade are immutable — a
// resubmission is a NEW row (latest wins), a re-grade is a NEW row. Files store only a
// MinIO storage_key; bytes never cross the bus. The integration point: grading an
// assignment that has max_marks writes an append-only mark_entry in academics in the SAME
// transaction — LMS feeds the ONE marks ledger, not a parallel one (LMS is academics'
// growth, not an arms-length peer, so this slice writes mark_entry directly).
package learning

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
	ErrNotStudent   = errors.New("caller is not a student")
	ErrInvalidInput = errors.New("invalid input")
)

type Service struct {
	engine *onboarding.Engine
}

func NewService(engine *onboarding.Engine) *Service { return &Service{engine: engine} }

// ---- T3a: assignments + materials ------------------------------------------------

func (s *Service) CreateAssignment(ctx context.Context, tenantID, actor, taID uuid.UUID, title, instructions, dueAt string, maxMarks *float64) (uuid.UUID, error) {
	if title == "" || taID == uuid.Nil {
		return uuid.Nil, fmt.Errorf("%w: teaching_assignment_id and title required", ErrInvalidInput)
	}
	id := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO assignment (id, tenant_id, teaching_assignment_id, title, instructions, due_at, max_marks, status, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,'PUBLISHED',$8,$9,1,$10)`,
			id, tenantID, taID, title, onboarding.NullString(instructions), nullTime(dueAt), maxMarks, onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert assignment: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"id": id, "teaching_assignment_id": taID, "title": title})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "assignment", id, "assignment.published", actor, b, hlc)
	})
	return id, err
}

func (s *Service) ListAssignments(ctx context.Context, tenantID, taID uuid.UUID) ([]map[string]any, error) {
	out := []map[string]any{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, title, due_at, max_marks, status FROM assignment
			  WHERE teaching_assignment_id=$1 AND deleted_at IS NULL ORDER BY assigned_at DESC`, taID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id uuid.UUID
			var title, status string
			var due *time.Time
			var mm *float64
			if err := rows.Scan(&id, &title, &due, &mm, &status); err != nil {
				return err
			}
			m := map[string]any{"id": id, "title": title, "status": status, "max_marks": mm}
			if due != nil {
				m["due_at"] = due.Format(time.RFC3339)
			}
			out = append(out, m)
		}
		return rows.Err()
	})
	return out, err
}

func (s *Service) AddMaterial(ctx context.Context, tenantID, actor, assignmentID uuid.UUID, title, kind, storageKey, url, body string) (uuid.UUID, error) {
	if kind == "" {
		kind = "NOTE"
	}
	id := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var taID uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT teaching_assignment_id FROM assignment WHERE id=$1 AND deleted_at IS NULL`, assignmentID).Scan(&taID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO material (id, tenant_id, teaching_assignment_id, assignment_id, title, kind, storage_key, url, body, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12)`,
			id, tenantID, taID, assignmentID, title, kind, onboarding.NullString(storageKey), onboarding.NullString(url), onboarding.NullString(body), onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert material: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"id": id, "assignment_id": assignmentID, "kind": kind})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "material", id, "material.published", actor, b, hlc)
	})
	return id, err
}

// ---- T3b: submission (append-only) -----------------------------------------------

type SubmissionFile struct {
	StorageKey string `json:"storage_key"`
	Filename   string `json:"filename"`
	Size       int64  `json:"size"`
}

// Submit records a student's work as a NEW append-only row (a resubmission never edits the
// prior one). LATE is derived from assignment.due_at. The student is resolved from the
// caller's membership — self-service, no staff permission.
func (s *Service) Submit(ctx context.Context, tenantID, callerMembership, assignmentID uuid.UUID, files []SubmissionFile) (uuid.UUID, string, error) {
	subID := uuid.Must(uuid.NewV7())
	var status string
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var studentID uuid.UUID
		err := tx.QueryRow(ctx, `SELECT id FROM student WHERE membership_id=$1 AND deleted_at IS NULL`, callerMembership).Scan(&studentID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotStudent
		}
		if err != nil {
			return err
		}
		var due *time.Time
		if err := tx.QueryRow(ctx, `SELECT due_at FROM assignment WHERE id=$1 AND deleted_at IS NULL`, assignmentID).Scan(&due); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		var prior bool
		_ = tx.QueryRow(ctx, `SELECT true FROM submission WHERE assignment_id=$1 AND student_id=$2 LIMIT 1`, assignmentID, studentID).Scan(&prior)

		now := time.Now()
		switch {
		case due != nil && now.After(*due):
			status = "LATE"
		case prior:
			status = "RESUBMITTED"
		default:
			status = "SUBMITTED"
		}
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO submission (id, tenant_id, assignment_id, student_id, status, created_by, hlc, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			subID, tenantID, assignmentID, studentID, status, onboarding.NilUUID(callerMembership), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert submission: %w", err)
		}
		for _, f := range files {
			if f.StorageKey == "" {
				continue
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO submission_file (id, tenant_id, submission_id, storage_key, filename, size, created_by, hlc, origin_node_id)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
				uuid.Must(uuid.NewV7()), tenantID, subID, f.StorageKey, onboarding.NullString(f.Filename), f.Size, onboarding.NilUUID(callerMembership), hlc, s.engine.NodeID()); err != nil {
				return fmt.Errorf("insert submission_file: %w", err)
			}
		}
		b, _ := json.Marshal(map[string]any{"submission_id": subID, "assignment_id": assignmentID, "student_id": studentID, "status": status})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "submission", subID, "submission.created", callerMembership, b, hlc)
	})
	return subID, status, err
}

// Grade appends a grade (immutable) and — if the assignment has max_marks — writes a
// matching append-only mark_entry into academics, in the SAME transaction. A re-grade is a
// new grade row + a new mark_entry; the latest of each is effective.
func (s *Service) Grade(ctx context.Context, tenantID, actor, submissionID uuid.UUID, marks float64, feedback string) (uuid.UUID, error) {
	gid := uuid.Must(uuid.NewV7())
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		// Resolve the submission → assignment → teaching_assignment context.
		var studentID, assignmentID, subjectID, teacherID uuid.UUID
		var maxMarks *float64
		err := tx.QueryRow(ctx,
			`SELECT sub.student_id, a.id, a.max_marks, ta.subject_id, ta.teacher_id
			   FROM submission sub
			   JOIN assignment a            ON a.id = sub.assignment_id
			   JOIN teaching_assignment ta  ON ta.id = a.teaching_assignment_id
			  WHERE sub.id=$1`, submissionID).Scan(&studentID, &assignmentID, &maxMarks, &subjectID, &teacherID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO grade (id, tenant_id, submission_id, marks, feedback, graded_by, created_by, hlc, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)`,
			gid, tenantID, submissionID, marks, onboarding.NullString(feedback), onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			return fmt.Errorf("insert grade: %w", err)
		}
		// Integration point: a graded assignment with max_marks feeds the ONE marks ledger.
		if maxMarks != nil {
			if _, err := tx.Exec(ctx,
				`INSERT INTO mark_entry (id, tenant_id, assignment_id, student_id, subject_id, marks, graded_by, created_by, hlc, origin_node_id)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				uuid.Must(uuid.NewV7()), tenantID, assignmentID, studentID, subjectID, marks, teacherID, onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
				return fmt.Errorf("insert mark_entry from grade: %w", err)
			}
		}
		b, _ := json.Marshal(map[string]any{"grade_id": gid, "submission_id": submissionID, "marks": marks, "fed_marks": maxMarks != nil})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "grade", gid, "submission.graded", actor, b, hlc)
	})
	return gid, err
}

// ListSubmissions returns the latest submission per student for an assignment + its latest grade.
func (s *Service) ListSubmissions(ctx context.Context, tenantID, assignmentID uuid.UUID) ([]map[string]any, error) {
	out := []map[string]any{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT DISTINCT ON (sub.student_id) sub.id, sub.student_id, u.login_identifier, sub.status, sub.submitted_at, g.marks
			   FROM submission sub
			   JOIN student st     ON st.id = sub.student_id
			   JOIN memberships m  ON m.id = st.membership_id
			   JOIN users u        ON u.id = m.user_id
			   LEFT JOIN LATERAL (
			       SELECT marks FROM grade g WHERE g.submission_id = sub.id ORDER BY g.graded_at DESC, g.hlc DESC LIMIT 1
			   ) g ON true
			  WHERE sub.assignment_id=$1
			  ORDER BY sub.student_id, sub.submitted_at DESC, sub.hlc DESC`, assignmentID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id, studentID uuid.UUID
			var login, status string
			var submittedAt time.Time
			var marks *float64
			if err := rows.Scan(&id, &studentID, &login, &status, &submittedAt, &marks); err != nil {
				return err
			}
			out = append(out, map[string]any{
				"submission_id": id, "student_id": studentID, "student": onboarding.NameFromHandle(login),
				"status": status, "submitted_at": submittedAt.Format(time.RFC3339), "marks": marks,
			})
		}
		return rows.Err()
	})
	return out, err
}

// ---- HTTP ------------------------------------------------------------------------

func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, res *authz.Resolver) {
	svc := NewService(onboarding.NewEngine(pool, nodeID))
	manage := authz.Require(res, "academics.manage")

	r.With(manage).Post("/api/v1/learning/assignments", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			TeachingAssignmentID uuid.UUID `json:"teaching_assignment_id"`
			Title                string    `json:"title"`
			Instructions         string    `json:"instructions"`
			DueAt                string    `json:"due_at"`
			MaxMarks             *float64  `json:"max_marks"`
		}
		if decode(w, req, &in) != nil {
			return
		}
		id, err := svc.CreateAssignment(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.TeachingAssignmentID, in.Title, in.Instructions, in.DueAt, in.MaxMarks)
		respond(w, "assignment_id", id, err)
	})

	r.With(manage).Get("/api/v1/learning/teaching-assignments/{taId}/assignments", func(w http.ResponseWriter, req *http.Request) {
		taID, err := uuid.Parse(chi.URLParam(req, "taId"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid teaching assignment id")
			return
		}
		list, err := svc.ListAssignments(req.Context(), httpx.TenantID(req.Context()), taID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"assignments": list})
	})

	r.With(manage).Post("/api/v1/learning/assignments/{id}/materials", func(w http.ResponseWriter, req *http.Request) {
		aid, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid assignment id")
			return
		}
		var in struct{ Title, Kind, StorageKey, URL, Body string }
		if decode(w, req, &in) != nil {
			return
		}
		id, e := svc.AddMaterial(req.Context(), httpx.TenantID(req.Context()), actorID(req), aid, in.Title, in.Kind, in.StorageKey, in.URL, in.Body)
		respond(w, "material_id", id, e)
	})

	// Student self-service (no permission gate; the handler resolves the student).
	r.Post("/api/v1/learning/assignments/{id}/submit", func(w http.ResponseWriter, req *http.Request) {
		aid, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid assignment id")
			return
		}
		var in struct {
			Files []SubmissionFile `json:"files"`
		}
		_ = json.NewDecoder(req.Body).Decode(&in)
		subID, status, err := svc.Submit(req.Context(), httpx.TenantID(req.Context()), actorID(req), aid, in.Files)
		if err != nil {
			writeErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, map[string]any{"submission_id": subID, "status": status})
	})

	r.With(authz.Require(res, "marks.enter")).Post("/api/v1/learning/submissions/{id}/grade", func(w http.ResponseWriter, req *http.Request) {
		sid, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid submission id")
			return
		}
		var in struct {
			Marks    float64 `json:"marks"`
			Feedback string  `json:"feedback"`
		}
		if decode(w, req, &in) != nil {
			return
		}
		id, e := svc.Grade(req.Context(), httpx.TenantID(req.Context()), actorID(req), sid, in.Marks, in.Feedback)
		respond(w, "grade_id", id, e)
	})

	r.With(manage).Get("/api/v1/learning/assignments/{id}/submissions", func(w http.ResponseWriter, req *http.Request) {
		aid, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid assignment id")
			return
		}
		list, err := svc.ListSubmissions(req.Context(), httpx.TenantID(req.Context()), aid)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"submissions": list})
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

func respond(w http.ResponseWriter, key string, id uuid.UUID, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{key: id})
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
	case errors.Is(err, ErrNotStudent):
		httpx.Error(w, http.StatusForbidden, "only a student can submit")
	case errors.Is(err, ErrInvalidInput):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}

func nullTime(s string) *time.Time {
	if s == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return &t
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return &t
	}
	return nil
}
