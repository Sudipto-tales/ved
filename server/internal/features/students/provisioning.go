package students

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// SeedTenantProfile idempotently ensures a tenant has the minimal profile the login-handle
// generator needs (a `slug`). At M4 the control plane provisions this; for the dev tenant
// the node seeds it so onboarding works out of the box. Golden rule on first insert.
func SeedTenantProfile(ctx context.Context, repo *Repo, tenantID uuid.UUID, slug, displayName string) error {
	return repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		id := uuid.Must(uuid.NewV7())
		hlc := nowHLC()
		err := tx.QueryRow(ctx,
			`INSERT INTO tenant_profile (id, tenant_id, display_name, slug, hlc, version, origin_node_id)
			 VALUES ($1, $2, $3, $4, $5, 1, $6)
			 ON CONFLICT (tenant_id) DO NOTHING
			 RETURNING id`,
			id, tenantID, displayName, slug, hlc, repo.nodeID).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // already provisioned
		}
		if err != nil {
			return fmt.Errorf("seed tenant_profile: %w", err)
		}
		payload, _ := json.Marshal(map[string]any{"id": id, "slug": slug, "display_name": displayName})
		if _, err := tx.Exec(ctx,
			`INSERT INTO outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
			 VALUES ($1, $2, 'tenant_profile', $3, 'CREATE', $4, $5, $6)`,
			uuid.Must(uuid.NewV7()), tenantID, id, payload, hlc, repo.nodeID); err != nil {
			return fmt.Errorf("insert outbox: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO audit_log (id, tenant_id, action, resource_type, resource_id, after, origin_node_id)
			 VALUES ($1, $2, 'tenant_profile.create', 'tenant_profile', $3, $4, $5)`,
			uuid.Must(uuid.NewV7()), tenantID, id, payload, repo.nodeID); err != nil {
			return fmt.Errorf("insert audit: %w", err)
		}
		return nil
	})
}
