// Super-Admin Platform v2 (M9, docs/promts.md) — analytics, license lifecycle, plan
// management, tenant operations, and the payment-proof clarification flow. These extend the
// control-plane `registration` slice; like the rest of the package they are plain
// transactional writes (control_plane tables carry no tenant_id/RLS/sync).
//
// License mutations additionally write a control_plane.cp_outbox row (aggregate `license`)
// so the change can push down to the owning node over NATS (docs/08) once node-side license
// enforcement is wired — the cloud emits the event regardless.
package registration

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

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/license"
)

// ───────────────────────────── shared helpers ──────────────────────────────

// cpHLC stamps a monotonic-ish clock for cp_outbox rows (legacy-nanos form, which the
// node merge layer's hlc.Compare tolerates — docs/08, internal/platform/hlc).
func cpHLC() string { return strconv.FormatInt(time.Now().UnixNano(), 10) }

// emitLicenseConfig queues a cloud→node config push for a license change.
func (s *Service) emitLicenseConfig(ctx context.Context, tx pgx.Tx, tenantID, licenseID uuid.UUID, op string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO control_plane.cp_outbox
		   (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
		 VALUES ($1,$2,'license',$3,$4,$5,$6,$7)`,
		uuid.Must(uuid.NewV7()), tenantID, licenseID, op, body, cpHLC(), s.nodeID)
	return err
}

type series struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
}

// ───────────────────────────── registration analytics ─────────────────────

type RegistrationAnalytics struct {
	Total           int      `json:"total"`
	Pending         int      `json:"pending"`
	UnderReview     int      `json:"under_review"`
	Approved        int      `json:"approved"`
	Rejected        int      `json:"rejected"`
	ApprovalRatePct float64  `json:"approval_rate_pct"`
	AvgApprovalHrs  float64  `json:"avg_approval_hours"`
	VolumePerDay    []series `json:"volume_per_day"`
	Funnel          []series `json:"funnel"`
}

func (s *Service) RegistrationAnalytics(ctx context.Context) (RegistrationAnalytics, error) {
	var a RegistrationAnalytics
	err := s.pool.QueryRow(ctx, `
		SELECT
		  count(*),
		  count(*) FILTER (WHERE status IN ('ADMIN_REGISTERED','ONBOARDING','PENDING_PAYMENT_REVIEW')),
		  count(*) FILTER (WHERE status = 'PENDING_PAYMENT_REVIEW'),
		  count(*) FILTER (WHERE status = 'ACTIVE'),
		  count(*) FILTER (WHERE status = 'REJECTED'),
		  COALESCE(avg(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0)
		           FILTER (WHERE status = 'ACTIVE'), 0)
		FROM control_plane.school_registration`).
		Scan(&a.Total, &a.Pending, &a.UnderReview, &a.Approved, &a.Rejected, &a.AvgApprovalHrs)
	if err != nil {
		return a, err
	}
	if a.Approved+a.Rejected > 0 {
		a.ApprovalRatePct = round1(float64(a.Approved) / float64(a.Approved+a.Rejected) * 100)
	}
	a.AvgApprovalHrs = round1(a.AvgApprovalHrs)

	// Request volume per day (last 30 days).
	a.VolumePerDay, err = s.dateSeries(ctx,
		`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD'), count(*)
		   FROM control_plane.school_registration
		  WHERE created_at >= now() - interval '30 days'
		  GROUP BY 1 ORDER BY 1`)
	if err != nil {
		return a, err
	}

	// Funnel: Submitted → Reviewed → Approved → Activated.
	var submitted, reviewed, approved, activated int
	if err := s.pool.QueryRow(ctx, `
		SELECT count(*),
		       count(*) FILTER (WHERE status IN ('PENDING_PAYMENT_REVIEW','ACTIVE','REJECTED')),
		       count(*) FILTER (WHERE status = 'ACTIVE'),
		       count(*) FILTER (WHERE status = 'ACTIVE' AND tenant_id IS NOT NULL)
		  FROM control_plane.school_registration`).
		Scan(&submitted, &reviewed, &approved, &activated); err != nil {
		return a, err
	}
	a.Funnel = []series{
		{Label: "Submitted", Value: float64(submitted)},
		{Label: "Reviewed", Value: float64(reviewed)},
		{Label: "Approved", Value: float64(approved)},
		{Label: "Activated", Value: float64(activated)},
	}
	return a, nil
}

// Remind records a superadmin nudge on a pending registration (email delivery later).
func (s *Service) Remind(ctx context.Context, regID uuid.UUID) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE control_plane.school_registration SET reminded_at = now(), updated_at = now()
		  WHERE id = $1 AND status NOT IN ('ACTIVE','REJECTED')`, regID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ───────────────────────────── payment analytics + clarification ──────────

type PaymentAnalytics struct {
	Pending            int     `json:"pending"`
	ApprovalRatePct    float64 `json:"approval_rate_pct"`
	AvgVerificationHrs float64 `json:"avg_verification_hours"`
}

func (s *Service) PaymentAnalytics(ctx context.Context) (PaymentAnalytics, error) {
	var a PaymentAnalytics
	var approved, rejected int
	err := s.pool.QueryRow(ctx, `
		SELECT
		  count(*) FILTER (WHERE status = 'PENDING'),
		  count(*) FILTER (WHERE status = 'APPROVED'),
		  count(*) FILTER (WHERE status = 'REJECTED'),
		  COALESCE(avg(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600.0)
		           FILTER (WHERE status = 'APPROVED' AND reviewed_at IS NOT NULL), 0)
		FROM control_plane.payment_proof`).
		Scan(&a.Pending, &approved, &rejected, &a.AvgVerificationHrs)
	if err != nil {
		return a, err
	}
	if approved+rejected > 0 {
		a.ApprovalRatePct = round1(float64(approved) / float64(approved+rejected) * 100)
	}
	a.AvgVerificationHrs = round1(a.AvgVerificationHrs)
	return a, nil
}

// RequestClarification moves a payment proof to INFO_REQUESTED with a note. The school's
// public status poll surfaces the note so they can re-submit.
func (s *Service) RequestClarification(ctx context.Context, adminID, proofID uuid.UUID, note string) error {
	if note == "" {
		return fmt.Errorf("%w: clarification note required", ErrInvalidInput)
	}
	ct, err := s.pool.Exec(ctx,
		`UPDATE control_plane.payment_proof
		    SET status='INFO_REQUESTED', clarification_note=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now()
		  WHERE id=$1 AND status='PENDING'`, proofID, note, adminID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ───────────────────────────── license lifecycle ───────────────────────────

type LicenseDTO struct {
	ID          uuid.UUID `json:"id"`
	TenantID    uuid.UUID `json:"tenant_id"`
	TenantSlug  string    `json:"tenant_slug"`
	Plan        string    `json:"plan"`
	Seats       int       `json:"seats"`
	Status      string    `json:"status"`
	AutoRenew   bool      `json:"auto_renew"`
	CancelAtEnd bool      `json:"cancel_at_period_end"`
	IssuedAt    time.Time `json:"issued_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	Revoked     bool      `json:"revoked"`
}

func (s *Service) ListLicenses(ctx context.Context) ([]LicenseDTO, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT l.id, l.tenant_id, t.slug, l.plan, l.seats, l.status, l.auto_renew,
		        l.cancel_at_period_end, l.issued_at, l.expires_at, l.revoked
		   FROM control_plane.license l JOIN control_plane.tenant t ON t.id = l.tenant_id
		  WHERE l.superseded_by IS NULL
		  ORDER BY l.issued_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LicenseDTO{}
	for rows.Next() {
		var l LicenseDTO
		if err := rows.Scan(&l.ID, &l.TenantID, &l.TenantSlug, &l.Plan, &l.Seats, &l.Status,
			&l.AutoRenew, &l.CancelAtEnd, &l.IssuedAt, &l.ExpiresAt, &l.Revoked); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// SetLicenseState handles suspend/resume (status + the revoked mirror the node reads).
func (s *Service) SetLicenseState(ctx context.Context, licID uuid.UUID, status string, revoked bool) error {
	return inTx(ctx, s.pool, func(tx pgx.Tx) error {
		var tenantID uuid.UUID
		var token, sig string
		var expires time.Time
		err := tx.QueryRow(ctx,
			`UPDATE control_plane.license
			    SET status=$2, revoked=$3, updated_at=now()
			  WHERE id=$1 AND superseded_by IS NULL
			RETURNING tenant_id, signed_token, signature, expires_at`, licID, status, revoked).
			Scan(&tenantID, &token, &sig, &expires)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		return s.emitLicenseConfig(ctx, tx, tenantID, licID, "UPDATE", map[string]any{
			"id": licID, "status": status, "revoked": revoked,
			"signed_token": token, "signature": sig, "expires_at": expires,
		})
	})
}

// CancelLicense ends a license now (immediate) or flags it to end at the period boundary.
func (s *Service) CancelLicense(ctx context.Context, licID uuid.UUID, immediate bool) error {
	return inTx(ctx, s.pool, func(tx pgx.Tx) error {
		var (
			tenantID     uuid.UUID
			token, sig   string
			expires      time.Time
			status       string
			revoked      bool
			cancelAtEnd  bool
			cancelledNow *time.Time
		)
		if immediate {
			status, revoked, cancelAtEnd = "CANCELLED", true, false
			now := time.Now().UTC()
			cancelledNow = &now
		} else {
			status, revoked, cancelAtEnd = "ACTIVE", false, true
		}
		err := tx.QueryRow(ctx,
			`UPDATE control_plane.license
			    SET status=$2, revoked=$3, cancel_at_period_end=$4, cancelled_at=$5, updated_at=now()
			  WHERE id=$1 AND superseded_by IS NULL
			RETURNING tenant_id, signed_token, signature, expires_at`,
			licID, status, revoked, cancelAtEnd, cancelledNow).
			Scan(&tenantID, &token, &sig, &expires)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		return s.emitLicenseConfig(ctx, tx, tenantID, licID, "UPDATE", map[string]any{
			"id": licID, "status": status, "revoked": revoked,
			"cancel_at_period_end": cancelAtEnd, "signed_token": token, "signature": sig, "expires_at": expires,
		})
	})
}

// reissue re-signs a fresh license row for the same tenant, superseding the old one. Used
// by Extend / Upgrade — a license is an immutable signed artifact, so a change is a new row.
func (s *Service) reissue(ctx context.Context, oldID uuid.UUID, mutate func(c *license.Claims)) (uuid.UUID, error) {
	var newID uuid.UUID
	err := inTx(ctx, s.pool, func(tx pgx.Tx) error {
		var (
			tenantID, subID uuid.UUID
			plan            string
			seats, grace    int
			modules         []byte
			issuedAt        time.Time
			expiresAt       time.Time
		)
		err := tx.QueryRow(ctx,
			`SELECT tenant_id, subscription_id, plan, seats, enabled_modules, issued_at, expires_at, grace_days
			   FROM control_plane.license WHERE id=$1 AND superseded_by IS NULL`, oldID).
			Scan(&tenantID, &subID, &plan, &seats, &modules, &issuedAt, &expiresAt, &grace)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		var moduleList []string
		_ = json.Unmarshal(modules, &moduleList)
		now := time.Now().UTC()
		claims := license.Claims{
			TenantID: tenantID, SubscriptionID: subID, Plan: plan, Seats: seats,
			EnabledModules: moduleList, IssuedAt: now, ExpiresAt: expiresAt, GraceDays: grace,
		}
		mutate(&claims)
		token, sig, err := s.signer.Sign(claims)
		if err != nil {
			return fmt.Errorf("sign license: %w", err)
		}
		newModules, _ := json.Marshal(claims.EnabledModules)
		newID = uuid.Must(uuid.NewV7())
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.license
			   (id, tenant_id, subscription_id, plan, seats, enabled_modules, signed_token, signature,
			    issued_at, expires_at, grace_days, status)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,'ACTIVE')`,
			newID, tenantID, subID, claims.Plan, claims.Seats, newModules, token, sig, claims.ExpiresAt, grace); err != nil {
			return fmt.Errorf("store license: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`UPDATE control_plane.license SET superseded_by=$2, status='EXPIRED', updated_at=now() WHERE id=$1`,
			oldID, newID); err != nil {
			return err
		}
		return s.emitLicenseConfig(ctx, tx, tenantID, newID, "UPDATE", map[string]any{
			"id": newID, "status": "ACTIVE", "revoked": false,
			"plan": claims.Plan, "seats": claims.Seats, "enabled_modules": claims.EnabledModules,
			"signed_token": token, "signature": sig, "expires_at": claims.ExpiresAt,
		})
	})
	return newID, err
}

// ExtendLicense pushes the expiry out by `days` and re-signs.
func (s *Service) ExtendLicense(ctx context.Context, licID uuid.UUID, days int) (uuid.UUID, error) {
	if days <= 0 {
		return uuid.Nil, fmt.Errorf("%w: days must be positive", ErrInvalidInput)
	}
	return s.reissue(ctx, licID, func(c *license.Claims) {
		c.ExpiresAt = c.ExpiresAt.AddDate(0, 0, days)
	})
}

// ChangeLicensePlan upgrades/downgrades the license to another plan's seats/modules and re-signs.
func (s *Service) ChangeLicensePlan(ctx context.Context, licID, planID uuid.UUID) (uuid.UUID, error) {
	var (
		planName string
		seats    int
		modules  []byte
	)
	if err := s.pool.QueryRow(ctx,
		`SELECT name, seats, enabled_modules FROM control_plane.plan_catalog WHERE id=$1`, planID).
		Scan(&planName, &seats, &modules); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, fmt.Errorf("%w: plan not found", ErrInvalidInput)
		}
		return uuid.Nil, err
	}
	var moduleList []string
	_ = json.Unmarshal(modules, &moduleList)
	return s.reissue(ctx, licID, func(c *license.Claims) {
		c.Plan = planName
		c.Seats = seats
		c.EnabledModules = moduleList
	})
}

