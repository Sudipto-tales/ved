// Package guardian is the guardian PORTAL read-API (docs/18-guardian-portal.md, flow C in
// docs/20). It owns no domain tables: it is a child-scoped projection over students,
// academics, and finance. The security boundary — a guardian sees ONLY their own children
// — is enforced here at the query layer (resolve guardian_id → restrict to the
// guardian_student set) AND by Postgres RLS underneath (tenant isolation), the same
// defence-in-depth as everywhere else. It reuses the academics/finance services rather
// than reaching into their tables (the slice-bridge rule, docs/04).
package guardian

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/features/academics"
	"github.com/weloin/ved/internal/features/finance"
	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/onboarding"
)

var (
	// ErrNotGuardian — the caller's membership is not linked to a guardian record.
	ErrNotGuardian = errors.New("not a guardian")
	// ErrForbidden — the requested child is not linked to this guardian.
	ErrForbidden = errors.New("not your child")
	// ErrCannotPay — the (guardian, child) link does not carry can_pay.
	ErrCannotPay = errors.New("not permitted to pay for this child")
	// ErrInvalidInput — a malformed T2 write request.
	ErrInvalidInput = errors.New("invalid input")
	// ErrNotFound — the request row does not exist (or is already decided).
	ErrNotFound = errors.New("not found")
)

type Child struct {
	StudentID   uuid.UUID `json:"student_id"`
	Name        string    `json:"name"`
	AdmissionNo string    `json:"admission_no"`
	Relation    string    `json:"relation"`
	IsPrimary   bool      `json:"is_primary"`
	CanPay      bool      `json:"can_pay"`
}

// ---- Tier-2 guarded-write wire shapes (docs/18) ----------------------------------

// PayInput is a simulated online fee payment for a child (no real gateway locally).
type PayInput struct {
	Amount float64 `json:"amount"`
	Method string  `json:"method,omitempty"` // defaults to ONLINE
}

// LeaveInput is a guardian's child-absence request, decided by a teacher.
type LeaveInput struct {
	FromDate string `json:"from_date"` // YYYY-MM-DD
	ToDate   string `json:"to_date"`   // YYYY-MM-DD
	Reason   string `json:"reason"`
}

// ContactInput proposes new contact details for the guardian's own record (maker-checker).
type ContactInput struct {
	Phone   string          `json:"phone,omitempty"`
	Email   string          `json:"email,omitempty"`
	Address json.RawMessage `json:"address,omitempty"`
}

// DecisionInput is a staff approve/reject of a pending request.
type DecisionInput struct {
	Approve bool   `json:"approve"`
	Note    string `json:"note,omitempty"`
}

// LeaveRequestRow is one leave request (guardian history + staff review queue).
type LeaveRequestRow struct {
	ID          uuid.UUID `json:"id"`
	StudentID   uuid.UUID `json:"student_id"`
	StudentName string    `json:"student_name"`
	FromDate    string    `json:"from_date"`
	ToDate      string    `json:"to_date"`
	Reason      string    `json:"reason"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

// ContactRequestRow is one contact-change request (staff review queue).
type ContactRequestRow struct {
	ID           uuid.UUID       `json:"id"`
	GuardianID   uuid.UUID       `json:"guardian_id"`
	GuardianName string          `json:"guardian_name"`
	NewPhone     *string         `json:"new_phone,omitempty"`
	NewEmail     *string         `json:"new_email,omitempty"`
	NewAddress   json.RawMessage `json:"new_address,omitempty"`
	Status       string          `json:"status"`
	CreatedAt    time.Time       `json:"created_at"`
}

type Service struct {
	engine    *onboarding.Engine
	academics *academics.Service
	finance   *finance.Service
}

func NewService(pool *pgxpool.Pool, engine *onboarding.Engine) *Service {
	return &Service{
		engine:    engine,
		academics: academics.NewService(pool, engine),
		finance:   finance.NewService(pool, engine),
	}
}

// guardianID resolves the caller's guardian record from their GUARDIAN membership.
func (s *Service) guardianID(ctx context.Context, tenantID, membershipID uuid.UUID) (uuid.UUID, error) {
	var gid uuid.UUID
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		e := tx.QueryRow(ctx, `SELECT id FROM guardian WHERE membership_id=$1 AND deleted_at IS NULL`, membershipID).Scan(&gid)
		if errors.Is(e, pgx.ErrNoRows) {
			return ErrNotGuardian
		}
		return e
	})
	return gid, err
}

// Children returns the students linked to the guardian — the entire set they may act on.
func (s *Service) Children(ctx context.Context, tenantID, guardianID uuid.UUID) ([]Child, error) {
	out := []Child{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT s.id, u.login_identifier, s.admission_no, gs.relation, gs.is_primary, gs.can_pay
			   FROM guardian_student gs
			   JOIN student s     ON s.id = gs.student_id AND s.deleted_at IS NULL
			   JOIN memberships m ON m.id = s.membership_id
			   JOIN users u       ON u.id = m.user_id
			  WHERE gs.guardian_id=$1 AND gs.deleted_at IS NULL
			  ORDER BY u.login_identifier`, guardianID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var c Child
			if err := rows.Scan(&c.StudentID, &c.Name, &c.AdmissionNo, &c.Relation, &c.IsPrimary, &c.CanPay); err != nil {
				return err
			}
			c.Name = onboarding.NameFromHandle(c.Name)
			out = append(out, c)
		}
		return rows.Err()
	})
	return out, err
}

