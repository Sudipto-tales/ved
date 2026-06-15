// Command controlplane is the central cloud binary (platform plane): school
// registration, payment-proof verification, tenant provisioning, and licensing. It owns
// the `control_plane` schema and a SEPARATE permission namespace from the tenant plane
// (docs/02-architecture.md, docs/database/01-control-plane.md). M4 brings it to life.
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/go-chi/chi/v5"

	"github.com/weloin/ved/internal/features/health"
	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/features/registration"
	"github.com/weloin/ved/internal/platform/config"
	"github.com/weloin/ved/internal/platform/db"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/license"
	"github.com/weloin/ved/internal/platform/migrate"

	"github.com/google/uuid"
)

func main() {
	ctx := context.Background()
	cfg := config.FromEnv(":8080")

	// nodeID stamps origin_node_id on the tenant-plane rows this binary provisions.
	nodeID := uuid.Must(uuid.NewV7())

	// Control-plane migrations: own schema + own goose version table.
	slog.Info("running control-plane migrations")
	if err := migrate.UpControlPlane(ctx, cfg.DatabaseURL); err != nil {
		slog.Error("migrate control plane", "err", err)
		os.Exit(1)
	}

	// Control plane connects as the owner. Provisioning writes tenant-plane rows under
	// FORCE row-level security with app.tenant_id set, so isolation still holds.
	pool, err := db.Connect(ctx, cfg.DatabaseURL, "")
	if err != nil {
		slog.Error("db connect", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Platform auth (separate namespace) + the registration/licensing slice.
	tokens := platform.NewTokenManager(cfg.PlatformJWTSecret)
	platRepo := platform.NewRepo(pool)
	platSvc := platform.NewService(platRepo, tokens)
	signer := license.NewSigner(cfg.LicenseSigningKey)
	regSvc := registration.NewService(pool, nodeID, signer)

	if cfg.DevSeed {
		if err := platform.SeedSuperAdmin(ctx, platRepo); err != nil {
			slog.Error("seed superadmin", "err", err)
		}
		if err := platform.SeedPlans(ctx, platRepo); err != nil {
			slog.Error("seed plans", "err", err)
		}
	}

	r := httpx.NewRouter("controlplane")
	health.Register(r, pool)

	// Public: platform login + self-service school registration / payment-proof upload.
	platform.RegisterPublic(r, platSvc)
	registration.RegisterPublic(r, regSvc)

	// Platform superadmin (authenticated + platform-permission gated).
	r.Group(func(g chi.Router) {
		g.Use(platform.Authenticator(tokens))
		registration.RegisterPlatform(g, regSvc)
	})

	if err := httpx.Serve(cfg.HTTPAddr, r); err != nil {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
}
