// M11 Slice E — AutoPay (docs/promts.md "AutoPay"). Per-subscription recurring-payment
// opt-in plus the adoption / failure / renewal analytics the Subscriptions console shows.
package registration

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/httpx"
)

// AutoPaySummary is the AutoPay analytics card data.
type AutoPaySummary struct {
	ActiveSubscriptions int     `json:"active_subscriptions"`
	Enabled             int     `json:"enabled"`
	AdoptionPct         float64 `json:"adoption_pct"`
	FailedPct           float64 `json:"failed_pct"`          // share of enabled with a failed attempt
	RenewalSuccessPct   float64 `json:"renewal_success_pct"` // share of last-attempts that succeeded
}

// SetAutoPay toggles AutoPay for a subscription.
func (s *Service) SetAutoPay(ctx context.Context, subID uuid.UUID, enabled bool) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE control_plane.subscription SET autopay_enabled=$2, updated_at=now() WHERE id=$1`, subID, enabled)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AutoPayAnalytics computes the AutoPay adoption/failure/renewal metrics over ACTIVE
// subscriptions.
func (s *Service) AutoPayAnalytics(ctx context.Context) (AutoPaySummary, error) {
	var out AutoPaySummary
	var failedCount, withStatus, succeeded int
	err := s.pool.QueryRow(ctx,
		`SELECT
		   count(*) FILTER (WHERE status='ACTIVE'),
		   count(*) FILTER (WHERE status='ACTIVE' AND autopay_enabled),
		   count(*) FILTER (WHERE status='ACTIVE' AND autopay_enabled AND autopay_failed_count > 0),
		   count(*) FILTER (WHERE status='ACTIVE' AND autopay_enabled AND autopay_last_status IS NOT NULL),
		   count(*) FILTER (WHERE status='ACTIVE' AND autopay_enabled AND autopay_last_status='SUCCESS')
		 FROM control_plane.subscription`).
		Scan(&out.ActiveSubscriptions, &out.Enabled, &failedCount, &withStatus, &succeeded)
	if err != nil {
		return AutoPaySummary{}, err
	}
	if out.ActiveSubscriptions > 0 {
		out.AdoptionPct = round1(float64(out.Enabled) * 100 / float64(out.ActiveSubscriptions))
	}
	if out.Enabled > 0 {
		out.FailedPct = round1(float64(failedCount) * 100 / float64(out.Enabled))
	}
	if withStatus > 0 {
		out.RenewalSuccessPct = round1(float64(succeeded) * 100 / float64(withStatus))
	}
	return out, nil
}

// RegisterPlatformAutoPay mounts the AutoPay endpoints (gated platform token).
func RegisterPlatformAutoPay(r chi.Router, svc *Service) {
	r.With(platform.RequirePermission(platform.PermSubscriptionManage)).
		Get("/api/v1/platform/subscriptions/autopay-analytics", func(w http.ResponseWriter, req *http.Request) {
			out, err := svc.AutoPayAnalytics(req.Context())
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, out)
		})

	r.With(platform.RequirePermission(platform.PermSubscriptionManage)).
		Post("/api/v1/platform/subscriptions/{id}/autopay", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			var in struct {
				Enabled bool `json:"enabled"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON")
				return
			}
			if err := svc.SetAutoPay(req.Context(), id, in.Enabled); err != nil {
				writeErr(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
}
