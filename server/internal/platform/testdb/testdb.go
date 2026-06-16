//go:build integration

// Package testdb is the DB-integration test harness (DoD: automated RLS-isolation +
// golden-rule tests). It is compiled ONLY under `-tags=integration`, so the default
// `go test ./...` and `go build ./...` stay fast and DB-free.
//
// It brings a real Postgres up to schema (the embedded goose migrations), hands back a
// pool connected as the NON-superuser `ved_app` role (so RLS actually enforces, exactly
// like production), and provisions throwaway tenants. Run it via `./ved.sh test`, which
// ensures infra is up first.
package testdb

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/db"
	"github.com/weloin/ved/internal/platform/migrate"
)

const defaultURL = "postgres://ved:ved@localhost:5432/ved?sslmode=disable"

// appRole is the non-superuser role the test pool runs as — RLS enforces against it.
const appRole = "ved_app"

var (
	migrateOnce sync.Once
	migrateErr  error
	cpOnce      sync.Once
	cpErr       error
)

// URL is the test database DSN (DATABASE_URL or the dev default).
func URL() string {
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	return defaultURL
}

// Pool brings the schema up (once per test binary) and returns a pool connected as
// ved_app. If Postgres is unreachable the test is SKIPPED with guidance rather than
// failed — so `go test -tags=integration ./...` is a no-op without infra.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := URL()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	migrateOnce.Do(func() { migrateErr = migrate.Up(ctx, url) })
	if migrateErr != nil {
		t.Skipf("testdb: cannot reach/migrate Postgres at %s (%v) — run `./ved.sh up infra` first", redact(url), migrateErr)
	}

	pool, err := db.Connect(ctx, url, appRole)
	if err != nil {
		t.Skipf("testdb: cannot connect as %s (%v) — run `./ved.sh up infra` first", appRole, err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// ControlPlanePool brings up BOTH the tenant-plane and control-plane schemas and returns
// a pool connected as the OWNER (no SET ROLE) — the control plane is a superuser with no
// RLS (control_plane schema), and approval provisions tenant-plane rows in `public`.
func ControlPlanePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := URL()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	migrateOnce.Do(func() { migrateErr = migrate.Up(ctx, url) })
	if migrateErr != nil {
		t.Skipf("testdb: cannot migrate tenant plane (%v) — run `./ved.sh up infra` first", migrateErr)
	}
	cpOnce.Do(func() { cpErr = migrate.UpControlPlane(ctx, url) })
	if cpErr != nil {
		t.Skipf("testdb: cannot migrate control plane (%v) — run `./ved.sh up infra` first", cpErr)
	}

	pool, err := db.Connect(ctx, url, "") // owner, no SET ROLE
	if err != nil {
		t.Skipf("testdb: cannot connect (%v) — run `./ved.sh up infra` first", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// Tenant is a throwaway tenant provisioned for one test: a fresh UUIDv7, a unique slug
// (so generated login handles never collide across tenants), and an actor membership id
// to attribute audit rows to.
type Tenant struct {
	ID    uuid.UUID
	Slug  string
	Actor uuid.UUID
}

// NewTenant mints a fresh tenant id and seeds the minimal tenant_profile (slug) the
// onboarding credential generator needs. It does NOT seed RBAC — onboard flow A does not
// require roles unless role_ids are passed.
func NewTenant(t *testing.T, pool *pgxpool.Pool, nodeID uuid.UUID) Tenant {
	t.Helper()
	id := uuid.Must(uuid.NewV7())
	slug := "test-" + strings.ReplaceAll(id.String(), "-", "")[:12]

	ctx := context.Background()
	err := InTenant(ctx, pool, id, func(tx pgx.Tx) error {
		profileID := uuid.Must(uuid.NewV7())
		hlc := nowHLC()
		_, err := tx.Exec(ctx,
			`INSERT INTO tenant_profile (id, tenant_id, display_name, slug, hlc, version, origin_node_id)
			 VALUES ($1, $2, $3, $4, $5, 1, $6)`,
			profileID, id, "Test School", slug, hlc, nodeID)
		return err
	})
	if err != nil {
		t.Fatalf("testdb: seed tenant_profile: %v", err)
	}
	return Tenant{ID: id, Slug: slug, Actor: uuid.Must(uuid.NewV7())}
}

// InTenant runs fn inside a transaction with app.tenant_id set, so RLS scopes every
// statement to the given tenant — the same seam slice repositories use.
func InTenant(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return fmt.Errorf("set tenant: %w", err)
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// CountInTenant runs `SELECT count(*)` for the given table/where, scoped to tenantID via
// RLS. Used to assert isolation (foreign tenant sees 0) and golden-rule row counts.
func CountInTenant(t *testing.T, pool *pgxpool.Pool, tenantID uuid.UUID, query string, args ...any) int {
	t.Helper()
	var n int
	err := InTenant(context.Background(), pool, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(context.Background(), query, args...).Scan(&n)
	})
	if err != nil {
		t.Fatalf("testdb: count query failed: %v", err)
	}
	return n
}

func nowHLC() string { return fmt.Sprintf("%d", time.Now().UnixNano()) }

func redact(url string) string {
	if at := strings.LastIndex(url, "@"); at >= 0 {
		if scheme := strings.Index(url, "://"); scheme >= 0 {
			return url[:scheme+3] + "***" + url[at:]
		}
	}
	return url
}
