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
	"errors"
	"net/http"

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
)

type Child struct {
	StudentID   uuid.UUID `json:"student_id"`
	Name        string    `json:"name"`
	AdmissionNo string    `json:"admission_no"`
	Relation    string    `json:"relation"`
	IsPrimary   bool      `json:"is_primary"`
	CanPay      bool      `json:"can_pay"`
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

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		httpx.Error(w, http.StatusForbidden, "not your child")
	case errors.Is(err, ErrNotGuardian):
		httpx.Error(w, http.StatusForbidden, "no guardian record for this account")
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}
