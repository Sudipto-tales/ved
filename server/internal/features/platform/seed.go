package platform

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/weloin/ved/internal/platform/crypto"
)

// Dev superadmin. Before a real bootstrap exists, this gives a working platform login so
// the registration → approval flow can be exercised end to end.
const (
	DevSuperAdminEmail = "super@ved.platform"
	DevSuperAdminPass  = "super1234"
	devSuperAdminName  = "Platform Superadmin"
)

// SeedSuperAdmin idempotently creates the dev platform superadmin.
func SeedSuperAdmin(ctx context.Context, repo *Repo) error {
	var existing uuid.UUID
	err := repo.pool.QueryRow(ctx,
		`SELECT id FROM control_plane.platform_admin WHERE lower(email) = lower($1)`,
		DevSuperAdminEmail).Scan(&existing)
	if err == nil {
		slog.Info("platform seed: superadmin already present", "email", DevSuperAdminEmail)
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("check superadmin: %w", err)
	}
	hash, err := crypto.HashPassword(DevSuperAdminPass)
	if err != nil {
		return err
	}
	if _, err := repo.pool.Exec(ctx,
		`INSERT INTO control_plane.platform_admin (id, email, name, password_hash, is_superadmin)
		 VALUES ($1, $2, $3, $4, true)`,
		uuid.Must(uuid.NewV7()), DevSuperAdminEmail, devSuperAdminName, hash); err != nil {
		return fmt.Errorf("insert superadmin: %w", err)
	}
	slog.Info("platform seed: created superadmin", "email", DevSuperAdminEmail, "password", DevSuperAdminPass)
	return nil
}

// SeedPlans idempotently seeds a couple of plan_catalog rows so registrations can pick one.
func SeedPlans(ctx context.Context, repo *Repo) error {
	plans := []struct {
		name, tier, cycle string
		price             float64
		seats             int
		modules           string
	}{
		{"Starter", "T1", "ANNUAL", 0, 200, `["students","academics"]`},
		{"Standard", "T2", "ANNUAL", 49999, 1000, `["students","academics","finance","communication"]`},
		{"Premium", "T3", "ANNUAL", 99999, 5000, `["students","academics","finance","communication","lms","analytics"]`},
	}
	for _, p := range plans {
		// Idempotent by name (plan_catalog has no natural unique key; id is always fresh).
		if _, err := repo.pool.Exec(ctx,
			`INSERT INTO control_plane.plan_catalog (id, name, tier, currency, price, billing_cycle, seats, enabled_modules, is_active)
			 SELECT $1, $2, $3, 'INR', $4, $5, $6, $7::jsonb, true
			  WHERE NOT EXISTS (SELECT 1 FROM control_plane.plan_catalog WHERE name = $2)`,
			uuid.Must(uuid.NewV7()), p.name, p.tier, p.price, p.cycle, p.seats, p.modules); err != nil {
			return fmt.Errorf("seed plan %s: %w", p.name, err)
		}
	}
	return nil
}
