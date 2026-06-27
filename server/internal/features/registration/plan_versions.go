// M11 Slice D — plan versioning / grandfathered pricing (docs/promts.md "Plan Versioning").
// A plan_version is an immutable price point in a plan's history; a subscription pins the
// version it bought, so a later price change leaves existing subscribers grandfathered
// while new subscriptions bind to the latest version.
package registration

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/httpx"
)

// PlanVersionDTO is one price point in a plan's history, with how many active subscribers
// are pinned to it and the monthly delta from the previous version.
type PlanVersionDTO struct {
	ID                uuid.UUID `json:"id"`
	PlanID            uuid.UUID `json:"plan_id"`
	Version           int       `json:"version"`
	MonthlyPrice      float64   `json:"monthly_price"`
	AnnualPrice       float64   `json:"annual_price"`
	Currency          string    `json:"currency"`
	EffectiveDate     string    `json:"effective_date"`
	Status            string    `json:"status"`
	ActiveSubscribers int       `json:"active_subscribers"`
	PriceDiff         float64   `json:"price_diff"` // monthly delta vs the previous version
	IsLatest          bool      `json:"is_latest"`
}

// PlanVersionInput is a new price point.
type PlanVersionInput struct {
	MonthlyPrice float64 `json:"monthly_price"`
	AnnualPrice  float64 `json:"annual_price"`
	Currency     string  `json:"currency"`
}

// insertPlanVersionV1 seeds version 1 for a freshly created plan. Runs on any execer
// (pool or tx) so plan creation and its first version commit together.
func insertPlanVersionV1(ctx context.Context, tx pgx.Tx, planID uuid.UUID, monthly, annual float64, currency string) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO control_plane.plan_version (id, plan_id, version, monthly_price, annual_price, currency)
		 VALUES ($1,$2,1,$3,$4,$5)`,
		uuid.Must(uuid.NewV7()), planID, monthly, annual, coalesce(currency, "INR"))
	return err
}

// EnsurePlanVersions idempotently seeds a version-1 row for any plan that lacks one (e.g.
// plans created by the dev SeedPlans, which runs after the backfill migration). Safe to
// call on every boot. Uses gen_random_uuid for the one-shot seed (control-plane rows
// carry no sync ordering).
func EnsurePlanVersions(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx,
		`INSERT INTO control_plane.plan_version (id, plan_id, version, monthly_price, annual_price, currency, effective_date)
		 SELECT gen_random_uuid(), pc.id, 1, pc.price, pc.annual_price, pc.currency, pc.created_at
		   FROM control_plane.plan_catalog pc
		  WHERE NOT EXISTS (SELECT 1 FROM control_plane.plan_version pv WHERE pv.plan_id = pc.id)`)
	return err
}

// ListPlanVersions returns a plan's price history, newest first, with per-version active
// subscriber counts and the monthly price delta from the prior version.
func (s *Service) ListPlanVersions(ctx context.Context, planID uuid.UUID) ([]PlanVersionDTO, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT pv.id, pv.plan_id, pv.version, pv.monthly_price, pv.annual_price, pv.currency,
		        pv.effective_date, pv.status,
		        (SELECT count(*) FROM control_plane.subscription s
		          WHERE s.plan_version_id = pv.id AND s.status='ACTIVE'),
		        pv.monthly_price - COALESCE(LAG(pv.monthly_price) OVER (ORDER BY pv.version), pv.monthly_price),
		        (pv.version = MAX(pv.version) OVER ()) AS is_latest
		   FROM control_plane.plan_version pv
		  WHERE pv.plan_id = $1
		  ORDER BY pv.version DESC`, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PlanVersionDTO{}
	for rows.Next() {
		var v PlanVersionDTO
		var effTime time.Time
		if err := rows.Scan(&v.ID, &v.PlanID, &v.Version, &v.MonthlyPrice, &v.AnnualPrice, &v.Currency,
			&effTime, &v.Status, &v.ActiveSubscribers, &v.PriceDiff, &v.IsLatest); err != nil {
			return nil, err
		}
		v.EffectiveDate = effTime.Format("2006-01-02")
		out = append(out, v)
	}
	return out, rows.Err()
}

// CreatePlanVersion adds a new (latest) price point and rolls the plan_catalog's headline
// price forward — new subscribers get this version, existing ones stay grandfathered on
// the version their subscription pins.
func (s *Service) CreatePlanVersion(ctx context.Context, planID uuid.UUID, in PlanVersionInput) (PlanVersionDTO, error) {
	var out PlanVersionDTO
	err := inTx(ctx, s.pool, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM control_plane.plan_catalog WHERE id=$1)`, planID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrNotFound
		}
		var next int
		if err := tx.QueryRow(ctx,
			`SELECT COALESCE(MAX(version),0)+1 FROM control_plane.plan_version WHERE plan_id=$1`, planID).Scan(&next); err != nil {
			return err
		}
		id := uuid.Must(uuid.NewV7())
		currency := coalesce(in.Currency, "INR")
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.plan_version (id, plan_id, version, monthly_price, annual_price, currency)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			id, planID, next, in.MonthlyPrice, in.AnnualPrice, currency); err != nil {
			return err
		}
		// Roll the catalog headline price forward to the latest version.
		if _, err := tx.Exec(ctx,
			`UPDATE control_plane.plan_catalog SET price=$2, annual_price=$3, currency=$4, updated_at=now() WHERE id=$1`,
			planID, in.MonthlyPrice, in.AnnualPrice, currency); err != nil {
			return err
		}
		out = PlanVersionDTO{ID: id, PlanID: planID, Version: next, MonthlyPrice: in.MonthlyPrice,
			AnnualPrice: in.AnnualPrice, Currency: currency, Status: "ACTIVE", IsLatest: true}
		return nil
	})
	return out, err
}

// RegisterPlatformPlanVersions mounts the plan-version endpoints (gated platform token).
func RegisterPlatformPlanVersions(r chi.Router, svc *Service) {
	r.With(platform.RequirePermission(platform.PermSubscriptionManage)).
		Get("/api/v1/platform/plans/{id}/versions", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			vs, err := svc.ListPlanVersions(req.Context(), id)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"versions": vs})
		})

	r.With(platform.RequirePermission(platform.PermSubscriptionManage)).
		Post("/api/v1/platform/plans/{id}/versions", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			var in PlanVersionInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON")
				return
			}
			v, err := svc.CreatePlanVersion(req.Context(), id, in)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, v)
		})
}
