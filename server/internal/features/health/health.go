// Package health exposes readiness — a /readyz that verifies the Postgres
// dependency. Liveness (/healthz) lives in the httpx kernel.
package health

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/httpx"
)

// Register mounts /readyz on the router.
func Register(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/readyz", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 3*time.Second)
		defer cancel()
		if err := pool.Ping(ctx); err != nil {
			httpx.JSON(w, http.StatusServiceUnavailable, map[string]any{
				"status": "not ready", "db": err.Error(),
			})
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ready", "db": "ok"})
	})
}
