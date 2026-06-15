// Package students is the M3 slice — the FIRST real domain slice and the completion of
// the walking skeleton (docs/plan/README.md M3, docs/database/04-people.md, flow A in
// docs/20-dataflow.md). It proves the canonical mutation on real data:
//
//	student.onboard, in ONE transaction:
//	  users (login handle, must_reset) + memberships (STUDENT) [+ membership_roles]
//	  + student profile + guardian(s) + guardian_student link(s)
//	  + outbox[student.enrolled] + audit
//
// Identity is global (users); everything else is tenant-scoped under RLS. This is the
// "skip / direct" onboarding path (Path B, docs/06): one submit produces an ACTIVE
// student. The multi-step wizard + approval states (DRAFT→…→ACTIVE) layer on later; the
// transaction shape proven here is what every people slice (teachers/staff, M5) reuses.
package students

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/onboarding"
)

// ---- Wire shapes (the OpenAPI contract) -----------------------------------------

type GuardianInput struct {
	Name      string `json:"name"`
	Phone     string `json:"phone"`
	Email     string `json:"email,omitempty"`
	Relation  string `json:"relation"`
	IsPrimary bool   `json:"is_primary"`
	CanPay    bool   `json:"can_pay"`
}

type OnboardInput struct {
	Name        string          `json:"name"`
	AdmissionNo string          `json:"admission_no"`
	DOB         string          `json:"dob,omitempty"` // YYYY-MM-DD
	Gender      string          `json:"gender,omitempty"`
	Category    string          `json:"category,omitempty"`
	BloodGroup  string          `json:"blood_group,omitempty"`
	Address     json.RawMessage `json:"address,omitempty"`
	PriorSchool string          `json:"prior_school,omitempty"`
	PriorClass  string          `json:"prior_class,omitempty"`
	RoleIDs     []uuid.UUID     `json:"role_ids,omitempty"`
	Guardians   []GuardianInput `json:"guardians,omitempty"`
}

// OnboardResult returns the generated credentials ONCE — staff hand them to the student
// (docs/06). The temp password is never persisted in plaintext.
type OnboardResult struct {
	StudentID       uuid.UUID `json:"student_id"`
	MembershipID    uuid.UUID `json:"membership_id"`
	LoginIdentifier string    `json:"login_identifier"`
	TempPassword    string    `json:"temp_password"`
	AdmissionNo     string    `json:"admission_no"`
}

type GuardianDTO struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	Email     string    `json:"email,omitempty"`
	Relation  string    `json:"relation"`
	IsPrimary bool      `json:"is_primary"`
	CanPay    bool      `json:"can_pay"`
}