type LicenseAnalytics struct {
	Total             int      `json:"total"`
	Active            int      `json:"active"`
	ExpiringThisMonth int      `json:"expiring_this_month"`
	CancelledThisMon  int      `json:"cancelled_this_month"`
	NewThisMonth      int      `json:"new_this_month"`
	Distribution      []series `json:"distribution"`
}

func (s *Service) LicenseAnalytics(ctx context.Context) (LicenseAnalytics, error) {
	var a LicenseAnalytics
	err := s.pool.QueryRow(ctx, `
		SELECT
		  count(*) FILTER (WHERE superseded_by IS NULL),
		  count(*) FILTER (WHERE superseded_by IS NULL AND status='ACTIVE'),
		  count(*) FILTER (WHERE superseded_by IS NULL AND status='ACTIVE'
		                   AND expires_at >= now() AND expires_at < date_trunc('month', now()) + interval '1 month'),
		  count(*) FILTER (WHERE status='CANCELLED' AND cancelled_at >= date_trunc('month', now())),
		  count(*) FILTER (WHERE issued_at >= date_trunc('month', now()))
		FROM control_plane.license`).
		Scan(&a.Total, &a.Active, &a.ExpiringThisMonth, &a.CancelledThisMon, &a.NewThisMonth)
	if err != nil {
		return a, err
	}
	a.Distribution, err = s.dateSeries(ctx,
		`SELECT plan, count(*) FROM control_plane.license
		  WHERE superseded_by IS NULL AND status='ACTIVE' GROUP BY plan ORDER BY count(*) DESC`)
	return a, err
}

