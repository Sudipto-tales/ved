// Package staff is the M5 non-teaching-staff slice (accountants, clerks, principal, …).
// Same membership-linked shape as teachers; the distinction is user_type = EMPLOYEE and
// the role set, not a separate identity model (docs/database/04-people.md). Uses the
// shared onboarding engine; adds the `employee` profile and emits staff.onboarded.
package staff

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/onboarding"
)

// ---- Wire shapes -----------------------------------------------------------------

type OnboardInput struct {
	Name         string      `json:"name"`
	Department   string      `json:"department,omitempty"`
	Designation  string      `json:"designation,omitempty"`
	JoiningDate  string      `json:"joining_date,omitempty"`
	EmployeeCode string      `json:"employee_code,omitempty"`
	RoleIDs      []uuid.UUID `json:"role_ids,omitempty"`
}

type OnboardResult struct {
	EmployeeID      uuid.UUID `json:"employee_id"`
	MembershipID    uuid.UUID `json:"membership_id"`
	LoginIdentifier string    `json:"login_identifier"`
	TempPassword    string    `json:"temp_password"`
}

type StaffRow struct {
	ID              uuid.UUID `json:"id"`
	Name            string    `json:"name"`
	LoginIdentifier string    `json:"login_identifier"`
	Status          string    `json:"status"`
	Department      *string   `json:"department,omitempty"`
	Designation     *string   `json:"designation,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

type StaffDetail struct {
	StaffRow
	EmployeeCode *string `json:"employee_code,omitempty"`
	JoiningDate  *string `json:"joining_date,omitempty"`
}

var (
	ErrNotFound     = errors.New("not found")
	ErrDuplicateLog = errors.New("employee code already exists")
	ErrInvalidInput = errors.New("invalid input")
)

// ---- Service ---------------------------------------------------------------------

type Service struct{ engine *onboarding.Engine }

func NewService(engine *onboarding.Engine) *Service { return &Service{engine: engine} }

// Onboard creates the staff identity (engine) + employee profile + staff.onboarded, one tx.
func (s *Service) Onboard(ctx context.Context, tenantID, actor uuid.UUID, in OnboardInput) (OnboardResult, error) {
	if in.Name == "" {
		return OnboardResult{}, fmt.Errorf("%w: name is required", ErrInvalidInput)
	}
	var res OnboardResult
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		slug, err := onboarding.SchoolSlug(ctx, tx)
		if err != nil {
			return err
		}
		hlc := onboarding.NowHLC()

		// Enforce the tenant's dynamic onboarding template (M10).
		present := map[string]bool{
			"department": in.Department != "", "designation": in.Designation != "",
			"joining_date": in.JoiningDate != "", "employee_code": in.EmployeeCode != "",
		}
		if missing, err := s.engine.MissingRequiredFields(ctx, tx, "EMPLOYEE", present); err != nil {
			return err
		} else if len(missing) > 0 {
			return fmt.Errorf("%w: required field(s): %s", ErrInvalidInput, strings.Join(missing, ", "))
		}

		member, err := s.engine.CreateMember(ctx, tx, onboarding.MemberInput{
			TenantID: tenantID, Actor: actor, Name: in.Name, UserType: "EMPLOYEE",
			SchoolSlug: slug, RoleIDs: in.RoleIDs, HLC: hlc,
		})
		if err != nil {
			return err
		}
		empID := uuid.Must(uuid.NewV7())
		if _, err := tx.Exec(ctx,
			`INSERT INTO employee (id, tenant_id, membership_id, department, designation, joining_date, employee_code, created_by, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)`,
			empID, tenantID, member.MembershipID, onboarding.NullString(in.Department), onboarding.NullString(in.Designation),
			nullDate(in.JoiningDate), onboarding.NullString(in.EmployeeCode),
			onboarding.NilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			if onboarding.IsUniqueViolation(err) {
				return ErrDuplicateLog
			}
			return fmt.Errorf("insert employee: %w", err)
		}
		payload, _ := json.Marshal(map[string]any{
			"employee_id": empID, "membership_id": member.MembershipID, "user_id": member.UserID,
			"login_identifier": member.Login,
		})
		if err := s.engine.WriteEventAndAudit(ctx, tx, tenantID, "employee", empID, "staff.onboarded", actor, payload, hlc); err != nil {
			return err
		}
		res = OnboardResult{EmployeeID: empID, MembershipID: member.MembershipID, LoginIdentifier: member.Login, TempPassword: member.TempPassword}
		return nil
	})
	return res, err
}

func (s *Service) List(ctx context.Context, tenantID uuid.UUID) ([]StaffRow, error) {
	out := []StaffRow{}
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT e.id, u.login_identifier, m.status, e.department, e.designation, e.created_at
			   FROM employee e
			   JOIN memberships m ON m.id = e.membership_id
			   JOIN users u       ON u.id = m.user_id
			  WHERE e.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 500`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r StaffRow
			if err := rows.Scan(&r.ID, &r.LoginIdentifier, &r.Status, &r.Department, &r.Designation, &r.CreatedAt); err != nil {
				return err
			}
			r.Name = onboarding.NameFromHandle(r.LoginIdentifier)
			out = append(out, r)
		}
		return rows.Err()
	})
	return out, err
}

func (s *Service) Get(ctx context.Context, tenantID, id uuid.UUID) (StaffDetail, error) {
	var d StaffDetail
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var jd *time.Time
		err := tx.QueryRow(ctx,
			`SELECT e.id, u.login_identifier, m.status, e.department, e.designation, e.created_at, e.employee_code, e.joining_date
			   FROM employee e
			   JOIN memberships m ON m.id = e.membership_id
			   JOIN users u       ON u.id = m.user_id
			  WHERE e.id = $1 AND e.deleted_at IS NULL`, id).
			Scan(&d.ID, &d.LoginIdentifier, &d.Status, &d.Department, &d.Designation, &d.CreatedAt, &d.EmployeeCode, &jd)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		d.Name = onboarding.NameFromHandle(d.LoginIdentifier)
		if jd != nil {
			s := jd.Format("2006-01-02")
			d.JoiningDate = &s
		}
		return nil
	})
	return d, err
}

// ---- HTTP ------------------------------------------------------------------------

func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, res *authz.Resolver) {
	svc := NewService(onboarding.NewEngine(pool, nodeID))

	r.With(authz.Require(res, "staff.onboard")).Post("/api/v1/staff/onboard",
		func(w http.ResponseWriter, req *http.Request) {
			var in OnboardInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			out, err := svc.Onboard(req.Context(), httpx.TenantID(req.Context()), actorID(req), in)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, out)
		})

	r.With(authz.Require(res, "staff.read")).Get("/api/v1/staff",
		func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.List(req.Context(), httpx.TenantID(req.Context()))
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"staff": list})
		})

	r.With(authz.Require(res, "staff.read")).Get("/api/v1/staff/{id}",
		func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid staff id")
				return
			}
			d, err := svc.Get(req.Context(), httpx.TenantID(req.Context()), id)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, d)
		})
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
	case errors.Is(err, ErrDuplicateLog):
		httpx.Error(w, http.StatusConflict, "employee code already exists")
	case errors.Is(err, ErrInvalidInput), errors.Is(err, onboarding.ErrForeignRole):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, onboarding.ErrNoTenantSlug):
		httpx.Error(w, http.StatusFailedDependency, "tenant has no slug configured")
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}

func nullDate(s string) *time.Time {
	if s == "" {
		return nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return &t
	}
	return nil
}