type StudentRow struct {
	ID              uuid.UUID `json:"id"`
	AdmissionNo     string    `json:"admission_no"`
	Name            string    `json:"name"`
	LoginIdentifier string    `json:"login_identifier"`
	Status          string    `json:"status"`
	Gender          *string   `json:"gender,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

type StudentDetail struct {
	StudentRow
	DOB         *string         `json:"dob,omitempty"`
	Category    *string         `json:"category,omitempty"`
	BloodGroup  *string         `json:"blood_group,omitempty"`
	Address     json.RawMessage `json:"address,omitempty"`
	PriorSchool *string         `json:"prior_school,omitempty"`
	PriorClass  *string         `json:"prior_class,omitempty"`
	Guardians   []GuardianDTO   `json:"guardians"`
}

// GuardianRow is one entry in the guardian directory (admin record management). The
// child_count is the number of live students linked via guardian_student.
type GuardianRow struct {
	ID              uuid.UUID `json:"id"`
	Name            string    `json:"name"`
	Phone           string    `json:"phone"`
	Email           string    `json:"email,omitempty"`
	RelationDefault string    `json:"relation_default"`
	ChildCount      int       `json:"child_count"`
}

// GuardianChild is one student linked to a guardian, with the link attributes.
type GuardianChild struct {
	StudentID   uuid.UUID `json:"student_id"`
	Name        string    `json:"name"`
	AdmissionNo string    `json:"admission_no"`
	Relation    string    `json:"relation"`
	IsPrimary   bool      `json:"is_primary"`
	CanPay      bool      `json:"can_pay"`
}

// GuardianDetail is the full guardian record + its linked children.
type GuardianDetail struct {
	ID         uuid.UUID       `json:"id"`
	Name       string          `json:"name"`
	Phone      string          `json:"phone"`
	Email      string          `json:"email,omitempty"`
	Occupation string          `json:"occupation,omitempty"`
	Children   []GuardianChild `json:"children"`
}

var (
	ErrNotFound     = errors.New("not found")
	ErrDuplicateAdm = errors.New("admission number already exists")
	ErrInvalidInput = errors.New("invalid input")
)

// ---- Repository ------------------------------------------------------------------

type Repo struct {
	pool   *pgxpool.Pool
	nodeID uuid.UUID
}

func NewRepo(pool *pgxpool.Pool, nodeID uuid.UUID) *Repo { return &Repo{pool: pool, nodeID: nodeID} }

func (r *Repo) withTenant(ctx context.Context, tenantID uuid.UUID, fn func(pgx.Tx) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return fmt.Errorf("set tenant: %w", err)
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---- Service ---------------------------------------------------------------------

type Service struct {
	repo   *Repo
	engine *onboarding.Engine
}

func NewService(repo *Repo, engine *onboarding.Engine) *Service {
	return &Service{repo: repo, engine: engine}
}

// GuardianCredResult is the one-time login a promoted guardian receives (docs/18).
type GuardianCredResult struct {
	GuardianID      uuid.UUID `json:"guardian_id"`
	MembershipID    uuid.UUID `json:"membership_id"`
	LoginIdentifier string    `json:"login_identifier"`
	TempPassword    string    `json:"temp_password"`
}

// PromoteGuardian gives an existing (contact-only) guardian portal access: a GUARDIAN
// login + membership + the Guardian role, in one tx. The guardian's child links already
// exist (guardian_student); promotion just adds the identity. Idempotent-ish: a guardian
// already promoted is rejected.
func (s *Service) PromoteGuardian(ctx context.Context, tenantID, actor, guardianID uuid.UUID) (GuardianCredResult, error) {
	var res GuardianCredResult
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var name string
		var existing *uuid.UUID
		err := tx.QueryRow(ctx, `SELECT name, membership_id FROM guardian WHERE id=$1 AND deleted_at IS NULL`, guardianID).Scan(&name, &existing)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if existing != nil {
			return fmt.Errorf("%w: guardian already has portal access", ErrInvalidInput)
		}
		// Resolve the seeded Guardian role for THIS tenant (defence-in-depth: explicit tenant_id).
		var roleID uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE name=$1 AND tenant_id=$2 AND deleted_at IS NULL`, authz.GuardianRole, tenantID).Scan(&roleID); err != nil {
			return fmt.Errorf("guardian role not provisioned: %w", err)
		}
		slug, err := onboarding.SchoolSlug(ctx, tx)
		if err != nil {
			return err
		}
		hlc := onboarding.NowHLC()
		member, err := s.engine.CreateMember(ctx, tx, onboarding.MemberInput{
			TenantID: tenantID, Actor: actor, Name: name, UserType: "GUARDIAN",
			SchoolSlug: slug, RoleIDs: []uuid.UUID{roleID}, HLC: hlc,
		})
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE guardian SET membership_id=$2, updated_at=now(), version=version+1, hlc=$3 WHERE id=$1`,
			guardianID, member.MembershipID, hlc); err != nil {
			return fmt.Errorf("link guardian membership: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"guardian_id": guardianID, "membership_id": member.MembershipID, "login": member.Login})
		if err := s.engine.WriteEventAndAudit(ctx, tx, tenantID, "guardian", guardianID, "guardian.promoted", actor, b, hlc); err != nil {
			return err
		}
		res = GuardianCredResult{GuardianID: guardianID, MembershipID: member.MembershipID, LoginIdentifier: member.Login, TempPassword: member.TempPassword}
		return nil
	})
	return res, err
}

// Onboard runs the whole admission in one transaction (flow A). Returns the generated
// login + one-time temp password.
func (s *Service) Onboard(ctx context.Context, tenantID, actor uuid.UUID, in OnboardInput) (OnboardResult, error) {
	if in.Name == "" || in.AdmissionNo == "" {
		return OnboardResult{}, fmt.Errorf("%w: name and admission_no are required", ErrInvalidInput)
	}
	var res OnboardResult
	err := s.engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		slug, err := onboarding.SchoolSlug(ctx, tx)
		if err != nil {
			return err
		}
		hlc := onboarding.NowHLC()

		// Shared identity machinery: login handle + temp password + user + membership + roles.
		member, err := s.engine.CreateMember(ctx, tx, onboarding.MemberInput{
			TenantID: tenantID, Actor: actor, Name: in.Name, UserType: "STUDENT",
			SchoolSlug: slug, RoleIDs: in.RoleIDs, HLC: hlc,
		})
		if err != nil {
			return err
		}
		studentID := uuid.Must(uuid.NewV7())

		// Student-specific profile.
		if _, err := tx.Exec(ctx,
			`INSERT INTO student (id, tenant_id, membership_id, admission_no, dob, gender, category,
			                      blood_group, address, prior_school, prior_class, created_by, hlc, version, origin_node_id)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, $14)`,
			studentID, tenantID, member.MembershipID, in.AdmissionNo, nullDate(in.DOB), nullStr(in.Gender),
			nullStr(in.Category), nullStr(in.BloodGroup), nullJSON(in.Address), nullStr(in.PriorSchool),
			nullStr(in.PriorClass), nilUUID(actor), hlc, s.engine.NodeID()); err != nil {
			if isUniqueViolation(err) {
				return ErrDuplicateAdm
			}
			return fmt.Errorf("insert student: %w", err)
		}

		// Guardians (contact-only records) + the scoping link.
		guardians := make([]map[string]any, 0, len(in.Guardians))
		for _, g := range in.Guardians {
			if g.Name == "" || g.Phone == "" || g.Relation == "" {
				return fmt.Errorf("%w: guardian needs name, phone, relation", ErrInvalidInput)
			}
			gid := uuid.Must(uuid.NewV7())
			if _, err := tx.Exec(ctx,
				`INSERT INTO guardian (id, tenant_id, name, relation_default, phone, email, created_by, hlc, version, origin_node_id)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)`,
				gid, tenantID, g.Name, g.Relation, g.Phone, nullStr(g.Email), nilUUID(actor), hlc, s.engine.NodeID()); err != nil {
				return fmt.Errorf("insert guardian: %w", err)
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO guardian_student (id, tenant_id, guardian_id, student_id, relation, is_primary, can_pay, created_by, hlc, version, origin_node_id)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)`,
				uuid.Must(uuid.NewV7()), tenantID, gid, studentID, g.Relation, g.IsPrimary, g.CanPay, nilUUID(actor), hlc, s.engine.NodeID()); err != nil {
				return fmt.Errorf("insert guardian_student: %w", err)
			}
			guardians = append(guardians, map[string]any{"id": gid, "name": g.Name, "relation": g.Relation})
		}

		// ONE domain event for the aggregate (flow A) + audit, in the same tx.
		payload, _ := json.Marshal(map[string]any{
			"student_id": studentID, "membership_id": member.MembershipID, "user_id": member.UserID,
			"login_identifier": member.Login, "admission_no": in.AdmissionNo, "guardians": guardians,
		})
		if err := s.engine.WriteEventAndAudit(ctx, tx, tenantID, "student", studentID, "student.enrolled", actor, payload, hlc); err != nil {
			return err
		}

		res = OnboardResult{
			StudentID: studentID, MembershipID: member.MembershipID,
			LoginIdentifier: member.Login, TempPassword: member.TempPassword, AdmissionNo: in.AdmissionNo,
		}
		return nil
	})
	return res, err
}

