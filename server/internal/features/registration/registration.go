// Package registration is the control-plane slice that drives a school from self-service
// sign-up to a provisioned, licensed tenant (docs/database/01-control-plane.md "How the
// chain links", docs/01-overview.md state machine):
//
//	ADMIN_REGISTERED → ONBOARDING → PENDING_PAYMENT_REVIEW → ACTIVE  (REJECTED / SUSPENDED)
//
// On approval it runs the platform-side state transition (tenant + subscription + gapless
// invoice + payment-proof + signed license) AND the cross-plane handoff: it provisions the
// TENANT plane (first admin user with generated credentials + the M2 RBAC bootstrap + the
// M3 tenant_profile). In production the node self-provisions on license receipt over NATS
// (M6); for M4 the control plane does it inline against the shared database.
//
// Control-plane tables carry no tenant_id/RLS/sync (docs/database/01), so these mutations
// are plain transactional writes — the tenant-plane golden rule applies only to the
// provisioning writes in the `public` schema.
package registration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/features/academics"
	"github.com/weloin/ved/internal/features/access"
	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/platform/credential"
	"github.com/weloin/ved/internal/platform/crypto"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/license"
	"github.com/weloin/ved/internal/platform/onboarding"
)

var slugRe = regexp.MustCompile(`^[a-z][a-z0-9-]{1,30}$`)

var (
	ErrNotFound     = errors.New("not found")
	ErrBadSlug      = errors.New("slug must be lower-kebab (a-z, 0-9, -)")
	ErrSlugTaken    = errors.New("slug already taken")
	ErrEmailTaken   = errors.New("admin email already registered")
	ErrBadState     = errors.New("registration is not awaiting review")
	ErrNoProof      = errors.New("no pending payment proof")
	ErrInvalidInput = errors.New("invalid input")
)

// ---- Service ---------------------------------------------------------------------

type Service struct {
	pool   *pgxpool.Pool
	nodeID uuid.UUID
	signer *license.Signer
}

func NewService(pool *pgxpool.Pool, nodeID uuid.UUID, signer *license.Signer) *Service {
	return &Service{pool: pool, nodeID: nodeID, signer: signer}
}

// ---- DTOs ------------------------------------------------------------------------

type RegisterInput struct {
	SchoolName string `json:"school_name"`
	Slug       string `json:"slug"`
	AdminName  string `json:"admin_name"`
	AdminEmail string `json:"admin_email"`
	AdminPhone string `json:"admin_phone,omitempty"`
	PlanID     string `json:"plan_id"`
}

type ProofInput struct {
	Amount     float64 `json:"amount"`
	Currency   string  `json:"currency"`
	Method     string  `json:"method"`
	TxnID      string  `json:"txn_id"`
	PayerName  string  `json:"payer_name"`
	PaidAt     string  `json:"paid_at,omitempty"`
	StorageKey string  `json:"storage_key,omitempty"`
}

