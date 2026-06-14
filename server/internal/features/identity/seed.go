package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/weloin/ved/internal/platform/crypto"
)

// Dev seed constants. Before control-plane provisioning exists (M4), this gives a
// working admin so login + the tenant picker can be exercised end to end. The same
// values are the frontend's dev defaults.
const (
	DevTenantID   = "01890000-0000-7000-8000-000000000001"
	DevAdminLogin = "admin@ved.local"
	DevAdminPass  = "admin1234"
	devAdminName  = "Demo Admin"
)

// withTenant runs fn in a transaction with app.tenant_id set locally so RLS filters
// every statement (mirrors notes.Repo.withTenant — the proven pattern).
func (r *Repo) withTenant(ctx context.Context, tenantID uuid.UUID, fn func(pgx.Tx) error) error {
	tx, err := r.pool.Begin(ctx)
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

// SeedDevAdmin idempotently creates the demo tenant's admin user + membership. The
// tenant-scoped membership write follows the GOLDEN RULE: row + outbox + audit in one
// transaction. Safe to call on every startup.
func SeedDevAdmin(ctx context.Context, repo *Repo) error {
	if _, err := repo.userByLogin(ctx, DevAdminLogin); err == nil {
		slog.Info("dev seed: admin already present", "login", DevAdminLogin, "tenant", DevTenantID)
		return nil
	} else if !errors.Is(err, ErrInvalidCredentials) {
		return fmt.Errorf("check existing admin: %w", err)
	}

	tenantID := uuid.MustParse(DevTenantID)
	hash, err := crypto.HashPassword(DevAdminPass)
	if err != nil {
		return err
	}
	userID := uuid.Must(uuid.NewV7())
	membershipID := uuid.Must(uuid.NewV7())
	hlc := nowHLC()

	err = repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		// Global identity row (no tenant_id; RLS does not apply to users).
		if _, err := tx.Exec(ctx,
			`INSERT INTO users (id, login_identifier, password_hash, must_reset_password,
			                    real_contact_email, status, hlc, version, origin_node_id)
			 VALUES ($1, $2, $3, false, $4, 'ACTIVE', $5, 1, $6)`,
			userID, DevAdminLogin, hash, DevAdminLogin, hlc, repo.nodeID); err != nil {
			return fmt.Errorf("insert user: %w", err)
		}

		// Tenant-scoped membership row (RLS armed) — EMPLOYEE acting as admin.
		if _, err := tx.Exec(ctx,
			`INSERT INTO memberships (id, tenant_id, user_id, user_type, status, hlc, version, origin_node_id)
			 VALUES ($1, $2, $3, 'EMPLOYEE', 'ACTIVE', $4, 1, $5)`,
			membershipID, tenantID, userID, hlc, repo.nodeID); err != nil {
			return fmt.Errorf("insert membership: %w", err)
		}

		payload, _ := json.Marshal(map[string]any{
			"membership_id": membershipID, "user_id": userID, "user_type": "EMPLOYEE", "name": devAdminName,
		})
		if _, err := tx.Exec(ctx,
			`INSERT INTO outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
			 VALUES ($1, $2, 'membership', $3, 'CREATE', $4, $5, $6)`,
			uuid.Must(uuid.NewV7()), tenantID, membershipID, payload, hlc, repo.nodeID); err != nil {
			return fmt.Errorf("insert outbox: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO audit_log (id, tenant_id, action, resource_type, resource_id, after, origin_node_id)
			 VALUES ($1, $2, 'membership.create', 'membership', $3, $4, $5)`,
			uuid.Must(uuid.NewV7()), tenantID, membershipID, payload, repo.nodeID); err != nil {
			return fmt.Errorf("insert audit: %w", err)
		}
		return nil
	})
	if err != nil {
		return err
	}
	slog.Info("dev seed: created admin", "login", DevAdminLogin, "password", DevAdminPass, "tenant", DevTenantID)
	return nil
}