// List returns the tenant's live students (roster).
func (s *Service) List(ctx context.Context, tenantID uuid.UUID) ([]StudentRow, error) {
	out := []StudentRow{}
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT s.id, s.admission_no, u.login_identifier, m.status, s.gender, s.created_at
			   FROM student s
			   JOIN memberships m ON m.id = s.membership_id
			   JOIN users u       ON u.id = m.user_id
			  WHERE s.deleted_at IS NULL
			  ORDER BY s.created_at DESC LIMIT 500`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r StudentRow
			if err := rows.Scan(&r.ID, &r.AdmissionNo, &r.LoginIdentifier, &r.Status, &r.Gender, &r.CreatedAt); err != nil {
				return err
			}
			r.Name = nameFromHandle(r.LoginIdentifier)
			out = append(out, r)
		}
		return rows.Err()
	})
	return out, err
}

// Get returns one student with its guardians.
func (s *Service) Get(ctx context.Context, tenantID, studentID uuid.UUID) (StudentDetail, error) {
	var d StudentDetail
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var dob *time.Time
		err := tx.QueryRow(ctx,
			`SELECT s.id, s.admission_no, u.login_identifier, m.status, s.gender, s.created_at,
			        s.dob, s.category, s.blood_group, s.address, s.prior_school, s.prior_class
			   FROM student s
			   JOIN memberships m ON m.id = s.membership_id
			   JOIN users u       ON u.id = m.user_id
			  WHERE s.id = $1 AND s.deleted_at IS NULL`, studentID).
			Scan(&d.ID, &d.AdmissionNo, &d.LoginIdentifier, &d.Status, &d.Gender, &d.CreatedAt,
				&dob, &d.Category, &d.BloodGroup, &d.Address, &d.PriorSchool, &d.PriorClass)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		d.Name = nameFromHandle(d.LoginIdentifier)
		if dob != nil {
			s := dob.Format("2006-01-02")
			d.DOB = &s
		}

		grows, err := tx.Query(ctx,
			`SELECT g.id, g.name, g.phone, g.email, gs.relation, gs.is_primary, gs.can_pay
			   FROM guardian_student gs
			   JOIN guardian g ON g.id = gs.guardian_id
			  WHERE gs.student_id = $1 AND gs.deleted_at IS NULL`, studentID)
		if err != nil {
			return err
		}
		defer grows.Close()
		d.Guardians = []GuardianDTO{}
		for grows.Next() {
			var g GuardianDTO
			var email *string
			if err := grows.Scan(&g.ID, &g.Name, &g.Phone, &email, &g.Relation, &g.IsPrimary, &g.CanPay); err != nil {
				return err
			}
			if email != nil {
				g.Email = *email
			}
			d.Guardians = append(d.Guardians, g)
		}
		return grows.Err()
	})
	return d, err
}

// ListGuardians returns the tenant's guardian directory with a live-child count. RLS
// scopes both guardian and guardian_student to the active tenant.
func (s *Service) ListGuardians(ctx context.Context, tenantID uuid.UUID) ([]GuardianRow, error) {
	out := []GuardianRow{}
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT g.id, g.name, g.phone, g.email, g.relation_default,
			        COUNT(gs.id) FILTER (WHERE gs.deleted_at IS NULL) AS child_count
			   FROM guardian g
			   LEFT JOIN guardian_student gs ON gs.guardian_id = g.id
			  WHERE g.deleted_at IS NULL
			  GROUP BY g.id, g.name, g.phone, g.email, g.relation_default
			  ORDER BY g.name ASC LIMIT 500`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r GuardianRow
			var email, rel *string
			if err := rows.Scan(&r.ID, &r.Name, &r.Phone, &email, &rel, &r.ChildCount); err != nil {
				return err
			}
			if email != nil {
				r.Email = *email
			}
			if rel != nil {
				r.RelationDefault = *rel
			}
			out = append(out, r)
		}
		return rows.Err()
	})
	return out, err
}