// linkedEnrollment verifies the (guardian, student) link and returns the child's active
// enrollment id (uuid.Nil if not enrolled). Returns ErrForbidden if not linked — the
// guardian-scoping boundary.
func (s *Service) linkedEnrollment(ctx context.Context, tenantID, guardianID, studentID uuid.UUID) (uuid.UUID, error) {
	var enrollment uuid.UUID
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var ok bool
		e := tx.QueryRow(ctx, `SELECT true FROM guardian_student WHERE guardian_id=$1 AND student_id=$2 AND deleted_at IS NULL`, guardianID, studentID).Scan(&ok)
		if errors.Is(e, pgx.ErrNoRows) {
			return ErrForbidden
		}
		if e != nil {
			return e
		}
		// Active enrollment (optional — a freshly admitted child may have none yet).
		ee := tx.QueryRow(ctx, `SELECT id FROM enrollment WHERE student_id=$1 AND status='ACTIVE' AND deleted_at IS NULL LIMIT 1`, studentID).Scan(&enrollment)
		if ee != nil && !errors.Is(ee, pgx.ErrNoRows) {
			return ee
		}
		return nil
	})
	return enrollment, err
}

// linkedStudent verifies only the (guardian, student) link (for non-enrollment reads).
func (s *Service) linkedStudent(ctx context.Context, tenantID, guardianID, studentID uuid.UUID) error {
	return s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var ok bool
		e := tx.QueryRow(ctx, `SELECT true FROM guardian_student WHERE guardian_id=$1 AND student_id=$2 AND deleted_at IS NULL`, guardianID, studentID).Scan(&ok)
		if errors.Is(e, pgx.ErrNoRows) {
			return ErrForbidden
		}
		return e
	})
}

// linkedCanPay verifies the (guardian, student) link AND that it carries can_pay.
// Returns ErrForbidden if not linked, ErrCannotPay if linked but not a paying guardian.
func (s *Service) linkedCanPay(ctx context.Context, tenantID, guardianID, studentID uuid.UUID) error {
	return s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var canPay bool
		e := tx.QueryRow(ctx, `SELECT can_pay FROM guardian_student WHERE guardian_id=$1 AND student_id=$2 AND deleted_at IS NULL`, guardianID, studentID).Scan(&canPay)
		if errors.Is(e, pgx.ErrNoRows) {
			return ErrForbidden
		}
		if e != nil {
			return e
		}
		if !canPay {
			return ErrCannotPay
		}
		return nil
	})
}

// ---- Tier-2 guarded writes (docs/18) ---------------------------------------------

// PayFees records a SIMULATED online payment for a child straight into the finance
// ledger (flow B: payment + CREDIT + gapless receipt, golden rule). Guarded by the
// (guardian, child) link AND can_pay. No real gateway runs locally — this exercises the
// real ledger so "view dues" becomes "pay dues" end to end.
func (s *Service) PayFees(ctx context.Context, tenantID, membershipID, childID uuid.UUID, in PayInput) (finance.PaymentResult, error) {
	if in.Amount <= 0 {
		return finance.PaymentResult{}, ErrInvalidInput
	}
	gid, err := s.guardianID(ctx, tenantID, membershipID)
	if err != nil {
		return finance.PaymentResult{}, err
	}
	if err := s.linkedCanPay(ctx, tenantID, gid, childID); err != nil {
		return finance.PaymentResult{}, err
	}
	method := in.Method
	if method == "" {
		method = "ONLINE"
	}
	// The actor on the ledger is the guardian's membership (audit trail of who paid).
	return s.finance.RecordPayment(ctx, tenantID, membershipID, childID, in.Amount, method)
}

