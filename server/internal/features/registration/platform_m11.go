// M11 super-admin extensions to the registration/control-plane slice (docs/promts.md).
// This file owns the KYC-review surface; Login-As / magic-link / plan-versioning /
// AutoPay live in their own M11 files. Control-plane writes are plain transactional
// (no tenant_id/RLS/sync — docs/database/01).
package registration

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/httpx"
)

// SetKYC records the superadmin's KYC decision on a registration. The decision is part
// of review (gated platform.registration.review); it does NOT itself advance the
// registration state machine — Approve/Reject still do that.
func (s *Service) SetKYC(ctx context.Context, adminID, regID uuid.UUID, status, notes string) error {
	switch status {
	case "PENDING", "VERIFIED", "REJECTED":
	default:
		return fmt.Errorf("%w: kyc status must be PENDING, VERIFIED or REJECTED", ErrInvalidInput)
	}
	ct, err := s.pool.Exec(ctx,
		`UPDATE control_plane.school_registration
		    SET kyc_status=$2, kyc_notes=$3, kyc_reviewed_by=$4, kyc_reviewed_at=now(), updated_at=now()
		  WHERE id=$1`,
		regID, status, nullStr(notes), adminID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// KYCSummary aggregates the registration risk/KYC/source distributions for the
// registration-analytics cards (read-only).
type KYCSummary struct {
	KYC    map[string]int `json:"kyc"`
	Risk   map[string]int `json:"risk"`
	Source map[string]int `json:"source"`
}

// KYCAnalytics returns the count of registrations grouped by kyc_status, risk_score,
// and source — the M11 review dashboard cards.
func (s *Service) KYCAnalytics(ctx context.Context) (KYCSummary, error) {
	out := KYCSummary{KYC: map[string]int{}, Risk: map[string]int{}, Source: map[string]int{}}
	for _, q := range []struct {
		col string
		dst map[string]int
	}{
		{"kyc_status", out.KYC},
		{"risk_score", out.Risk},
		{"source", out.Source},
	} {
		rows, err := s.pool.Query(ctx,
			"SELECT "+q.col+", count(*) FROM control_plane.school_registration GROUP BY "+q.col)
		if err != nil {
			return KYCSummary{}, err
		}
		for rows.Next() {
			var k string
			var n int
			if err := rows.Scan(&k, &n); err != nil {
				rows.Close()
				return KYCSummary{}, err
			}
			q.dst[k] = n
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return KYCSummary{}, err
		}
	}
	return out, nil
}

// RegisterPlatformM11 mounts the M11 super-admin endpoints that don't belong to the
// other M11 files. Caller must already gate the group on a platform token.
func RegisterPlatformM11(r chi.Router, svc *Service) {
	// KYC analytics card data.
	r.With(platform.RequirePermission(platform.PermRegistrationReview)).
		Get("/api/v1/platform/registrations/kyc-analytics", func(w http.ResponseWriter, req *http.Request) {
			out, err := svc.KYCAnalytics(req.Context())
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, out)
		})

	// Set KYC decision on a registration.
	r.With(platform.RequirePermission(platform.PermRegistrationReview)).
		Post("/api/v1/platform/registrations/{id}/kyc", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			var in struct {
				Status string `json:"status"`
				Notes  string `json:"notes"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.Status == "" {
				httpx.Error(w, http.StatusBadRequest, "status is required")
				return
			}
			ident, _ := platform.IdentityFrom(req.Context())
			if err := svc.SetKYC(req.Context(), ident.AdminID, id, in.Status, in.Notes); err != nil {
				writeErr(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
}