// GetGuardian returns one guardian record + its linked children (RLS-scoped).
func (s *Service) GetGuardian(ctx context.Context, tenantID, guardianID uuid.UUID) (GuardianDetail, error) {
	var d GuardianDetail
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var email, occ *string
		err := tx.QueryRow(ctx,
			`SELECT id, name, phone, email, occupation
			   FROM guardian
			  WHERE id = $1 AND deleted_at IS NULL`, guardianID).
			Scan(&d.ID, &d.Name, &d.Phone, &email, &occ)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if email != nil {
			d.Email = *email
		}
		if occ != nil {
			d.Occupation = *occ
		}

		crows, err := tx.Query(ctx,
			`SELECT s.id, s.admission_no, u.login_identifier, gs.relation, gs.is_primary, gs.can_pay
			   FROM guardian_student gs
			   JOIN student s     ON s.id = gs.student_id AND s.deleted_at IS NULL
			   JOIN memberships m ON m.id = s.membership_id
			   JOIN users u       ON u.id = m.user_id
			  WHERE gs.guardian_id = $1 AND gs.deleted_at IS NULL
			  ORDER BY u.login_identifier ASC`, guardianID)
		if err != nil {
			return err
		}
		defer crows.Close()
		d.Children = []GuardianChild{}
		for crows.Next() {
			var c GuardianChild
			var login string
			if err := crows.Scan(&c.StudentID, &c.AdmissionNo, &login, &c.Relation, &c.IsPrimary, &c.CanPay); err != nil {
				return err
			}
			c.Name = nameFromHandle(login)
			d.Children = append(d.Children, c)
		}
		return crows.Err()
	})
	return d, err
}

