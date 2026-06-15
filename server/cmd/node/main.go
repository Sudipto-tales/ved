// Command node is the per-school binary (tenant plane): it runs migrations on
// startup, then serves the tenant-plane API on the LAN. See 01-overview.md.
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/weloin/ved/internal/features/academics"
	"github.com/weloin/ved/internal/features/access"
	"github.com/weloin/ved/internal/features/finance"
	"github.com/weloin/ved/internal/features/guardian"
	"github.com/weloin/ved/internal/features/health"
	"github.com/weloin/ved/internal/features/identity"
	"github.com/weloin/ved/internal/features/staff"
	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/features/teachers"
	"github.com/weloin/ved/internal/platform/auth"
	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/bus"
	"github.com/weloin/ved/internal/platform/config"
	"github.com/weloin/ved/internal/platform/db"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/migrate"
	"github.com/weloin/ved/internal/platform/onboarding"
	syncrelay "github.com/weloin/ved/internal/platform/sync"
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

	// RBAC (M2): the permission resolver/gate + the access slice. The catalog is global
	// reference data seeded from code on every startup.
	resolver := authz.NewResolver(pool)
	accessRepo := access.NewRepo(pool, nodeID)
	if err := access.SeedCatalog(ctx, accessRepo); err != nil {
		slog.Error("seed permission catalog", "err", err)
	}

	// Students (M3): the first real domain slice.
	studentsRepo := students.NewRepo(pool, nodeID)

	if cfg.DevSeed {
		devTenant := uuid.MustParse(identity.DevTenantID)
		adminMembershipID, err := identity.SeedDevAdmin(ctx, identRepo)
		if err != nil {
			slog.Error("dev seed", "err", err)
		} else if err := access.BootstrapTenant(ctx, accessRepo, devTenant, adminMembershipID); err != nil {
			slog.Error("rbac bootstrap", "err", err)
		}
		// Minimal tenant profile so the login-handle generator has a slug (M4 control
		// plane provisions this for real tenants).
		if err := students.SeedTenantProfile(ctx, studentsRepo, devTenant, "ved", "VED Demo School"); err != nil {
			slog.Error("seed tenant profile", "err", err)
		}
		// Minimal current academic year so sections/exams work out of the box (M5).
		if err := academics.SeedDevAcademicYear(ctx, onboarding.NewEngine(pool, nodeID), devTenant); err != nil {
			slog.Error("seed academic year", "err", err)
		}
	}

	// Sync (M6): relay the transactional outbox to JetStream. Tolerant of NATS being
	// down — the node keeps serving its LAN offline and the relay catches up on reconnect.
	if b, err := bus.Connect(cfg.NATSURL); err != nil {
		slog.Warn("sync disabled: nats connect failed", "err", err)
	} else {
		defer b.Close()
		if err := b.EnsureStream(); err != nil {
			slog.Warn("sync: ensure stream", "err", err)
		}
		// The relay spans every tenant the node hosts, so it uses an owner connection
		// (bypasses RLS) — the same posture as migrations.
		if relayPool, err := db.Connect(ctx, cfg.DatabaseURL, ""); err != nil {
			slog.Error("sync relay pool", "err", err)
		} else {
			defer relayPool.Close()
			go syncrelay.NewRelay(relayPool, b).Run(ctx)
			slog.Info("sync relay started", "nats", cfg.NATSURL)
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

	// Authenticated AND tenant-scoped (RLS armed): real domain slices. Each slice route
	// adds its own authz.Require(...) gate (M2 RBAC).
	r.Group(func(g chi.Router) {
		g.Use(httpx.Authenticator(jwtMgr))
		g.Use(httpx.TenantContext)
		access.Register(g, pool, nodeID, resolver)
		students.Register(g, pool, nodeID, resolver)
		teachers.Register(g, pool, nodeID, resolver)
		staff.Register(g, pool, nodeID, resolver)
		academics.Register(g, pool, nodeID, resolver)
		finance.Register(g, pool, nodeID, resolver)
		guardian.Register(g, pool, nodeID, resolver)
	})

	if err := httpx.Serve(cfg.HTTPAddr, r); err != nil {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
}
