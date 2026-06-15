package authz

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PermSet is a membership's effective permission set. Use Has to test a capability —
// it applies the tenant.admin short-circuit (School Admin = all within this tenant).
type PermSet map[string]struct{}

// Has reports whether the set grants key. `tenant.admin` grants every tenant-plane
// permission (it never reaches outside the tenant — platform perms are a separate
// namespace and are never in this set).
func (s PermSet) Has(key string) bool {
	if _, ok := s[TenantAdmin]; ok {
		return true
	}
	_, ok := s[key]
	return ok
}

// Keys returns the granted permission keys (tenant.admin expands to the full catalog so
// the client can render an accurate set). Order is not guaranteed.
func (s PermSet) Keys() []string {
	if _, ok := s[TenantAdmin]; ok {
		out := make([]string, 0, len(Catalog))
		for _, p := range Catalog {
			out = append(out, p.Key)
		}
		return out
	}
	out := make([]string, 0, len(s))
	for k := range s {
		out = append(out, k)
	}
	return out
}

// Resolver computes effective permissions for a membership. It reads the tenant-scoped
// join tables under RLS, so every read runs inside a transaction with app.tenant_id set.
//
// NOTE: this resolves against the DB on each call. A Redis cache keyed by membership_id
// (invalidated on role/assignment change) is the planned optimization (docs/plan M2) —
// correctness first; the seam (this interface) stays the same when caching lands.
type Resolver struct {
	pool *pgxpool.Pool
}

// NewResolver builds a Resolver over the app pool.
func NewResolver(pool *pgxpool.Pool) *Resolver { return &Resolver{pool: pool} }

// EffectivePermissions returns the union of permission keys across all roles held by the
// membership, within the given tenant. RLS is armed via app.tenant_id.
func (r *Resolver) EffectivePermissions(ctx context.Context, tenantID, membershipID uuid.UUID) (PermSet, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return nil, fmt.Errorf("set tenant: %w", err)
	}

	rows, err := tx.Query(ctx,
		`SELECT DISTINCT p.key
		   FROM membership_roles mr
		   JOIN roles r            ON r.id = mr.role_id AND r.deleted_at IS NULL
		   JOIN role_permissions rp ON rp.role_id = mr.role_id
		   JOIN permissions p       ON p.id = rp.permission_id
		  WHERE mr.membership_id = $1`,
		membershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	set := PermSet{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		set[key] = struct{}{}
	}
	return set, rows.Err()
}
