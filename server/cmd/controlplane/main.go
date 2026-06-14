// Command controlplane is the central cloud binary: school registration, payment
// verification, licensing, sync hub. In M0 it only proves it builds, connects, and
// serves health on its own port/namespace (separate from the tenant plane, [02]).
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/weloin/ved/internal/features/health"
	"github.com/weloin/ved/internal/platform/config"
	"github.com/weloin/ved/internal/platform/db"
	"github.com/weloin/ved/internal/platform/httpx"
)

func main() {
	ctx := context.Background()
	cfg := config.FromEnv(":8080")

	// Control plane connects as the owner (no tenant tables here, and it must not
	// race the node's migration that creates the app role).
	pool, err := db.Connect(ctx, cfg.DatabaseURL, "")
	if err != nil {
		slog.Error("db connect", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	r := httpx.NewRouter("controlplane")
	health.Register(r, pool)
	// Control-plane slices (registration, billing, licensing) arrive at M4.

	if err := httpx.Serve(cfg.HTTPAddr, r); err != nil {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
}