type RegistrationDTO struct {
	ID          uuid.UUID  `json:"id"`
	SchoolName  string     `json:"school_name"`
	Slug        string     `json:"slug"`
	AdminName   string     `json:"admin_name"`
	AdminEmail  string     `json:"admin_email"`
	Status      string     `json:"status"`
	ProofStatus *string    `json:"proof_status,omitempty"`
	TenantID    *uuid.UUID `json:"tenant_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ApproveResult is the cross-plane handoff payload — the platform admin hands the tenant
// admin's one-time credentials over (docs/06).
type ApproveResult struct {
	TenantID       uuid.UUID `json:"tenant_id"`
	Slug           string    `json:"slug"`
	SubscriptionID uuid.UUID `json:"subscription_id"`
	InvoiceNumber  string    `json:"invoice_number"`
	LicenseID      uuid.UUID `json:"license_id"`
	AdminLogin     string    `json:"admin_login"`
	AdminTempPass  string    `json:"admin_temp_password"`
	LicenseExpires time.Time `json:"license_expires_at"`
}

// ---- Public flow -----------------------------------------------------------------

// Register starts a school registration (ADMIN_REGISTERED → ONBOARDING once a plan is set).
func (s *Service) Register(ctx context.Context, in RegisterInput) (RegistrationDTO, error) {
	if in.SchoolName == "" || in.AdminName == "" || in.AdminEmail == "" {
		return RegistrationDTO{}, fmt.Errorf("%w: school_name, admin_name, admin_email required", ErrInvalidInput)
	}
	if !slugRe.MatchString(in.Slug) {
		return RegistrationDTO{}, ErrBadSlug
	}
	planID, err := uuid.Parse(in.PlanID)
	if err != nil {
		return RegistrationDTO{}, fmt.Errorf("%w: valid plan_id required", ErrInvalidInput)
	}

	// Slug must be free across both the live tenant directory and pending registrations.
	var taken bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM control_plane.tenant WHERE slug=$1)
		     OR EXISTS(SELECT 1 FROM control_plane.school_registration WHERE slug=$1 AND status <> 'REJECTED')`,
		in.Slug).Scan(&taken); err != nil {
		return RegistrationDTO{}, err
	}
	if taken {
		return RegistrationDTO{}, ErrSlugTaken
	}

	id := uuid.Must(uuid.NewV7())
	var dto RegistrationDTO
	err = s.pool.QueryRow(ctx,
		`INSERT INTO control_plane.school_registration
		   (id, school_name, slug, admin_name, admin_email, admin_phone, requested_plan_id, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,'ONBOARDING')
		 RETURNING id, school_name, slug, admin_name, admin_email, status, created_at`,
		id, in.SchoolName, in.Slug, in.AdminName, in.AdminEmail, nullStr(in.AdminPhone), planID).
		Scan(&dto.ID, &dto.SchoolName, &dto.Slug, &dto.AdminName, &dto.AdminEmail, &dto.Status, &dto.CreatedAt)
	if isUnique(err, "admin_email") {
		return RegistrationDTO{}, ErrEmailTaken
	}
	if err != nil {
		return RegistrationDTO{}, err
	}
	return dto, nil
}

// SubmitProof attaches a payment proof and moves the registration into the review queue.
func (s *Service) SubmitProof(ctx context.Context, regID uuid.UUID, in ProofInput) error {
	if in.Amount <= 0 || in.Method == "" || in.TxnID == "" {
		return fmt.Errorf("%w: amount, method, txn_id required", ErrInvalidInput)
	}
	return inTx(ctx, s.pool, func(tx pgx.Tx) error {
		var status string
		err := tx.QueryRow(ctx, `SELECT status FROM control_plane.school_registration WHERE id=$1`, regID).Scan(&status)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if status != "ONBOARDING" && status != "PENDING_PAYMENT_REVIEW" {
			return ErrBadState
		}
		hash := proofHash(in.TxnID, in.PayerName, in.Amount)
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.payment_proof
			   (id, registration_id, amount, currency, method, txn_id, payer_name, paid_at, storage_key, proof_hash, status)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING')`,
			uuid.Must(uuid.NewV7()), regID, in.Amount, coalesce(in.Currency, "INR"), in.Method, in.TxnID,
			nullStr(in.PayerName), nullTime(in.PaidAt), nullStr(in.StorageKey), hash); err != nil {
			if isUnique(err, "txn_id") || isUnique(err, "proof_hash") {
				return fmt.Errorf("%w: this payment proof was already submitted", ErrInvalidInput)
			}
			return err
		}
		_, err = tx.Exec(ctx,
			`UPDATE control_plane.school_registration SET status='PENDING_PAYMENT_REVIEW', updated_at=now() WHERE id=$1`, regID)
		return err
	})
}

// ---- Platform review -------------------------------------------------------------

