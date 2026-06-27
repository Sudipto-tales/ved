// Platform Settings store + App Releases registry (super-admin console). Plain
// control-plane transactional writes (no tenant_id/RLS/sync). Mounted by RegisterPlatformV2.
package registration

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/httpx"
)

// ───────────────────────────── settings (key → jsonb) ──────────────────────

// GetSettings returns every stored setting as a key→value map.
func (s *Service) GetSettings(ctx context.Context) (map[string]json.RawMessage, error) {
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM control_plane.platform_setting ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]json.RawMessage{}
	for rows.Next() {
		var k string
		var v json.RawMessage
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

// SaveSettings upserts a batch of key→value settings in one tx.
func (s *Service) SaveSettings(ctx context.Context, settings map[string]json.RawMessage) error {
	return inTx(ctx, s.pool, func(tx pgx.Tx) error {
		for k, v := range settings {
			if len(v) == 0 {
				v = json.RawMessage("null")
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO control_plane.platform_setting (key, value, updated_at)
				 VALUES ($1,$2,now())
				 ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, k, v); err != nil {
				return err
			}
		}
		return nil
	})
}

// ───────────────────────────── app releases ────────────────────────────────

type ReleaseDTO struct {
	ID          uuid.UUID `json:"id"`
	Platform    string    `json:"platform"`
	Channel     string    `json:"channel"`
	Version     string    `json:"version"`
	FileName    *string   `json:"file_name,omitempty"`
	DownloadURL *string   `json:"download_url,omitempty"`
	StorageKey  *string   `json:"storage_key,omitempty"`
	SizeBytes   int64     `json:"size_bytes"`
	Notes       *string   `json:"notes,omitempty"`
	Published   bool      `json:"published"`
	CreatedAt   time.Time `json:"created_at"`
}

type ReleaseInput struct {
	Platform    string `json:"platform"`
	Channel     string `json:"channel"`
	Version     string `json:"version"`
	FileName    string `json:"file_name"`
	DownloadURL string `json:"download_url"`
	SizeBytes   int64  `json:"size_bytes"`
	Notes       string `json:"notes"`
	Published   bool   `json:"published"`
}

func (s *Service) ListReleases(ctx context.Context, publishedOnly bool) ([]ReleaseDTO, error) {
	q := `SELECT id, platform, channel, version, file_name, download_url, storage_key, size_bytes, notes, published, created_at
	        FROM control_plane.app_release`
	if publishedOnly {
		q += ` WHERE published`
	}
	q += ` ORDER BY created_at DESC`
	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReleaseDTO{}
	for rows.Next() {
		var r ReleaseDTO
		if err := rows.Scan(&r.ID, &r.Platform, &r.Channel, &r.Version, &r.FileName, &r.DownloadURL,
			&r.StorageKey, &r.SizeBytes, &r.Notes, &r.Published, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Service) CreateRelease(ctx context.Context, in ReleaseInput) (uuid.UUID, error) {
	if in.Platform == "" || in.Version == "" {
		return uuid.Nil, ErrInvalidInput
	}
	id := uuid.Must(uuid.NewV7())
	_, err := s.pool.Exec(ctx,
		`INSERT INTO control_plane.app_release
		   (id, platform, channel, version, file_name, download_url, size_bytes, notes, published)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		id, in.Platform, coalesce(in.Channel, "stable"), in.Version, nullStr(in.FileName),
		nullStr(in.DownloadURL), in.SizeBytes, nullStr(in.Notes), in.Published)
	return id, err
}

func (s *Service) SetReleasePublished(ctx context.Context, id uuid.UUID, published bool) error {
	ct, err := s.pool.Exec(ctx,
		`UPDATE control_plane.app_release SET published=$2, updated_at=now() WHERE id=$1`, id, published)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) DeleteRelease(ctx context.Context, id uuid.UUID) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM control_plane.app_release WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ───────────────────────────── HTTP wiring ─────────────────────────────────

// RegisterSettingsReleases mounts the settings + releases endpoints (platform-gated) and
// the public published-releases list. Call inside the authed platform group + public group.
func RegisterSettingsReleases(g chi.Router, pub chi.Router, svc *Service) {
	g.With(platform.RequirePermission(platform.PermTenantManage)).
		Get("/api/v1/platform/settings", func(w http.ResponseWriter, req *http.Request) {
			out, err := svc.GetSettings(req.Context())
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"settings": out})
		})

	g.With(platform.RequirePermission(platform.PermTenantManage)).
		Put("/api/v1/platform/settings", func(w http.ResponseWriter, req *http.Request) {
			var in struct {
				Settings map[string]json.RawMessage `json:"settings"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON")
				return
			}
			if err := svc.SaveSettings(req.Context(), in.Settings); err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

	g.With(platform.RequirePermission(platform.PermTenantManage)).
		Get("/api/v1/platform/releases", func(w http.ResponseWriter, req *http.Request) {
			rels, err := svc.ListReleases(req.Context(), false)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"releases": rels})
		})

	g.With(platform.RequirePermission(platform.PermTenantManage)).
		Post("/api/v1/platform/releases", func(w http.ResponseWriter, req *http.Request) {
			var in ReleaseInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON")
				return
			}
			id, err := svc.CreateRelease(req.Context(), in)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, map[string]any{"id": id})
		})

	g.With(platform.RequirePermission(platform.PermTenantManage)).
		Post("/api/v1/platform/releases/{id}/publish", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			var in struct {
				Published bool `json:"published"`
			}
			_ = json.NewDecoder(req.Body).Decode(&in)
			if err := svc.SetReleasePublished(req.Context(), id, in.Published); err != nil {
				writeErr(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

	g.With(platform.RequirePermission(platform.PermTenantManage)).
		Delete("/api/v1/platform/releases/{id}", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			if err := svc.DeleteRelease(req.Context(), id); err != nil {
				writeErr(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

	// Public: the published downloads list (signup site / download page can consume it).
	pub.Get("/api/v1/releases", func(w http.ResponseWriter, req *http.Request) {
		rels, err := svc.ListReleases(req.Context(), true)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"releases": rels})
	})
}