// ───────────────────────────── subscriptions analytics ─────────────────────

type SubscriptionAnalytics struct {
	MRR              float64  `json:"mrr"`
	ARR              float64  `json:"arr"`
	GrowthPct        float64  `json:"growth_pct"`
	ActiveTenants    int      `json:"active_tenants"`
	NewTenants       int      `json:"new_tenants"`
	ChurnRatePct     float64  `json:"churn_rate_pct"`
	LicensesActive   int      `json:"licenses_active"`
	LicensesExpired  int      `json:"licenses_expired"`
	LicensesSuspend  int      `json:"licenses_suspended"`
	RevenueTrend     []series `json:"revenue_trend"`
	SubscriptionGrow []series `json:"subscription_growth"`
	PlanPopularity   []series `json:"plan_popularity"`
}

func (s *Service) SubscriptionAnalytics(ctx context.Context) (SubscriptionAnalytics, error) {
	var a SubscriptionAnalytics

	// MRR — sum of active subscriptions' plan price normalized to a month.
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(sum(
		         CASE p.billing_cycle
		           WHEN 'MONTHLY'   THEN p.price
		           WHEN 'QUARTERLY' THEN p.price / 3.0
		           ELSE p.price / 12.0
		         END), 0)
		  FROM control_plane.subscription s
		  JOIN control_plane.plan_catalog p ON p.id = s.plan_id
		 WHERE s.status = 'ACTIVE'`).Scan(&a.MRR); err != nil {
		return a, err
	}
	a.MRR = round1(a.MRR)
	a.ARR = round1(a.MRR * 12)

	var churned int
	if err := s.pool.QueryRow(ctx, `
		SELECT
		  count(*) FILTER (WHERE status='ACTIVE'),
		  count(*) FILTER (WHERE created_at >= date_trunc('month', now())),
		  count(*) FILTER (WHERE status IN ('CANCELLED','EXPIRED'))
		FROM control_plane.subscription`).
		Scan(&a.ActiveTenants, &a.NewTenants, &churned); err != nil {
		return a, err
	}
	if a.ActiveTenants+churned > 0 {
		a.ChurnRatePct = round1(float64(churned) / float64(a.ActiveTenants+churned) * 100)
	}

	// Month-over-month new-subscription growth proxy.
	var thisMonth, lastMonth int
	if err := s.pool.QueryRow(ctx, `
		SELECT
		  count(*) FILTER (WHERE created_at >= date_trunc('month', now())),
		  count(*) FILTER (WHERE created_at >= date_trunc('month', now()) - interval '1 month'
		                   AND created_at <  date_trunc('month', now()))
		FROM control_plane.subscription`).Scan(&thisMonth, &lastMonth); err != nil {
		return a, err
	}
	if lastMonth > 0 {
		a.GrowthPct = round1(float64(thisMonth-lastMonth) / float64(lastMonth) * 100)
	} else if thisMonth > 0 {
		a.GrowthPct = 100
	}

	if err := s.pool.QueryRow(ctx, `
		SELECT
		  count(*) FILTER (WHERE superseded_by IS NULL AND status='ACTIVE'),
		  count(*) FILTER (WHERE superseded_by IS NULL AND status IN ('EXPIRED','CANCELLED')),
		  count(*) FILTER (WHERE superseded_by IS NULL AND status='SUSPENDED')
		FROM control_plane.license`).
		Scan(&a.LicensesActive, &a.LicensesExpired, &a.LicensesSuspend); err != nil {
		return a, err
	}

	var err error
	if a.RevenueTrend, err = s.dateSeries(ctx,
		`SELECT to_char(date_trunc('month', issued_at), 'YYYY-MM'), COALESCE(sum(total),0)
		   FROM control_plane.subscription_invoice
		  WHERE issued_at >= now() - interval '6 months'
		  GROUP BY 1 ORDER BY 1`); err != nil {
		return a, err
	}
	if a.SubscriptionGrow, err = s.dateSeries(ctx,
		`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM'), count(*)
		   FROM control_plane.subscription
		  WHERE created_at >= now() - interval '6 months'
		  GROUP BY 1 ORDER BY 1`); err != nil {
		return a, err
	}
	if a.PlanPopularity, err = s.dateSeries(ctx,
		`SELECT p.name, count(*)
		   FROM control_plane.subscription s JOIN control_plane.plan_catalog p ON p.id = s.plan_id
		  WHERE s.status='ACTIVE' GROUP BY p.name ORDER BY count(*) DESC`); err != nil {
		return a, err
	}
	return a, nil
}

// ───────────────────────────── plan management ─────────────────────────────

type PlanInput struct {
	Name           string          `json:"name"`
	Tier           string          `json:"tier"`
	Currency       string          `json:"currency"`
	Price          float64         `json:"price"`
	AnnualPrice    float64         `json:"annual_price"`
	BillingCycle   string          `json:"billing_cycle"`
	Seats          int             `json:"seats"`
	EnabledModules json.RawMessage `json:"enabled_modules"`
}

type PlanDTO struct {
	ID                uuid.UUID       `json:"id"`
	Name              string          `json:"name"`
	Tier              string          `json:"tier"`
	Currency          string          `json:"currency"`
	Price             float64         `json:"price"`
	AnnualPrice       float64         `json:"annual_price"`
	BillingCycle      string          `json:"billing_cycle"`
	Seats             int             `json:"seats"`
	EnabledModules    json.RawMessage `json:"enabled_modules"`
	Status            string          `json:"status"`
	ActiveSubscribers int             `json:"active_subscribers"`
	CreatedAt         time.Time       `json:"created_at"`
}

func (s *Service) ListPlans(ctx context.Context) ([]PlanDTO, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT p.id, p.name, p.tier, p.currency, p.price, p.annual_price, p.billing_cycle, p.seats,
		        p.enabled_modules, p.status, p.created_at,
		        (SELECT count(*) FROM control_plane.subscription s WHERE s.plan_id=p.id AND s.status='ACTIVE')
		   FROM control_plane.plan_catalog p ORDER BY p.price`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PlanDTO{}
	for rows.Next() {
		var p PlanDTO
		if err := rows.Scan(&p.ID, &p.Name, &p.Tier, &p.Currency, &p.Price, &p.AnnualPrice, &p.BillingCycle,
			&p.Seats, &p.EnabledModules, &p.Status, &p.CreatedAt, &p.ActiveSubscribers); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Service) CreatePlan(ctx context.Context, in PlanInput) (uuid.UUID, error) {
	if in.Name == "" || in.BillingCycle == "" {
		return uuid.Nil, fmt.Errorf("%w: name and billing_cycle required", ErrInvalidInput)
	}
	modules := in.EnabledModules
	if len(modules) == 0 {
		modules = json.RawMessage("[]")
	}
	id := uuid.Must(uuid.NewV7())
	currency := coalesce(in.Currency, "INR")
	// Plan + its version-1 price point commit together (M11).
	err := inTx(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.plan_catalog
			   (id, name, tier, currency, price, annual_price, billing_cycle, seats, enabled_modules, is_active, status)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'ACTIVE')`,
			id, in.Name, coalesce(in.Tier, "T1"), currency, in.Price, in.AnnualPrice,
			in.BillingCycle, in.Seats, modules); err != nil {
			return err
		}
		return insertPlanVersionV1(ctx, tx, id, in.Price, in.AnnualPrice, currency)
	})
	return id, err
}

func (s *Service) UpdatePlan(ctx context.Context, id uuid.UUID, in PlanInput) error {
	modules := in.EnabledModules
	if len(modules) == 0 {
		modules = json.RawMessage("[]")
	}
	ct, err := s.pool.Exec(ctx,
		`UPDATE control_plane.plan_catalog
		    SET name=$2, tier=$3, currency=$4, price=$5, annual_price=$6, billing_cycle=$7,
		        seats=$8, enabled_modules=$9, updated_at=now()
		  WHERE id=$1`,
		id, in.Name, coalesce(in.Tier, "T1"), coalesce(in.Currency, "INR"), in.Price, in.AnnualPrice,
		in.BillingCycle, in.Seats, modules)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) DuplicatePlan(ctx context.Context, id uuid.UUID) (uuid.UUID, error) {
	newID := uuid.Must(uuid.NewV7())
	err := inTx(ctx, s.pool, func(tx pgx.Tx) error {
		var price, annual float64
		var currency string
		err := tx.QueryRow(ctx,
			`INSERT INTO control_plane.plan_catalog
			   (id, name, tier, currency, price, annual_price, billing_cycle, seats, enabled_modules, is_active, status)
			 SELECT $1, name || ' (copy)', tier, currency, price, annual_price, billing_cycle, seats,
			        enabled_modules, false, 'ACTIVE'
			   FROM control_plane.plan_catalog WHERE id=$2
			 RETURNING price, annual_price, currency`, newID, id).Scan(&price, &annual, &currency)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		return insertPlanVersionV1(ctx, tx, newID, price, annual, currency)
	})
	if err != nil {
		return uuid.Nil, err
	}
	return newID, nil
}

func (s *Service) ArchivePlan(ctx context.Context, id uuid.UUID) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE control_plane.plan_catalog SET status='ARCHIVED', is_active=false, updated_at=now() WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ───────────────────────────── tenant operations ───────────────────────────

type TenantRowDTO struct {
	ID             uuid.UUID  `json:"id"`
	Slug           string     `json:"slug"`
	Name           string     `json:"name"`
	Status         string     `json:"status"`
	AdminName      *string    `json:"admin_name,omitempty"`
	AdminEmail     *string    `json:"admin_email,omitempty"`
	Plan           *string    `json:"plan,omitempty"`
	SubStatus      *string    `json:"subscription_status,omitempty"`
	SubscriptionID *uuid.UUID `json:"subscription_id,omitempty"`
	AutoPayEnabled bool       `json:"autopay_enabled"`
	LicenseStatus  *string    `json:"license_status,omitempty"`
	LicenseExpiry  *time.Time `json:"license_expires_at,omitempty"`
	Users          int        `json:"users"`
	ProvisionedAt  *time.Time `json:"provisioned_at,omitempty"`
}

func (s *Service) ListTenantsEnriched(ctx context.Context) ([]TenantRowDTO, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT t.id, t.slug, t.name, t.status, reg.admin_name, reg.admin_email,
		       p.name, sub.status, sub.id, COALESCE(sub.autopay_enabled, false), lic.status, lic.expires_at,
		       COALESCE(mc.cnt, 0)
		  FROM control_plane.tenant t
		  LEFT JOIN LATERAL (
		      SELECT admin_name, admin_email FROM control_plane.school_registration r
		       WHERE r.tenant_id = t.id ORDER BY r.created_at DESC LIMIT 1
		  ) reg ON true
		  LEFT JOIN LATERAL (
		      SELECT * FROM control_plane.subscription s
		       WHERE s.tenant_id = t.id ORDER BY s.created_at DESC LIMIT 1
		  ) sub ON true
		  LEFT JOIN control_plane.plan_catalog p ON p.id = sub.plan_id
		  LEFT JOIN LATERAL (
		      SELECT status, expires_at FROM control_plane.license l
		       WHERE l.tenant_id = t.id AND l.superseded_by IS NULL
		       ORDER BY l.issued_at DESC LIMIT 1
		  ) lic ON true
		  LEFT JOIN (
		      SELECT tenant_id, count(*) AS cnt FROM memberships
		       WHERE deleted_at IS NULL GROUP BY tenant_id
		  ) mc ON mc.tenant_id = t.id
		 ORDER BY t.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TenantRowDTO{}
	for rows.Next() {
		var t TenantRowDTO
		if err := rows.Scan(&t.ID, &t.Slug, &t.Name, &t.Status, &t.AdminName, &t.AdminEmail, &t.Plan, &t.SubStatus, &t.SubscriptionID,
			&t.AutoPayEnabled, &t.LicenseStatus, &t.LicenseExpiry, &t.Users); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// SetTenantState suspends/resumes a tenant and cascades to its subscription + license.
func (s *Service) SetTenantState(ctx context.Context, tenantID uuid.UUID, suspend bool) error {
	tenantStatus, subStatus, licStatus := "ACTIVE", "ACTIVE", "ACTIVE"
	revoked := false
	if suspend {
		tenantStatus, subStatus, licStatus, revoked = "SUSPENDED", "SUSPENDED", "SUSPENDED", true
	}
	return inTx(ctx, s.pool, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `UPDATE control_plane.tenant SET status=$2, updated_at=now() WHERE id=$1`, tenantID, tenantStatus)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		if _, err := tx.Exec(ctx,
			`UPDATE control_plane.subscription SET status=$2, updated_at=now() WHERE tenant_id=$1`, tenantID, subStatus); err != nil {
			return err
		}
		// Cascade to the live license + push it down.
		rows, err := tx.Query(ctx,
			`UPDATE control_plane.license SET status=$2, revoked=$3, updated_at=now()
			  WHERE tenant_id=$1 AND superseded_by IS NULL
			RETURNING id, signed_token, signature, expires_at`, tenantID, licStatus, revoked)
		if err != nil {
			return err
		}
		type lic struct {
			id         uuid.UUID
			token, sig string
			expires    time.Time
		}
		var lics []lic
		for rows.Next() {
			var l lic
			if err := rows.Scan(&l.id, &l.token, &l.sig, &l.expires); err != nil {
				rows.Close()
				return err
			}
			lics = append(lics, l)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, l := range lics {
			if err := s.emitLicenseConfig(ctx, tx, tenantID, l.id, "UPDATE", map[string]any{
				"id": l.id, "status": licStatus, "revoked": revoked,
				"signed_token": l.token, "signature": l.sig, "expires_at": l.expires,
			}); err != nil {
				return err
			}
		}
		return nil
	})
}

type BillingHistory struct {
	Invoices []InvoiceDTO `json:"invoices"`
	Proofs   []ProofDTO   `json:"proofs"`
}

type InvoiceDTO struct {
	ID       uuid.UUID `json:"id"`
	Number   string    `json:"number"`
	Period   *string   `json:"period,omitempty"`
	Total    float64   `json:"total"`
	Status   string    `json:"status"`
	IssuedAt time.Time `json:"issued_at"`
}

func (s *Service) TenantBillingHistory(ctx context.Context, tenantID uuid.UUID) (BillingHistory, error) {
	var out BillingHistory
	out.Invoices = []InvoiceDTO{}
	out.Proofs = []ProofDTO{}

	invRows, err := s.pool.Query(ctx,
		`SELECT id, number, period, total, status, issued_at
		   FROM control_plane.subscription_invoice WHERE tenant_id=$1 ORDER BY issued_at DESC`, tenantID)
	if err != nil {
		return out, err
	}
	defer invRows.Close()
	for invRows.Next() {
		var i InvoiceDTO
		if err := invRows.Scan(&i.ID, &i.Number, &i.Period, &i.Total, &i.Status, &i.IssuedAt); err != nil {
			return out, err
		}
		out.Invoices = append(out.Invoices, i)
	}
	if err := invRows.Err(); err != nil {
		return out, err
	}

	pfRows, err := s.pool.Query(ctx,
		`SELECT id, COALESCE(registration_id, '00000000-0000-0000-0000-000000000000'::uuid),
		        amount, currency, method, txn_id, payer_name, paid_at, storage_key, status, reject_reason, created_at
		   FROM control_plane.payment_proof WHERE tenant_id=$1 ORDER BY created_at DESC`, tenantID)
	if err != nil {
		return out, err
	}
	defer pfRows.Close()
	for pfRows.Next() {
		var p ProofDTO
		if err := pfRows.Scan(&p.ID, &p.RegistrationID, &p.Amount, &p.Currency, &p.Method, &p.TxnID,
			&p.PayerName, &p.PaidAt, &p.StorageKey, &p.Status, &p.RejectReason, &p.CreatedAt); err != nil {
			return out, err
		}
		out.Proofs = append(out.Proofs, p)
	}
	return out, pfRows.Err()
}

// ───────────────────────────── dashboard ───────────────────────────────────

type DashboardDTO struct {
	TotalTenants        int               `json:"total_tenants"`
	ActiveSubscriptions int               `json:"active_subscriptions"`
	MonthlyRevenue      float64           `json:"monthly_revenue"`
	PendingRequests     int               `json:"pending_requests"`
	ExpiringLicenses    int               `json:"expiring_licenses"`
	OpenSupportTickets  int               `json:"open_support_tickets"`
	RegistrationTrend   []series          `json:"registration_trend"`
	RevenueTrend        []series          `json:"revenue_trend"`
	LicenseDistribution []series          `json:"license_distribution"`
	RecentRegistrations []RegistrationDTO `json:"recent_registrations"`
	RecentProofs        []ProofDTO        `json:"recent_proofs"`
}

func (s *Service) Dashboard(ctx context.Context) (DashboardDTO, error) {
	var d DashboardDTO
	subA, err := s.SubscriptionAnalytics(ctx)
	if err != nil {
		return d, err
	}
	regA, err := s.RegistrationAnalytics(ctx)
	if err != nil {
		return d, err
	}
	licA, err := s.LicenseAnalytics(ctx)
	if err != nil {
		return d, err
	}

	d.ActiveSubscriptions = subA.ActiveTenants
	d.MonthlyRevenue = subA.MRR
	d.RevenueTrend = subA.RevenueTrend
	d.PendingRequests = regA.Pending
	d.RegistrationTrend = regA.VolumePerDay
	d.ExpiringLicenses = licA.ExpiringThisMonth
	d.LicenseDistribution = licA.Distribution
	d.OpenSupportTickets = 0 // Support system is a later milestone.

	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM control_plane.tenant`).Scan(&d.TotalTenants); err != nil {
		return d, err
	}

	// Recent registrations (5) + recent proofs (5).
	all, err := s.List(ctx)
	if err != nil {
		return d, err
	}
	d.RecentRegistrations = firstN(all, 5)

	proofs, err := s.recentProofs(ctx, 5)
	if err != nil {
		return d, err
	}
	d.RecentProofs = proofs
	return d, nil
}