// List returns registrations (newest first) with the latest proof status — the queue.
func (s *Service) List(ctx context.Context) ([]RegistrationDTO, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT r.id, r.school_name, r.slug, r.admin_name, r.admin_email, r.status, r.tenant_id, r.created_at,
		        (SELECT pp.status FROM control_plane.payment_proof pp
		          WHERE pp.registration_id = r.id ORDER BY pp.created_at DESC LIMIT 1)
		   FROM control_plane.school_registration r
		  ORDER BY r.created_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RegistrationDTO{}
	for rows.Next() {
		var d RegistrationDTO
		if err := rows.Scan(&d.ID, &d.SchoolName, &d.Slug, &d.AdminName, &d.AdminEmail, &d.Status, &d.TenantID, &d.CreatedAt, &d.ProofStatus); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// RegistrationDetail is a single registration plus its latest payment proof (if any) —
// the data behind the platform registration-review detail page.
type RegistrationDetail struct {
	Registration RegistrationDTO `json:"registration"`
	Proof        *ProofDTO       `json:"proof,omitempty"`
}

// ProofDTO is a payment proof as the review queue / proof detail pages display it.
type ProofDTO struct {
	ID             uuid.UUID  `json:"id"`
	RegistrationID uuid.UUID  `json:"registration_id"`
	SchoolName     string     `json:"school_name"`
	Slug           string     `json:"slug"`
	Amount         float64    `json:"amount"`
	Currency       string     `json:"currency"`
	Method         string     `json:"method"`
	TxnID          string     `json:"txn_id"`
	PayerName      *string    `json:"payer_name,omitempty"`
	PaidAt         *time.Time `json:"paid_at,omitempty"`
	StorageKey     *string    `json:"storage_key,omitempty"`
	Status         string     `json:"status"`
	RejectReason   *string    `json:"reject_reason,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// Detail loads one registration plus its most-recent payment proof — read-only, for the
// platform review detail page.
func (s *Service) Detail(ctx context.Context, regID uuid.UUID) (RegistrationDetail, error) {
	var out RegistrationDetail
	d := &out.Registration
	err := s.pool.QueryRow(ctx,
		`SELECT id, school_name, slug, admin_name, admin_email, status, tenant_id, created_at,
		        (SELECT pp.status FROM control_plane.payment_proof pp
		          WHERE pp.registration_id = school_registration.id ORDER BY pp.created_at DESC LIMIT 1)
		   FROM control_plane.school_registration WHERE id=$1`, regID).
		Scan(&d.ID, &d.SchoolName, &d.Slug, &d.AdminName, &d.AdminEmail, &d.Status, &d.TenantID, &d.CreatedAt, &d.ProofStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return RegistrationDetail{}, ErrNotFound
	}
	if err != nil {
		return RegistrationDetail{}, err
	}

	var p ProofDTO
	err = s.pool.QueryRow(ctx,
		`SELECT id, registration_id, amount, currency, method, txn_id, payer_name, paid_at, storage_key, status, reject_reason, created_at
		   FROM control_plane.payment_proof
		  WHERE registration_id=$1 ORDER BY created_at DESC LIMIT 1`, regID).
		Scan(&p.ID, &p.RegistrationID, &p.Amount, &p.Currency, &p.Method, &p.TxnID, &p.PayerName, &p.PaidAt, &p.StorageKey, &p.Status, &p.RejectReason, &p.CreatedAt)
	if err == nil {
		p.SchoolName = d.SchoolName
		p.Slug = d.Slug
		out.Proof = &p
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return RegistrationDetail{}, err
	}
	return out, nil
}

// ListProofs returns pending payment proofs joined to their registration — the payment
// review queue. Read-only.
func (s *Service) ListProofs(ctx context.Context) ([]ProofDTO, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT pp.id, pp.registration_id, r.school_name, r.slug, pp.amount, pp.currency, pp.method,
		        pp.txn_id, pp.payer_name, pp.paid_at, pp.storage_key, pp.status, pp.reject_reason, pp.created_at
		   FROM control_plane.payment_proof pp
		   JOIN control_plane.school_registration r ON r.id = pp.registration_id
		  WHERE pp.status = 'PENDING'
		  ORDER BY pp.created_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProofDTO{}
	for rows.Next() {
		var p ProofDTO
		if err := rows.Scan(&p.ID, &p.RegistrationID, &p.SchoolName, &p.Slug, &p.Amount, &p.Currency, &p.Method,
			&p.TxnID, &p.PayerName, &p.PaidAt, &p.StorageKey, &p.Status, &p.RejectReason, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Reject sets the registration to REJECTED with a reason and rejects its pending proof.
func (s *Service) Reject(ctx context.Context, adminID, regID uuid.UUID, reason string) error {
	return inTx(ctx, s.pool, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE control_plane.school_registration SET status='REJECTED', reject_reason=$2, updated_at=now()
			  WHERE id=$1 AND status NOT IN ('ACTIVE')`, regID, reason)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx,
			`UPDATE control_plane.payment_proof SET status='REJECTED', reviewed_by=$2, reviewed_at=now(), reject_reason=$3, updated_at=now()
			  WHERE registration_id=$1 AND status='PENDING'`, regID, adminID, reason)
		return err
	})
}

