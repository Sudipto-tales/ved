// Command node is the per-school binary (tenant plane): it runs migrations on
// startup, then serves the tenant-plane API on the LAN. See 01-overview.md.
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/weloin/ved/internal/features/health"
	"github.com/weloin/ved/internal/features/identity"
	"github.com/weloin/ved/internal/features/notes"
	"github.com/weloin/ved/internal/platform/auth"
	"github.com/weloin/ved/internal/platform/config"
	"github.com/weloin/ved/internal/platform/db"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/migrate"
)

func main() {
	ctx := context.Background()
	cfg := config.FromEnv(":8081")

	// nodeID identifies this node for sync metadata (origin_node_id). Provisioning
	// will assign a stable one at M6; for now it's per-process.
	nodeID := uuid.Must(uuid.NewV7())

	slog.Info("running migrations")
	if err := migrate.Up(ctx, cfg.DatabaseURL); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}

	// Run the app pool as the non-superuser role so RLS enforces ([03]).
	pool, err := db.Connect(ctx, cfg.DatabaseURL, cfg.AppDBRole)
	if err != nil {
		slog.Error("db connect", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Identity (M1): JWT manager + service. The dev seed gives a working admin
	// before control-plane provisioning exists (M4).
	jwtMgr := auth.NewManager(cfg.JWTSecret)
	identRepo := identity.NewRepo(pool, nodeID)
	identSvc := identity.NewService(identRepo, jwtMgr)
	if cfg.DevSeed {
		if err := identity.SeedDevAdmin(ctx, identRepo); err != nil {
			slog.Error("dev seed", "err", err)
		}
	}

	r := httpx.NewRouter("node")
	health.Register(r, pool)

	// Public: unauthenticated auth endpoints.
	identity.RegisterPublic(r, identSvc)

	// Authenticated, identity-global (no tenant chosen yet): /me + reset-password.
	r.Group(func(g chi.Router) {
		g.Use(httpx.Authenticator(jwtMgr))
		identity.RegisterMe(g, identSvc)
	})

	// Authenticated AND tenant-scoped (RLS armed): real domain slices.
	r.Group(func(g chi.Router) {
		g.Use(httpx.Authenticator(jwtMgr))
		g.Use(httpx.TenantContext)
		notes.Register(g, pool, nodeID)
	})

	if err := httpx.Serve(cfg.HTTPAddr, r); err != nil {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
}