func (s *Service) recentProofs(ctx context.Context, n int) ([]ProofDTO, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT pp.id, COALESCE(pp.registration_id,'00000000-0000-0000-0000-000000000000'::uuid),
		        COALESCE(r.school_name,''), COALESCE(r.slug,''), pp.amount, pp.currency, pp.method,
		        pp.txn_id, pp.payer_name, pp.paid_at, pp.storage_key, pp.status, pp.reject_reason, pp.created_at
		   FROM control_plane.payment_proof pp
		   LEFT JOIN control_plane.school_registration r ON r.id = pp.registration_id
		  ORDER BY pp.created_at DESC LIMIT $1`, n)
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

// ───────────────────────────── small helpers ───────────────────────────────

func (s *Service) dateSeries(ctx context.Context, sql string, args ...any) ([]series, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []series{}
	for rows.Next() {
		var p series
		if err := rows.Scan(&p.Label, &p.Value); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func round1(f float64) float64 { return float64(int64(f*10+0.5)) / 10 }

func firstN[T any](s []T, n int) []T {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// ───────────────────────────── HTTP wiring ─────────────────────────────────

// RegisterPlatformV2 mounts the M9 super-admin endpoints (platform-gated).
func RegisterPlatformV2(r chi.Router, svc *Service) {
	get := func(path, perm string, fn func(context.Context) (any, error)) {
		r.With(platform.RequirePermission(perm)).Get(path, func(w http.ResponseWriter, req *http.Request) {
			out, err := fn(req.Context())
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, out)
		})
	}

	// Analytics (read-only).
	get("/api/v1/platform/registrations/analytics", platform.PermRegistrationReview,
		func(ctx context.Context) (any, error) { return svc.RegistrationAnalytics(ctx) })
	get("/api/v1/platform/payment-proofs/analytics", platform.PermPaymentReview,
		func(ctx context.Context) (any, error) { return svc.PaymentAnalytics(ctx) })
	get("/api/v1/platform/licenses/analytics", platform.PermLicenseManage,
		func(ctx context.Context) (any, error) { return svc.LicenseAnalytics(ctx) })
	get("/api/v1/platform/subscriptions/analytics", platform.PermSubscriptionManage,
		func(ctx context.Context) (any, error) { return svc.SubscriptionAnalytics(ctx) })
	get("/api/v1/platform/dashboard", platform.PermAnalyticsView,
		func(ctx context.Context) (any, error) { return svc.Dashboard(ctx) })

	// Enriched licenses list (supersedes the legacy /licenses for the v2 page).
	get("/api/v1/platform/licenses/list", platform.PermLicenseManage,
		func(ctx context.Context) (any, error) {
			l, err := svc.ListLicenses(ctx)
			return map[string]any{"licenses": l}, err
		})

	// Enriched tenants list.
	get("/api/v1/platform/tenants/list", platform.PermTenantManage,
		func(ctx context.Context) (any, error) {
			t, err := svc.ListTenantsEnriched(ctx)
			return map[string]any{"tenants": t}, err
		})

	// Plans list.
	get("/api/v1/platform/plans", platform.PermSubscriptionManage,
		func(ctx context.Context) (any, error) {
			p, err := svc.ListPlans(ctx)
			return map[string]any{"plans": p}, err
		})

	idAction := func(path, perm string, fn func(context.Context, uuid.UUID, *http.Request) (any, int, error)) {
		r.With(platform.RequirePermission(perm)).Post(path, func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			out, code, err := fn(req.Context(), id, req)
			if err != nil {
				writeErr(w, err)
				return
			}
			if out == nil {
				w.WriteHeader(code)
				return
			}
			httpx.JSON(w, code, out)
		})
	}

	// Registration reminder.
	idAction("/api/v1/platform/registrations/{id}/remind", platform.PermRegistrationReview,
		func(ctx context.Context, id uuid.UUID, _ *http.Request) (any, int, error) {
			return nil, http.StatusAccepted, svc.Remind(ctx, id)
		})

	// Payment-proof clarification.
	idAction("/api/v1/platform/payment-proofs/{id}/request-info", platform.PermPaymentReview,
		func(ctx context.Context, id uuid.UUID, req *http.Request) (any, int, error) {
			var in struct {
				Note string `json:"note"`
			}
			_ = json.NewDecoder(req.Body).Decode(&in)
			ident, _ := platform.IdentityFrom(ctx)
			return nil, http.StatusNoContent, svc.RequestClarification(ctx, ident.AdminID, id, in.Note)
		})

	// License lifecycle.
	idAction("/api/v1/platform/licenses/{id}/suspend", platform.PermLicenseManage,
		func(ctx context.Context, id uuid.UUID, _ *http.Request) (any, int, error) {
			return nil, http.StatusNoContent, svc.SetLicenseState(ctx, id, "SUSPENDED", true)
		})
	idAction("/api/v1/platform/licenses/{id}/resume", platform.PermLicenseManage,
		func(ctx context.Context, id uuid.UUID, _ *http.Request) (any, int, error) {
			return nil, http.StatusNoContent, svc.SetLicenseState(ctx, id, "ACTIVE", false)
		})
	idAction("/api/v1/platform/licenses/{id}/cancel", platform.PermLicenseManage,
		func(ctx context.Context, id uuid.UUID, req *http.Request) (any, int, error) {
			var in struct {
				Immediate bool `json:"immediate"`
			}
			_ = json.NewDecoder(req.Body).Decode(&in)
			return nil, http.StatusNoContent, svc.CancelLicense(ctx, id, in.Immediate)
		})
	idAction("/api/v1/platform/licenses/{id}/extend", platform.PermLicenseManage,
		func(ctx context.Context, id uuid.UUID, req *http.Request) (any, int, error) {
			var in struct {
				Days int `json:"days"`
			}
			_ = json.NewDecoder(req.Body).Decode(&in)
			newID, err := svc.ExtendLicense(ctx, id, in.Days)
			if err != nil {
				return nil, 0, err
			}
			return map[string]any{"license_id": newID}, http.StatusOK, nil
		})
	idAction("/api/v1/platform/licenses/{id}/change-plan", platform.PermLicenseManage,
		func(ctx context.Context, id uuid.UUID, req *http.Request) (any, int, error) {
			var in struct {
				PlanID string `json:"plan_id"`
			}
			_ = json.NewDecoder(req.Body).Decode(&in)
			planID, err := uuid.Parse(in.PlanID)
			if err != nil {
				return nil, 0, fmt.Errorf("%w: valid plan_id required", ErrInvalidInput)
			}
			newID, err := svc.ChangeLicensePlan(ctx, id, planID)
			if err != nil {
				return nil, 0, err
			}
			return map[string]any{"license_id": newID}, http.StatusOK, nil
		})

	// Tenant operations.
	idAction("/api/v1/platform/tenants/{id}/suspend", platform.PermTenantManage,
		func(ctx context.Context, id uuid.UUID, _ *http.Request) (any, int, error) {
			return nil, http.StatusNoContent, svc.SetTenantState(ctx, id, true)
		})
	idAction("/api/v1/platform/tenants/{id}/resume", platform.PermTenantManage,
		func(ctx context.Context, id uuid.UUID, _ *http.Request) (any, int, error) {
			return nil, http.StatusNoContent, svc.SetTenantState(ctx, id, false)
		})
	r.With(platform.RequirePermission(platform.PermTenantManage)).
		Get("/api/v1/platform/tenants/{id}/billing-history", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			out, err := svc.TenantBillingHistory(req.Context(), id)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, out)
		})

	// Plan management (create / update / duplicate / archive).
	r.With(platform.RequirePermission(platform.PermSubscriptionManage)).
		Post("/api/v1/platform/plans", func(w http.ResponseWriter, req *http.Request) {
			var in PlanInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON")
				return
			}
			id, err := svc.CreatePlan(req.Context(), in)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, map[string]any{"id": id})
		})
	r.With(platform.RequirePermission(platform.PermSubscriptionManage)).
		Patch("/api/v1/platform/plans/{id}", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			var in PlanInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON")
				return
			}
			if err := svc.UpdatePlan(req.Context(), id, in); err != nil {
				writeErr(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	idAction("/api/v1/platform/plans/{id}/duplicate", platform.PermSubscriptionManage,
		func(ctx context.Context, id uuid.UUID, _ *http.Request) (any, int, error) {
			newID, err := svc.DuplicatePlan(ctx, id)
			if err != nil {
				return nil, 0, err
			}
			return map[string]any{"id": newID}, http.StatusCreated, nil
		})
	idAction("/api/v1/platform/plans/{id}/archive", platform.PermSubscriptionManage,
		func(ctx context.Context, id uuid.UUID, _ *http.Request) (any, int, error) {
			return nil, http.StatusNoContent, svc.ArchivePlan(ctx, id)
		})
}
