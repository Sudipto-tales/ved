package access

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/weloin/ved/internal/platform/authz"
)

// SeedCatalog upserts the code-defined permission catalog into the GLOBAL `permissions`
// table (docs/05-rbac.md "Permissions are fixed"). Idempotent: safe on every startup,
// a near-no-op after the first run. permissions has no RLS, so no tenant context.
//
// This is the BE side of the permission-catalog seam (docs/plan/bridges.md §4): the
// catalog is the closed set the cloud may later push updates for (bridge §7).
func SeedCatalog(ctx context.Context, repo *Repo) error {
	for _, p := range authz.Catalog {
		if _, err := repo.pool.Exec(ctx,
			`INSERT INTO permissions (id, key, description)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
			uuid.Must(uuid.NewV7()), p.Key, p.Description); err != nil {
			return fmt.Errorf("seed permission %s: %w", p.Key, err)
		}
	}
	slog.Info("rbac: permission catalog seeded", "count", len(authz.Catalog))
	return nil
}

// BootstrapTenant seeds a tenant's default system roles + their permissions and attaches
// the first admin to the School Admin role — the provisioning step from docs/05-rbac.md
// "The Bootstrap". At M4 the control plane calls this on tenant creation; for now the
// node calls it for the dev tenant. Idempotent. Each newly created role and the admin
// attachment follow the golden rule (row + outbox + audit in the same tx).
func BootstrapTenant(ctx context.Context, repo *Repo, tenantID, adminMembershipID uuid.UUID) error {
	return repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		// Resolve all catalog keys → global permission ids once.
		allKeys := make([]string, 0, len(authz.Catalog))
		for _, p := range authz.Catalog {
			allKeys = append(allKeys, p.Key)
		}
		permIDs, err := permIDsByKeys(ctx, tx, allKeys)
		if err != nil {
			return err
		}

		for _, dr := range authz.DefaultRoles {
			roleID := uuid.Must(uuid.NewV7())
			hlc := nowHLC()
			// Insert the system role; if it already exists, skip its setup.
			var inserted bool
			err := tx.QueryRow(ctx,
				`INSERT INTO roles (id, tenant_id, name, is_system, hlc, version, origin_node_id)
				 VALUES ($1, $2, $3, true, $4, 1, $5)
				 ON CONFLICT (tenant_id, name) DO NOTHING
				 RETURNING id`,
				roleID, tenantID, dr.Name, hlc, repo.nodeID).Scan(&roleID)
			if errors.Is(err, pgx.ErrNoRows) {
				inserted = false
			} else if err != nil {
				return fmt.Errorf("seed role %s: %w", dr.Name, err)
			} else {
				inserted = true
			}
			if !inserted {
				continue
			}
			ids := map[string]uuid.UUID{}
			for _, k := range dr.Permissions {
				ids[k] = permIDs[k]
			}
			if err := insertRolePerms(ctx, tx, tenantID, roleID, ids, uuid.Nil, hlc, repo.nodeID); err != nil {
				return err
			}
			payload, _ := json.Marshal(map[string]any{"id": roleID, "name": dr.Name, "permissions": dr.Permissions, "is_system": true})
			if err := writeOutboxAudit(ctx, tx, tenantID, "role", roleID, "CREATE", "role.provision", uuid.Nil, payload, hlc, repo.nodeID); err != nil {
				return err
			}
		}

		// Attach the first admin to School Admin (tenant.admin) if not already attached.
		if adminMembershipID != uuid.Nil {
			var schoolAdminID uuid.UUID
			// Filter by tenant_id explicitly (defence-in-depth): provisioning may run as a
			// superuser (the control plane at M4), which BYPASSES RLS even with FORCE — so
			// we must not rely on app.tenant_id alone to scope this lookup.
			err := tx.QueryRow(ctx,
				`SELECT id FROM roles WHERE name = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
				authz.SchoolAdminRole, tenantID).Scan(&schoolAdminID)
			if err != nil {
				return fmt.Errorf("lookup school admin role: %w", err)
			}
			hlc := nowHLC()
			ct, err := tx.Exec(ctx,
				`INSERT INTO membership_roles (tenant_id, membership_id, role_id, hlc, origin_node_id)
				 VALUES ($1, $2, $3, $4, $5)
				 ON CONFLICT (membership_id, role_id) DO NOTHING`,
				tenantID, adminMembershipID, schoolAdminID, hlc, repo.nodeID)
			if err != nil {
				return fmt.Errorf("attach admin role: %w", err)
			}
			if ct.RowsAffected() > 0 {
				payload, _ := json.Marshal(map[string]any{"membership_id": adminMembershipID, "role_ids": []uuid.UUID{schoolAdminID}})
				if err := writeOutboxAudit(ctx, tx, tenantID, "membership", adminMembershipID, "UPDATE", "membership.set_roles", uuid.Nil, payload, hlc, repo.nodeID); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