// Approve runs the full platform-side activation, signs a license, and provisions the
// tenant plane. Steps 1–7 (platform) commit in one transaction; provisioning (step 8)
// then runs in the tenant `public` schema (its own transactions, golden rule per write).
func (s *Service) Approve(ctx context.Context, adminID, regID uuid.UUID) (ApproveResult, error) {
	var res ApproveResult
	var adminName, adminEmail string

	err := inTx(ctx, s.pool, func(tx pgx.Tx) error {
		// 1. Load registration (must be awaiting review) + its plan.
		var slug, schoolName, status string
		var planID uuid.UUID
		err := tx.QueryRow(ctx,
			`SELECT slug, school_name, admin_name, admin_email, status, requested_plan_id
			   FROM control_plane.school_registration WHERE id=$1`, regID).
			Scan(&slug, &schoolName, &adminName, &adminEmail, &status, &planID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if status != "PENDING_PAYMENT_REVIEW" {
			return ErrBadState
		}

		// Latest pending proof to approve.
		var proofID uuid.UUID
		err = tx.QueryRow(ctx,
			`SELECT id FROM control_plane.payment_proof
			  WHERE registration_id=$1 AND status='PENDING' ORDER BY created_at DESC LIMIT 1`, regID).Scan(&proofID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNoProof
		}
		if err != nil {
			return err
		}

		// Plan snapshot.
		var planName, cycle, currency string
		var price float64
		var seats int
		var modules []byte
		if err := tx.QueryRow(ctx,
			`SELECT name, billing_cycle, currency, price, seats, enabled_modules
			   FROM control_plane.plan_catalog WHERE id=$1`, planID).
			Scan(&planName, &cycle, &currency, &price, &seats, &modules); err != nil {
			return fmt.Errorf("load plan: %w", err)
		}

		now := time.Now().UTC()
		periodEnd := addCycle(now, cycle)

		// 2. Tenant (provisioned + active).
		tenantID := uuid.Must(uuid.NewV7())
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.tenant (id, slug, name, status, provisioned_at)
			 VALUES ($1,$2,$3,'ACTIVE',now())`, tenantID, slug, schoolName); err != nil {
			return fmt.Errorf("create tenant: %w", err)
		}

		// 3. Subscription (active, period set).
		subID := uuid.Must(uuid.NewV7())
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.subscription
			   (id, tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end, seats)
			 VALUES ($1,$2,$3,'ACTIVE',$4,$5,$6,$7)`,
			subID, tenantID, planID, cycle, now, periodEnd, seats); err != nil {
			return fmt.Errorf("create subscription: %w", err)
		}

		// 4. Gapless invoice number, issued invoice.
		invNo, err := nextInvoiceNo(ctx, tx, now.Year())
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.subscription_invoice
			   (id, tenant_id, subscription_id, number, period, subtotal, total, status, issued_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$6,'ISSUED',now())`,
			uuid.Must(uuid.NewV7()), tenantID, subID, invNo,
			fmt.Sprintf("%s..%s", now.Format("2006-01-02"), periodEnd.Format("2006-01-02")), price); err != nil {
			return fmt.Errorf("create invoice: %w", err)
		}

		// 5. Approve the payment proof.
		if _, err := tx.Exec(ctx,
			`UPDATE control_plane.payment_proof
			    SET status='APPROVED', reviewed_by=$2, reviewed_at=now(), tenant_id=$3, subscription_id=$4, updated_at=now()
			  WHERE id=$1`, proofID, adminID, tenantID, subID); err != nil {
			return fmt.Errorf("approve proof: %w", err)
		}

		// 6. Registration → ACTIVE, bound to the tenant.
		if _, err := tx.Exec(ctx,
			`UPDATE control_plane.school_registration SET status='ACTIVE', tenant_id=$2, updated_at=now() WHERE id=$1`,
			regID, tenantID); err != nil {
			return fmt.Errorf("activate registration: %w", err)
		}

		// 7. Sign + store the license.
		var moduleList []string
		_ = json.Unmarshal(modules, &moduleList)
		licID := uuid.Must(uuid.NewV7())
		const graceDays = 14
		token, sig, err := s.signer.Sign(license.Claims{
			TenantID: tenantID, SubscriptionID: subID, Plan: planName, Seats: seats,
			EnabledModules: moduleList, IssuedAt: now, ExpiresAt: periodEnd, GraceDays: graceDays,
		})
		if err != nil {
			return fmt.Errorf("sign license: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.license
			   (id, tenant_id, subscription_id, plan, seats, enabled_modules, signed_token, signature, issued_at, expires_at, grace_days)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10)`,
			licID, tenantID, subID, planName, seats, modules, token, sig, periodEnd, graceDays); err != nil {
			return fmt.Errorf("store license: %w", err)
		}

		res = ApproveResult{
			TenantID: tenantID, Slug: slug, SubscriptionID: subID,
			InvoiceNumber: invNo, LicenseID: licID, LicenseExpires: periodEnd,
		}
		return nil
	})
	if err != nil {
		return ApproveResult{}, err
	}

	// 8. Cross-plane handoff: provision the tenant plane (separate schema, own txs).
	login, tempPass, err := provisionTenantPlane(ctx, s.pool, s.nodeID, res.TenantID, res.Slug, adminName, adminEmail)
	if err != nil {
		return ApproveResult{}, fmt.Errorf("tenant provisioning failed (platform records committed): %w", err)
	}
	res.AdminLogin = login
	res.AdminTempPass = tempPass
	return res, nil
}