// ---- HTTP ------------------------------------------------------------------------

// Register mounts the students endpoints on an auth + tenant-scoped group; each route
// declares its permission (docs/05).
func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, res *authz.Resolver) {
	svc := NewService(NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))

	r.With(authz.Require(res, "student.onboard")).Post("/api/v1/students/onboard",
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

	// Promote a contact-only guardian to a portal user (M7).
	r.With(authz.Require(res, "student.update")).Post("/api/v1/students/guardians/{id}/promote",
		func(w http.ResponseWriter, req *http.Request) {
			gid, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid guardian id")
				return
			}
			out, err := svc.PromoteGuardian(req.Context(), httpx.TenantID(req.Context()), actorID(req), gid)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, out)
		})

	r.With(authz.Require(res, "student.read")).Get("/api/v1/students",
		func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.List(req.Context(), httpx.TenantID(req.Context()))
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"students": list})
		})

	// Guardian directory (record management). Registered before /students/{id} so the
	// static "guardians" segment is matched ahead of the id param.
	r.With(authz.Require(res, "student.read")).Get("/api/v1/students/guardians",
		func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.ListGuardians(req.Context(), httpx.TenantID(req.Context()))
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"guardians": list})
		})

	r.With(authz.Require(res, "student.read")).Get("/api/v1/students/guardians/{id}",
		func(w http.ResponseWriter, req *http.Request) {
			gid, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid guardian id")
				return
			}
			d, err := svc.GetGuardian(req.Context(), httpx.TenantID(req.Context()), gid)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, d)
		})

	r.With(authz.Require(res, "student.read")).Get("/api/v1/students/{id}",
		func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid student id")
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

// ---- helpers ---------------------------------------------------------------------

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
	case errors.Is(err, ErrDuplicateAdm):
		httpx.Error(w, http.StatusConflict, "admission number already exists")
	case errors.Is(err, ErrInvalidInput), errors.Is(err, onboarding.ErrForeignRole):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, onboarding.ErrNoTenantSlug):
		httpx.Error(w, http.StatusFailedDependency, "tenant has no slug configured")
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}

// nameFromHandle recovers a display-ish name from the login handle's name part. The real
// display name is not stored on a profile yet (it lives in the audit/event payload); the
// handle's local-part before the type suffix is a reasonable roster label for M3.
func nameFromHandle(handle string) string {
	at := indexByte(handle, '@')
	local := handle
	if at >= 0 {
		local = handle[:at]
	}
	if dot := lastIndexByte(local, '.'); dot >= 0 {
		local = local[:dot]
	}
	return local
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}
func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func nilUUID(a uuid.UUID) *uuid.UUID {
	if a == uuid.Nil {
		return nil
	}
	return &a
}
func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
func nullJSON(j json.RawMessage) any {
	if len(j) == 0 {
		return nil
	}
	return []byte(j)
}
func nullDate(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil
	}
	return &t
}

func isUniqueViolation(err error) bool {
	return err != nil && containsStr(err.Error(), "SQLSTATE 23505")
}
func containsStr(s, sub string) bool {
	return len(s) >= len(sub) && (indexOf(s, sub) >= 0)
}
func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func nowHLC() string { return strconv.FormatInt(time.Now().UnixNano(), 10) }