// RequestLeave submits a child-absence request (PENDING) for a teacher to decide. Golden
// rule: leave_request row + outbox + audit in one tx. Guarded by the (guardian, child) link.
func (s *Service) RequestLeave(ctx context.Context, tenantID, membershipID, childID uuid.UUID, in LeaveInput) (uuid.UUID, error) {
	if in.FromDate == "" || in.ToDate == "" || in.Reason == "" {
		return uuid.Nil, ErrInvalidInput
	}
	gid, err := s.guardianID(ctx, tenantID, membershipID)
	if err != nil {
		return uuid.Nil, err
	}
	if err := s.linkedStudent(ctx, tenantID, gid, childID); err != nil {
		return uuid.Nil, err
	}
	id := uuid.Must(uuid.NewV7())
	err = s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO leave_request (id, tenant_id, student_id, guardian_id, requested_by, from_date, to_date, reason, status, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$5,$9,1,$10)`,
			id, tenantID, childID, gid, membershipID, in.FromDate, in.ToDate, in.Reason, hlc, s.engine.NodeID()); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{"leave_request_id": id, "student_id": childID, "from_date": in.FromDate, "to_date": in.ToDate})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "leave_request", id, "leave.requested", membershipID, payload, hlc)
	})
	return id, err
}

// UpdateOwnContact proposes new contact details for the guardian's OWN record via
// maker-checker: a PENDING contact_change_request (+ outbox + audit) that an admin applies.
func (s *Service) UpdateOwnContact(ctx context.Context, tenantID, membershipID uuid.UUID, in ContactInput) (uuid.UUID, error) {
	if in.Phone == "" && in.Email == "" && len(in.Address) == 0 {
		return uuid.Nil, ErrInvalidInput
	}
	gid, err := s.guardianID(ctx, tenantID, membershipID)
	if err != nil {
		return uuid.Nil, err
	}
	id := uuid.Must(uuid.NewV7())
	err = s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO contact_change_request (id, tenant_id, guardian_id, requested_by, new_phone, new_email, new_address, status, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$4,$8,1,$9)`,
			id, tenantID, gid, membershipID, onboarding.NullString(in.Phone), onboarding.NullString(in.Email), onboarding.NullJSON(in.Address), hlc, s.engine.NodeID()); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{"contact_change_request_id": id, "guardian_id": gid})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "contact_change_request", id, "contact_change.requested", membershipID, payload, hlc)
	})
	return id, err
}

// MyLeaveRequests returns the caller-guardian's own leave requests (history).
func (s *Service) MyLeaveRequests(ctx context.Context, tenantID, membershipID uuid.UUID) ([]LeaveRequestRow, error) {
	gid, err := s.guardianID(ctx, tenantID, membershipID)
	if err != nil {
		return nil, err
	}
	return s.queryLeave(ctx, tenantID, "lr.guardian_id=$1", gid)
}

// PendingLeave returns the tenant's PENDING leave requests (staff review queue).
func (s *Service) PendingLeave(ctx context.Context, tenantID uuid.UUID) ([]LeaveRequestRow, error) {
	return s.queryLeave(ctx, tenantID, "lr.status='PENDING'")
}