// ---- Cross-plane provisioning (writes the tenant `public` schema) -----------------

func provisionTenantPlane(ctx context.Context, pool *pgxpool.Pool, nodeID, tenantID uuid.UUID, slug, adminName, adminRealEmail string) (login, tempPass string, err error) {
	// Generate the tenant admin's login handle (EMPLOYEE) — globally unique vs public.users.
	handle, err := credential.GenerateHandle(adminName, "EMPLOYEE", slug, func(candidate string) (bool, error) {
		var exists bool
		e := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE lower(login_identifier)=lower($1))`, candidate).Scan(&exists)
		return exists, e
	})
	if err != nil {
		return "", "", err
	}
	tempPass, err = credential.TempPassword()
	if err != nil {
		return "", "", err
	}
	hash, err := crypto.HashPassword(tempPass)
	if err != nil {
		return "", "", err
	}

	userID := uuid.Must(uuid.NewV7())
	membershipID := uuid.Must(uuid.NewV7())
	hlc := strconv.FormatInt(time.Now().UnixNano(), 10)

	// First admin: user + membership (EMPLOYEE) in one tenant tx (golden rule).
	if err := inTenantTx(ctx, pool, tenantID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`INSERT INTO users (id, login_identifier, password_hash, must_reset_password, real_contact_email, status, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,true,$4,'ACTIVE',$5,1,$6)`,
			userID, handle, hash, nullStr(adminRealEmail), hlc, nodeID); err != nil {
			return fmt.Errorf("insert user: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO memberships (id, tenant_id, user_id, user_type, status, hlc, version, origin_node_id)
			 VALUES ($1,$2,$3,'EMPLOYEE','ACTIVE',$4,1,$5)`,
			membershipID, tenantID, userID, hlc, nodeID); err != nil {
			return fmt.Errorf("insert membership: %w", err)
		}
		payload, _ := json.Marshal(map[string]any{"membership_id": membershipID, "user_id": userID, "login": handle})
		if _, err := tx.Exec(ctx,
			`INSERT INTO outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
			 VALUES ($1,$2,'membership',$3,'CREATE',$4,$5,$6)`,
			uuid.Must(uuid.NewV7()), tenantID, membershipID, payload, hlc, nodeID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO audit_log (id, tenant_id, action, resource_type, resource_id, after, origin_node_id)
			 VALUES ($1,$2,'membership.create','membership',$3,$4,$5)`,
			uuid.Must(uuid.NewV7()), tenantID, membershipID, payload, nodeID)
		return err
	}); err != nil {
		return "", "", err
	}

	// RBAC bootstrap (default roles + attach School Admin) and tenant profile (slug).
	accessRepo := access.NewRepo(pool, nodeID)
	if err := access.SeedCatalog(ctx, accessRepo); err != nil {
		return "", "", err
	}
	if err := access.BootstrapTenant(ctx, accessRepo, tenantID, membershipID); err != nil {
		return "", "", err
	}
	if err := students.SeedTenantProfile(ctx, students.NewRepo(pool, nodeID), tenantID, slug, adminName+"'s School"); err != nil {
		return "", "", err
	}
	// Every provisioned school needs a current academic year before it can create
	// sections/exams (full tenant-setup — terms/rooms/multiple years — comes later).
	if err := academics.SeedDefaultAcademicYear(ctx, onboarding.NewEngine(pool, nodeID), tenantID); err != nil {
		return "", "", err
	}
	return handle, tempPass, nil
}

// ---- HTTP ------------------------------------------------------------------------

// RegisterPublic mounts the unauthenticated self-service endpoints.
func RegisterPublic(r chi.Router, svc *Service) {
	// Public plan catalog — drives the signup site's plan picker.
	r.Get("/api/v1/plans", func(w http.ResponseWriter, req *http.Request) {
		rows, err := svc.pool.Query(req.Context(),
			`SELECT id, name, tier, currency, price, billing_cycle, seats, enabled_modules
			   FROM control_plane.plan_catalog WHERE is_active ORDER BY price`)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		defer rows.Close()
		type plan struct {
			ID             uuid.UUID       `json:"id"`
			Name           string          `json:"name"`
			Tier           string          `json:"tier"`
			Currency       string          `json:"currency"`
			Price          float64         `json:"price"`
			BillingCycle   string          `json:"billing_cycle"`
			Seats          int             `json:"seats"`
			EnabledModules json.RawMessage `json:"enabled_modules"`
		}
		out := []plan{}
		for rows.Next() {
			var p plan
			if err := rows.Scan(&p.ID, &p.Name, &p.Tier, &p.Currency, &p.Price, &p.BillingCycle, &p.Seats, &p.EnabledModules); err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			out = append(out, p)
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"plans": out})
	})

	// Public read of a registration's status (signup site polls this).
	r.Get("/api/v1/registrations/{id}", func(w http.ResponseWriter, req *http.Request) {
		id, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid id")
			return
		}
		var dto RegistrationDTO
		var proof *string
		err = svc.pool.QueryRow(req.Context(),
			`SELECT r.id, r.school_name, r.slug, r.admin_name, r.admin_email, r.status, r.tenant_id, r.created_at,
			        (SELECT pp.status FROM control_plane.payment_proof pp WHERE pp.registration_id=r.id ORDER BY pp.created_at DESC LIMIT 1)
			   FROM control_plane.school_registration r WHERE r.id=$1`, id).
			Scan(&dto.ID, &dto.SchoolName, &dto.Slug, &dto.AdminName, &dto.AdminEmail, &dto.Status, &dto.TenantID, &dto.CreatedAt, &proof)
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "not found")
			return
		}
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		dto.ProofStatus = proof
		httpx.JSON(w, http.StatusOK, dto)
	})

	r.Post("/api/v1/register", func(w http.ResponseWriter, req *http.Request) {
		var in RegisterInput
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		dto, err := svc.Register(req.Context(), in)
		if err != nil {
			writeErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, dto)
	})

	r.Post("/api/v1/registrations/{id}/payment-proof", func(w http.ResponseWriter, req *http.Request) {
		id, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid registration id")
			return
		}
		var in ProofInput
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := svc.SubmitProof(req.Context(), id, in); err != nil {
			writeErr(w, err)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})
}

// RegisterPlatform mounts the superadmin review/approve endpoints (platform-gated).
func RegisterPlatform(r chi.Router, svc *Service) {
	r.With(platform.RequirePermission(platform.PermRegistrationReview)).
		Get("/api/v1/platform/registrations", func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.List(req.Context())
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"registrations": list})
		})

	r.With(platform.RequirePermission(platform.PermRegistrationReview)).
		Get("/api/v1/platform/registrations/{id}", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			detail, err := svc.Detail(req.Context(), id)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, detail)
		})

	r.With(platform.RequirePermission(platform.PermPaymentReview)).
		Get("/api/v1/platform/payment-proofs", func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.ListProofs(req.Context())
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"payment_proofs": list})
		})

	r.With(platform.RequirePermission(platform.PermPaymentReview)).
		Post("/api/v1/platform/registrations/{id}/approve", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			ident, _ := platform.IdentityFrom(req.Context())
			res, err := svc.Approve(req.Context(), ident.AdminID, id)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, res)
		})

	r.With(platform.RequirePermission(platform.PermRegistrationReview)).
		Post("/api/v1/platform/registrations/{id}/reject", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			var in struct {
				Reason string `json:"reason"`
			}
			_ = json.NewDecoder(req.Body).Decode(&in)
			ident, _ := platform.IdentityFrom(req.Context())
			if err := svc.Reject(req.Context(), ident.AdminID, id, coalesce(in.Reason, "rejected")); err != nil {
				writeErr(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

	r.With(platform.RequirePermission(platform.PermTenantManage)).
		Get("/api/v1/platform/tenants", func(w http.ResponseWriter, req *http.Request) {
			rows, err := svc.pool.Query(req.Context(),
				`SELECT id, slug, name, status, provisioned_at FROM control_plane.tenant ORDER BY created_at DESC`)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			defer rows.Close()
			type tdto struct {
				ID            uuid.UUID  `json:"id"`
				Slug          string     `json:"slug"`
				Name          string     `json:"name"`
				Status        string     `json:"status"`
				ProvisionedAt *time.Time `json:"provisioned_at,omitempty"`
			}
			out := []tdto{}
			for rows.Next() {
				var t tdto
				if err := rows.Scan(&t.ID, &t.Slug, &t.Name, &t.Status, &t.ProvisionedAt); err != nil {
					httpx.Error(w, http.StatusInternalServerError, err.Error())
					return
				}
				out = append(out, t)
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"tenants": out})
		})

	r.With(platform.RequirePermission(platform.PermLicenseManage)).
		Get("/api/v1/platform/licenses", func(w http.ResponseWriter, req *http.Request) {
			rows, err := svc.pool.Query(req.Context(),
				`SELECT l.id, t.slug, l.plan, l.seats, l.issued_at, l.expires_at, l.revoked
				   FROM control_plane.license l JOIN control_plane.tenant t ON t.id = l.tenant_id
				  ORDER BY l.issued_at DESC`)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			defer rows.Close()
			type ldto struct {
				ID         uuid.UUID `json:"id"`
				TenantSlug string    `json:"tenant_slug"`
				Plan       string    `json:"plan"`
				Seats      int       `json:"seats"`
				IssuedAt   time.Time `json:"issued_at"`
				ExpiresAt  time.Time `json:"expires_at"`
				Revoked    bool      `json:"revoked"`
			}
			out := []ldto{}
			for rows.Next() {
				var l ldto
				if err := rows.Scan(&l.ID, &l.TenantSlug, &l.Plan, &l.Seats, &l.IssuedAt, &l.ExpiresAt, &l.Revoked); err != nil {
					httpx.Error(w, http.StatusInternalServerError, err.Error())
					return
				}
				out = append(out, l)
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"licenses": out})
		})
}

// ---- helpers ---------------------------------------------------------------------

func inTx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func inTenantTx(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID, fn func(pgx.Tx) error) error {
	return inTx(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
			return fmt.Errorf("set tenant: %w", err)
		}
		return fn(tx)
	})
}

// nextInvoiceNo advances a gapless per-year counter inside the approval tx.
func nextInvoiceNo(ctx context.Context, tx pgx.Tx, year int) (string, error) {
	name := fmt.Sprintf("invoice:%d", year)
	var v int64
	err := tx.QueryRow(ctx,
		`INSERT INTO control_plane.counter (name, value) VALUES ($1, 1)
		 ON CONFLICT (name) DO UPDATE SET value = control_plane.counter.value + 1
		 RETURNING value`, name).Scan(&v)
	if err != nil {
		return "", fmt.Errorf("invoice counter: %w", err)
	}
	return fmt.Sprintf("INV-%d-%05d", year, v), nil
}

func addCycle(t time.Time, cycle string) time.Time {
	switch cycle {
	case "MONTHLY":
		return t.AddDate(0, 1, 0)
	case "QUARTERLY":
		return t.AddDate(0, 3, 0)
	default: // ANNUAL
		return t.AddDate(1, 0, 0)
	}
}

func proofHash(txnID, payer string, amount float64) string {
	return fmt.Sprintf("%s|%s|%.2f", txnID, payer, amount)
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not found")
	case errors.Is(err, ErrBadSlug), errors.Is(err, ErrInvalidInput):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrSlugTaken), errors.Is(err, ErrEmailTaken):
		httpx.Error(w, http.StatusConflict, err.Error())
	case errors.Is(err, ErrBadState), errors.Is(err, ErrNoProof):
		httpx.Error(w, http.StatusUnprocessableEntity, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
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
func coalesce(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
func isUnique(err error, col string) bool {
	return err != nil && contains(err.Error(), "SQLSTATE 23505") && contains(err.Error(), col)
}
func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
