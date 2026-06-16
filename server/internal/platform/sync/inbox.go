// Node-side inbox apply for cloud→node config push-down (docs/08 pillars 4+5). The node
// consumes config events the cloud published, dedupes them through the `inbox` table
// (event_id PK), and applies the full-row snapshot via the LWW + tombstone merge. Inbox
// insert + merge happen in ONE transaction so a crash mid-apply can't leave the event
// "consumed" but unapplied — JetStream redelivers and we re-run cleanly.
package sync

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Registry maps an aggregate name to the table/columns the node merges it into. It is
// code-defined (trusted identifiers), e.g. {"tenant_profile": {Table:"tenant_profile",
// Columns:[]string{"display_name","slug"}}}.
type Registry map[string]RowSpec

// ApplyConfigEvent dedupes a cloud→node event through the inbox and merges it. Returns the
// merge Action (ActionSkip when the event was a duplicate the inbox already recorded). The
// pool connects as ved_app, so RLS scopes the inbox insert + merge to env.TenantID.
func ApplyConfigEvent(ctx context.Context, pool *pgxpool.Pool, reg Registry, env Envelope) (Action, error) {
	spec, ok := reg[env.Aggregate]
	if !ok {
		// Not a config aggregate this node materialises — record in inbox so we don't keep
		// re-receiving it, but there's nothing to merge.
		return ActionSkip, recordInboxOnly(ctx, pool, env)
	}

	var action Action = ActionSkip
	err := withTenant(ctx, pool, env.TenantID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`INSERT INTO inbox (event_id, tenant_id) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
			env.EventID, env.TenantID)
		if err != nil {
			return fmt.Errorf("inbox insert: %w", err)
		}
		if ct.RowsAffected() == 0 {
			return nil // duplicate / replay → idempotent no-op
		}
		a, err := ApplyRow(ctx, tx, spec, env)
		action = a
		return err
	})
	return action, err
}

func recordInboxOnly(ctx context.Context, pool *pgxpool.Pool, env Envelope) error {
	return withTenant(ctx, pool, env.TenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO inbox (event_id, tenant_id) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
			env.EventID, env.TenantID)
		return err
	})
}

// withTenant runs fn in a tx with app.tenant_id set (the same RLS seam slices use).
func withTenant(ctx context.Context, pool *pgxpool.Pool, tenantID interface{ String() string }, fn func(pgx.Tx) error) error {
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