func (s *Service) queryLeave(ctx context.Context, tenantID uuid.UUID, where string, args ...any) ([]LeaveRequestRow, error) {
	out := []LeaveRequestRow{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT lr.id, lr.student_id, u.login_identifier, lr.from_date, lr.to_date, lr.reason, lr.status, lr.created_at
			   FROM leave_request lr
			   JOIN student s     ON s.id = lr.student_id
			   JOIN memberships m ON m.id = s.membership_id
			   JOIN users u       ON u.id = m.user_id
			  WHERE lr.deleted_at IS NULL AND `+where+`
			  ORDER BY lr.created_at DESC LIMIT 500`, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r LeaveRequestRow
			var from, to time.Time
			if err := rows.Scan(&r.ID, &r.StudentID, &r.StudentName, &from, &to, &r.Reason, &r.Status, &r.CreatedAt); err != nil {
				return err
			}
			r.StudentName = onboarding.NameFromHandle(r.StudentName)
			r.FromDate = from.Format("2006-01-02")
			r.ToDate = to.Format("2006-01-02")
			out = append(out, r)
		}
		return rows.Err()
	})
	return out, err
}

// DecideLeave is a teacher's approve/reject of a PENDING leave request (PENDING→APPROVED/
// REJECTED). Updates the row + outbox + audit in one tx. Only a still-PENDING row transitions.
func (s *Service) DecideLeave(ctx context.Context, tenantID, actor, requestID uuid.UUID, in DecisionInput) error {
	return s.decide(ctx, tenantID, actor, "leave_request", requestID, in, "leave.decided")
}

// PendingContact returns the tenant's PENDING contact-change requests (staff review queue).
func (s *Service) PendingContact(ctx context.Context, tenantID uuid.UUID) ([]ContactRequestRow, error) {
	out := []ContactRequestRow{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT ccr.id, ccr.guardian_id, g.name, ccr.new_phone, ccr.new_email, ccr.new_address, ccr.status, ccr.created_at
			   FROM contact_change_request ccr
			   JOIN guardian g ON g.id = ccr.guardian_id
			  WHERE ccr.deleted_at IS NULL AND ccr.status='PENDING'
			  ORDER BY ccr.created_at DESC LIMIT 500`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r ContactRequestRow
			if err := rows.Scan(&r.ID, &r.GuardianID, &r.GuardianName, &r.NewPhone, &r.NewEmail, &r.NewAddress, &r.Status, &r.CreatedAt); err != nil {
				return err
			}
			out = append(out, r)
		}
		return rows.Err()
	})
	return out, err
}

// DecideContact is an admin's approve/reject of a PENDING contact-change request. On
// APPROVE it ALSO applies the proposed fields to the guardian record — all in one tx
// (the maker-checker apply step). Row + outbox + audit committed atomically.
func (s *Service) DecideContact(ctx context.Context, tenantID, actor, requestID uuid.UUID, in DecisionInput) error {
	return s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		var guardianID uuid.UUID
		var phone, email *string
		var address []byte
		err := tx.QueryRow(ctx,
			`SELECT guardian_id, new_phone, new_email, new_address FROM contact_change_request
			  WHERE id=$1 AND status='PENDING' AND deleted_at IS NULL`, requestID).Scan(&guardianID, &phone, &email, &address)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		status := "REJECTED"
		if in.Approve {
			status = "APPROVED"
		}
		if _, err := tx.Exec(ctx,
			`UPDATE contact_change_request SET status=$2, decided_by=$3, decided_at=now(), decision_note=$4, updated_at=now(), version=version+1, hlc=$5 WHERE id=$1`,
			requestID, status, actor, onboarding.NullString(in.Note), hlc); err != nil {
			return err
		}
		if in.Approve {
			// Apply only the non-null proposed fields to the guardian record.
			if _, err := tx.Exec(ctx,
				`UPDATE guardian SET
				    phone   = COALESCE($2, phone),
				    email   = COALESCE($3, email),
				    address = COALESCE($4, address),
				    updated_at = now(), version = version + 1, hlc = $5
				  WHERE id = $1`,
				guardianID, phone, email, address, hlc); err != nil {
				return err
			}
		}
		payload, _ := json.Marshal(map[string]any{"contact_change_request_id": requestID, "guardian_id": guardianID, "status": status})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, "contact_change_request", requestID, "contact_change.decided", actor, payload, hlc)
	})
}

// decide is the shared PENDING→APPROVED/REJECTED transition for request tables that need
// no apply step (leave). Updates status + outbox + audit in one tx.
func (s *Service) decide(ctx context.Context, tenantID, actor uuid.UUID, table string, requestID uuid.UUID, in DecisionInput, action string) error {
	return s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		hlc := onboarding.NowHLC()
		status := "REJECTED"
		if in.Approve {
			status = "APPROVED"
		}
		ct, err := tx.Exec(ctx,
			`UPDATE `+table+` SET status=$2, decided_by=$3, decided_at=now(), decision_note=$4, updated_at=now(), version=version+1, hlc=$5
			  WHERE id=$1 AND status='PENDING' AND deleted_at IS NULL`,
			requestID, status, actor, onboarding.NullString(in.Note), hlc)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		payload, _ := json.Marshal(map[string]any{"request_id": requestID, "status": status})
		return s.engine.WriteEventAndAudit(ctx, tx, tenantID, table, requestID, action, actor, payload, hlc)
	})
}

// ---- HTTP ------------------------------------------------------------------------

func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, res *authz.Resolver) {
	svc := NewService(pool, onboarding.NewEngine(pool, nodeID))

	r.With(authz.Require(res, "guardian.read_child")).Get("/api/v1/guardian/children",
		func(w http.ResponseWriter, req *http.Request) {
			gid, err := svc.guardianID(req.Context(), httpx.TenantID(req.Context()), caller(req))
			if err != nil {
				writeErr(w, err)
				return
			}
			children, err := svc.Children(req.Context(), httpx.TenantID(req.Context()), gid)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"children": children})
		})

	r.With(authz.Require(res, "guardian.read_child")).Get("/api/v1/guardian/children/{childId}/attendance",
		func(w http.ResponseWriter, req *http.Request) {
			tenantID := httpx.TenantID(req.Context())
			gid, err := svc.guardianID(req.Context(), tenantID, caller(req))
			if err != nil {
				writeErr(w, err)
				return
			}
			childID, err := uuid.Parse(chi.URLParam(req, "childId"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid child id")
				return
			}
			enrollment, err := svc.linkedEnrollment(req.Context(), tenantID, gid, childID)
			if err != nil {
				writeErr(w, err)
				return
			}
			if enrollment == uuid.Nil {
				httpx.JSON(w, http.StatusOK, map[string]any{"summary": map[string]int{}, "note": "child not enrolled yet"})
				return
			}
			sum, err := svc.academics.AttendanceSummary(req.Context(), tenantID, enrollment)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"summary": sum})
		})

	// Exams the school has defined — a flat list so the guardian's Marks screen can offer
	// an exam to view. Tenant-scoped (RLS); not child-specific, but harmless metadata and
	// gated by guardian.read_child like the rest of the portal reads.
	r.With(authz.Require(res, "guardian.read_child")).Get("/api/v1/guardian/exams",
		func(w http.ResponseWriter, req *http.Request) {
			tenantID := httpx.TenantID(req.Context())
			if _, err := svc.guardianID(req.Context(), tenantID, caller(req)); err != nil {
				writeErr(w, err)
				return
			}
			exams, err := svc.academics.ListExams(req.Context(), tenantID)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"exams": exams})
		})

	// Child marks for one exam — the effective (latest-per-subject) mark_entry rows,
	// enriched with subject names. Verifies the (guardian, child) link + resolves the
	// child's active enrollment, then reuses the academics service (never its tables).
	r.With(authz.Require(res, "guardian.read_child")).Get("/api/v1/guardian/children/{childId}/marks",
		func(w http.ResponseWriter, req *http.Request) {
			tenantID := httpx.TenantID(req.Context())
			gid, err := svc.guardianID(req.Context(), tenantID, caller(req))
			if err != nil {
				writeErr(w, err)
				return
			}
			childID, err := uuid.Parse(chi.URLParam(req, "childId"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid child id")
				return
			}
			examID, err := uuid.Parse(req.URL.Query().Get("exam_id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "valid exam_id query param required")
				return
			}
			enrollment, err := svc.linkedEnrollment(req.Context(), tenantID, gid, childID)
			if err != nil {
				writeErr(w, err)
				return
			}
			if enrollment == uuid.Nil {
				httpx.JSON(w, http.StatusOK, map[string]any{"marks": []any{}, "note": "child not enrolled yet"})
				return
			}
			marks, err := svc.academics.GetMarks(req.Context(), tenantID, examID, enrollment)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			// Enrich subject_id → subject name (read-only academics lookup, RLS-scoped).
			subjects, err := svc.academics.ListSubjects(req.Context(), tenantID)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			names := map[string]string{}
			for _, s := range subjects {
				if n, ok := s["name"].(string); ok {
					names[uuidKey(s["id"])] = n
				}
			}
			for _, m := range marks {
				if k := uuidKey(m["subject_id"]); k != "" {
					m["subject_name"] = names[k]
				}
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"marks": marks})
		})

	r.With(authz.Require(res, "guardian.read_fees")).Get("/api/v1/guardian/children/{childId}/fees",
		func(w http.ResponseWriter, req *http.Request) {
			tenantID := httpx.TenantID(req.Context())
			gid, err := svc.guardianID(req.Context(), tenantID, caller(req))
			if err != nil {
				writeErr(w, err)
				return
			}
			childID, err := uuid.Parse(chi.URLParam(req, "childId"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid child id")
				return
			}
			if err := svc.linkedStudent(req.Context(), tenantID, gid, childID); err != nil {
				writeErr(w, err)
				return
			}
			led, err := svc.finance.StudentLedger(req.Context(), tenantID, childID)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, led)
		})

	// ---- Tier-2 guarded writes (guardian side; self-scoped, docs/18) ----

	// Simulated online fee payment for a child (gated by guardian.pay_fees AND can_pay).
	r.With(authz.Require(res, "guardian.pay_fees")).Post("/api/v1/guardian/children/{childId}/pay",
		func(w http.ResponseWriter, req *http.Request) {
			childID, err := uuid.Parse(chi.URLParam(req, "childId"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid child id")
				return
			}
			var in PayInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			out, err := svc.PayFees(req.Context(), httpx.TenantID(req.Context()), caller(req), childID, in)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, out)
		})

	// Raise a child-absence request (PENDING → a teacher decides).
	r.With(authz.Require(res, "guardian.request_leave")).Post("/api/v1/guardian/children/{childId}/leave",
		func(w http.ResponseWriter, req *http.Request) {
			childID, err := uuid.Parse(chi.URLParam(req, "childId"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid child id")
				return
			}
			var in LeaveInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			id, err := svc.RequestLeave(req.Context(), httpx.TenantID(req.Context()), caller(req), childID, in)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, map[string]any{"leave_request_id": id})
		})

	// The caller-guardian's own leave-request history.
	r.With(authz.Require(res, "guardian.request_leave")).Get("/api/v1/guardian/leave-requests",
		func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.MyLeaveRequests(req.Context(), httpx.TenantID(req.Context()), caller(req))
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"leave_requests": list})
		})

	// Propose new contact details for the caller-guardian's OWN record (maker-checker).
	r.With(authz.Require(res, "guardian.update_own_contact")).Post("/api/v1/guardian/contact",
		func(w http.ResponseWriter, req *http.Request) {
			var in ContactInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			id, err := svc.UpdateOwnContact(req.Context(), httpx.TenantID(req.Context()), caller(req), in)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, map[string]any{"contact_change_request_id": id})
		})

	// ---- Tier-2 staff side: review queues + decisions (docs/18) ----
	// Leave is decided by the class teacher (attendance.mark); contact changes are applied
	// by an admin (student.update). These gate on STAFF permissions, not the guardian role.

	r.With(authz.Require(res, "attendance.mark")).Get("/api/v1/guardian-requests/leave",
		func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.PendingLeave(req.Context(), httpx.TenantID(req.Context()))
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"leave_requests": list})
		})

	r.With(authz.Require(res, "attendance.mark")).Post("/api/v1/guardian-requests/leave/{id}/decision",
		func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid request id")
				return
			}
			var in DecisionInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			if err := svc.DecideLeave(req.Context(), httpx.TenantID(req.Context()), caller(req), id, in); err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
		})

	r.With(authz.Require(res, "student.update")).Get("/api/v1/guardian-requests/contact",
		func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.PendingContact(req.Context(), httpx.TenantID(req.Context()))
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"contact_requests": list})
		})

	r.With(authz.Require(res, "student.update")).Post("/api/v1/guardian-requests/contact/{id}/decision",
		func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid request id")
				return
			}
			var in DecisionInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			if err := svc.DecideContact(req.Context(), httpx.TenantID(req.Context()), caller(req), id, in); err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
		})
}

// caller is the membership id of the authenticated user in the active tenant.
func caller(req *http.Request) uuid.UUID {
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

// uuidKey normalises a UUID value to its canonical string regardless of how it arrives
// from pgx: GetMarks scans into uuid.UUID, while listMaps' rows.Values() yields raw
// [16]byte (no pgx-uuid type is registered on the pool). Returns "" if not a UUID.
func uuidKey(v any) string {
	switch t := v.(type) {
	case uuid.UUID:
		return t.String()
	case [16]byte:
		return uuid.UUID(t).String()
	case string:
		return t
	default:
		return ""
	}
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		httpx.Error(w, http.StatusForbidden, "not your child")
	case errors.Is(err, ErrNotGuardian):
		httpx.Error(w, http.StatusForbidden, "no guardian record for this account")
	case errors.Is(err, ErrCannotPay):
		httpx.Error(w, http.StatusForbidden, "not permitted to pay for this child")
	case errors.Is(err, ErrInvalidInput):
		httpx.Error(w, http.StatusBadRequest, "invalid input")
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not found")
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}
