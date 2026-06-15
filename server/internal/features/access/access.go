// Package access is the M2 RBAC slice (docs/plan/README.md M2, docs/05-rbac.md,
// docs/database/02-identity-access.md). It manages the DYNAMIC side of RBAC — roles,
// their permission bundles, designations, and which roles a member holds — while the
// FIXED permission catalog and the gate itself live in internal/platform/authz.
//
// It follows the canonical slice shape: a tenant-scoped repo that arms RLS, a service
// where every mutation writes row + outbox + audit in ONE transaction (the golden
// rule), and handlers behind authz.Require(...). docs/plan/bridges.md §4, §6.
package access

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
)

// ---- DTOs (wire shapes; the OpenAPI contract) -----------------------------------

type PermissionDTO struct {
	Key         string `json:"key"`
	Description string `json:"description"`
}

type RoleDTO struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	IsSystem    bool      `json:"is_system"`
	Permissions []string  `json:"permissions"`
}

type DesignationDTO struct {
	ID                uuid.UUID `json:"id"`
	Name              string    `json:"name"`
	AppliesToUserType *string   `json:"applies_to_user_type,omitempty"`
}

type MemberDTO struct {
	MembershipID uuid.UUID   `json:"membership_id"`
	Login        string      `json:"login_identifier"`
	UserType     string      `json:"user_type"`
	Status       string      `json:"status"`
	RoleIDs      []uuid.UUID `json:"role_ids"`
}

var (
	ErrNotFound   = errors.New("not found")
	ErrSystemRole = errors.New("system roles cannot be modified")
	ErrBadPerm    = errors.New("unknown permission key")
)

// ---- Repository ------------------------------------------------------------------

type Repo struct {
	pool   *pgxpool.Pool
	nodeID uuid.UUID
}

func NewRepo(pool *pgxpool.Pool, nodeID uuid.UUID) *Repo { return &Repo{pool: pool, nodeID: nodeID} }

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

// permIDsByKeys maps catalog keys → global permission ids (permissions has no RLS).
func permIDsByKeys(ctx context.Context, q pgx.Tx, keys []string) (map[string]uuid.UUID, error) {
	out := map[string]uuid.UUID{}
	if len(keys) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT id, key FROM permissions WHERE key = ANY($1)`, keys)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var key string
		if err := rows.Scan(&id, &key); err != nil {
			return nil, err
		}
		out[key] = id
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, k := range keys {
		if _, ok := out[k]; !ok {
			return nil, fmt.Errorf("%w: %s", ErrBadPerm, k)
		}
	}
	return out, nil
}

// ---- Service ---------------------------------------------------------------------

type Service struct{ repo *Repo }

func NewService(repo *Repo) *Service { return &Service{repo: repo} }

// ListPermissions returns the global catalog rows.
func (s *Service) ListPermissions(ctx context.Context) ([]PermissionDTO, error) {
	rows, err := s.repo.pool.Query(ctx, `SELECT key, description FROM permissions ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PermissionDTO{}
	for rows.Next() {
		var p PermissionDTO
		if err := rows.Scan(&p.Key, &p.Description); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListRoles returns the tenant's live roles, each with its permission keys.
func (s *Service) ListRoles(ctx context.Context, tenantID uuid.UUID) ([]RoleDTO, error) {
	out := []RoleDTO{}
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT r.id, r.name, r.is_system,
			        COALESCE(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS perms
			   FROM roles r
			   LEFT JOIN role_permissions rp ON rp.role_id = r.id
			   LEFT JOIN permissions p       ON p.id = rp.permission_id
			  WHERE r.deleted_at IS NULL
			  GROUP BY r.id, r.name, r.is_system
			  ORDER BY r.is_system DESC, r.name`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var d RoleDTO
			if err := rows.Scan(&d.ID, &d.Name, &d.IsSystem, &d.Permissions); err != nil {
				return err
			}
			out = append(out, d)
		}
		return rows.Err()
	})
	return out, err
}

// CreateRole inserts a role + its role_permissions + outbox + audit in one tx.
func (s *Service) CreateRole(ctx context.Context, tenantID, actor uuid.UUID, name string, perms []string) (RoleDTO, error) {
	var dto RoleDTO
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		permIDs, err := permIDsByKeys(ctx, tx, perms)
		if err != nil {
			return err
		}
		id := uuid.Must(uuid.NewV7())
		hlc := nowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO roles (id, tenant_id, name, is_system, created_by, hlc, version, origin_node_id)
			 VALUES ($1, $2, $3, false, $4, $5, 1, $6)`,
			id, tenantID, name, actorOrNil(actor), hlc, s.repo.nodeID); err != nil {
			return fmt.Errorf("insert role: %w", err)
		}
		if err := insertRolePerms(ctx, tx, tenantID, id, permIDs, actor, hlc, s.repo.nodeID); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{"id": id, "name": name, "permissions": perms})
		if err := writeOutboxAudit(ctx, tx, tenantID, "role", id, "CREATE", "role.create", actor, payload, hlc, s.repo.nodeID); err != nil {
			return err
		}
		dto = RoleDTO{ID: id, Name: name, IsSystem: false, Permissions: perms}
		return nil
	})
	return dto, err
}

// UpdateRole renames a (non-system) role and replaces its permission set, atomically.
func (s *Service) UpdateRole(ctx context.Context, tenantID, actor, roleID uuid.UUID, name string, perms []string) (RoleDTO, error) {
	var dto RoleDTO
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var isSystem bool
		err := tx.QueryRow(ctx, `SELECT is_system FROM roles WHERE id = $1 AND deleted_at IS NULL`, roleID).Scan(&isSystem)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if isSystem {
			return ErrSystemRole
		}
		permIDs, err := permIDsByKeys(ctx, tx, perms)
		if err != nil {
			return err
		}
		hlc := nowHLC()
		ct, err := tx.Exec(ctx,
			`UPDATE roles SET name = $2, updated_at = now(), version = version + 1, hlc = $3
			  WHERE id = $1 AND deleted_at IS NULL`, roleID, name, hlc)
		if err != nil {
			return fmt.Errorf("update role: %w", err)
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
			return fmt.Errorf("clear role perms: %w", err)
		}
		if err := insertRolePerms(ctx, tx, tenantID, roleID, permIDs, actor, hlc, s.repo.nodeID); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{"id": roleID, "name": name, "permissions": perms})
		if err := writeOutboxAudit(ctx, tx, tenantID, "role", roleID, "UPDATE", "role.update", actor, payload, hlc, s.repo.nodeID); err != nil {
			return err
		}
		dto = RoleDTO{ID: roleID, Name: name, IsSystem: false, Permissions: perms}
		return nil
	})
	return dto, err
}

// DeleteRole soft-deletes a non-system role (and detaches its assignments) in one tx.
func (s *Service) DeleteRole(ctx context.Context, tenantID, actor, roleID uuid.UUID) error {
	return s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var isSystem bool
		err := tx.QueryRow(ctx, `SELECT is_system FROM roles WHERE id = $1 AND deleted_at IS NULL`, roleID).Scan(&isSystem)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if isSystem {
			return ErrSystemRole
		}
		hlc := nowHLC()
		if _, err := tx.Exec(ctx,
			`UPDATE roles SET deleted_at = now(), updated_at = now(), version = version + 1, hlc = $2
			  WHERE id = $1`, roleID, hlc); err != nil {
			return fmt.Errorf("soft-delete role: %w", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM membership_roles WHERE role_id = $1`, roleID); err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{"id": roleID})
		return writeOutboxAudit(ctx, tx, tenantID, "role", roleID, "DELETE", "role.delete", actor, payload, hlc, s.repo.nodeID)
	})
}

// ListDesignations returns the tenant's live designations.
func (s *Service) ListDesignations(ctx context.Context, tenantID uuid.UUID) ([]DesignationDTO, error) {
	out := []DesignationDTO{}
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, name, applies_to_user_type FROM designations
			  WHERE deleted_at IS NULL ORDER BY name`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var d DesignationDTO
			if err := rows.Scan(&d.ID, &d.Name, &d.AppliesToUserType); err != nil {
				return err
			}
			out = append(out, d)
		}
		return rows.Err()
	})
	return out, err
}

// CreateDesignation inserts a designation + outbox + audit in one tx.
func (s *Service) CreateDesignation(ctx context.Context, tenantID, actor uuid.UUID, name string, appliesTo *string) (DesignationDTO, error) {
	var dto DesignationDTO
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		id := uuid.Must(uuid.NewV7())
		hlc := nowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO designations (id, tenant_id, name, applies_to_user_type, created_by, hlc, version, origin_node_id)
			 VALUES ($1, $2, $3, $4, $5, $6, 1, $7)`,
			id, tenantID, name, appliesTo, actorOrNil(actor), hlc, s.repo.nodeID); err != nil {
			return fmt.Errorf("insert designation: %w", err)
		}
		payload, _ := json.Marshal(map[string]any{"id": id, "name": name, "applies_to_user_type": appliesTo})
		if err := writeOutboxAudit(ctx, tx, tenantID, "designation", id, "CREATE", "designation.create", actor, payload, hlc, s.repo.nodeID); err != nil {
			return err
		}
		dto = DesignationDTO{ID: id, Name: name, AppliesToUserType: appliesTo}
		return nil
	})
	return dto, err
}

// ListMembers returns the tenant's memberships with the roles each holds. (Identity &
// access is one bounded context — docs/database/02 — so reading memberships here is
// in-domain, not a slice-boundary violation.)
func (s *Service) ListMembers(ctx context.Context, tenantID uuid.UUID) ([]MemberDTO, error) {
	out := []MemberDTO{}
	err := s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT m.id, u.login_identifier, m.user_type, m.status,
			        COALESCE(array_agg(mr.role_id) FILTER (WHERE mr.role_id IS NOT NULL), '{}') AS role_ids
			   FROM memberships m
			   JOIN users u ON u.id = m.user_id
			   LEFT JOIN membership_roles mr ON mr.membership_id = m.id
			  WHERE m.deleted_at IS NULL
			  GROUP BY m.id, u.login_identifier, m.user_type, m.status
			  ORDER BY u.login_identifier`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var d MemberDTO
			if err := rows.Scan(&d.MembershipID, &d.Login, &d.UserType, &d.Status, &d.RoleIDs); err != nil {
				return err
			}
			out = append(out, d)
		}
		return rows.Err()
	})
	return out, err
}

// SetMemberRoles replaces the role set for a membership in one tx (outbox + audit).
func (s *Service) SetMemberRoles(ctx context.Context, tenantID, actor, membershipID uuid.UUID, roleIDs []uuid.UUID) error {
	return s.repo.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var exists bool
		err := tx.QueryRow(ctx, `SELECT true FROM memberships WHERE id = $1 AND deleted_at IS NULL`, membershipID).Scan(&exists)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		// Validate the roles belong to this tenant and are live (RLS already scopes).
		for _, rid := range roleIDs {
			var ok bool
			err := tx.QueryRow(ctx, `SELECT true FROM roles WHERE id = $1 AND deleted_at IS NULL`, rid).Scan(&ok)
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("%w: role %s", ErrNotFound, rid)
			}
			if err != nil {
				return err
			}
		}
		hlc := nowHLC()
		if _, err := tx.Exec(ctx, `DELETE FROM membership_roles WHERE membership_id = $1`, membershipID); err != nil {
			return fmt.Errorf("clear member roles: %w", err)
		}
		for _, rid := range roleIDs {
			if _, err := tx.Exec(ctx,
				`INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by, hlc, origin_node_id)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				tenantID, membershipID, rid, actorOrNil(actor), hlc, s.repo.nodeID); err != nil {
				return fmt.Errorf("insert member role: %w", err)
			}
		}
		payload, _ := json.Marshal(map[string]any{"membership_id": membershipID, "role_ids": roleIDs})
		return writeOutboxAudit(ctx, tx, tenantID, "membership", membershipID, "UPDATE", "membership.set_roles", actor, payload, hlc, s.repo.nodeID)
	})
}

// ---- shared tx helpers -----------------------------------------------------------

func insertRolePerms(ctx context.Context, tx pgx.Tx, tenantID, roleID uuid.UUID, permIDs map[string]uuid.UUID, actor uuid.UUID, hlc string, nodeID uuid.UUID) error {
	for _, pid := range permIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by, hlc, origin_node_id)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			tenantID, roleID, pid, actorOrNil(actor), hlc, nodeID); err != nil {
			return fmt.Errorf("insert role perm: %w", err)
		}
	}
	return nil
}

// writeOutboxAudit appends the outbox event + audit row that every mutation must carry.
func writeOutboxAudit(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID, aggregate string, aggID uuid.UUID, op, action string, actor uuid.UUID, payload []byte, hlc string, nodeID uuid.UUID) error {
	if _, err := tx.Exec(ctx,
		`INSERT INTO outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		uuid.Must(uuid.NewV7()), tenantID, aggregate, aggID, op, payload, hlc, nodeID); err != nil {
		return fmt.Errorf("insert outbox: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO audit_log (id, tenant_id, actor_membership_id, action, resource_type, resource_id, after, origin_node_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		uuid.Must(uuid.NewV7()), tenantID, actorOrNil(actor), action, aggregate, aggID, payload, nodeID); err != nil {
		return fmt.Errorf("insert audit: %w", err)
	}
	return nil
}

func actorOrNil(a uuid.UUID) *uuid.UUID {
	if a == uuid.Nil {
		return nil
	}
	return &a
}

func nowHLC() string { return strconv.FormatInt(time.Now().UnixNano(), 10) }

// ---- HTTP ------------------------------------------------------------------------

// Register mounts the access endpoints on a router group already wrapped in auth +
// tenant-context middleware. Each route adds its own authz.Require(...) gate.
func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, res *authz.Resolver) {
	svc := NewService(NewRepo(pool, nodeID))

	// Self-service: the caller's own effective permissions in the active tenant. No gate
	// (any member may read their own permissions) — this is what the FE uses to render.
	r.Get("/api/v1/me/permissions", func(w http.ResponseWriter, req *http.Request) {
		set, err := authz.PermissionsFrom(req, res)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not resolve permissions")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"permissions": set.Keys()})
	})

	// Permission catalog (for building roles).
	r.With(authz.Require(res, "role.manage")).Get("/api/v1/access/permissions",
		func(w http.ResponseWriter, req *http.Request) {
			perms, err := svc.ListPermissions(req.Context())
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"permissions": perms})
		})

	// Roles CRUD.
	r.With(authz.Require(res, "role.manage")).Route("/api/v1/access/roles", func(rr chi.Router) {
		rr.Get("/", func(w http.ResponseWriter, req *http.Request) {
			roles, err := svc.ListRoles(req.Context(), httpx.TenantID(req.Context()))
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"roles": roles})
		})
		rr.Post("/", func(w http.ResponseWriter, req *http.Request) {
			var in struct {
				Name        string   `json:"name"`
				Permissions []string `json:"permissions"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.Name == "" {
				httpx.Error(w, http.StatusBadRequest, "name is required")
				return
			}
			dto, err := svc.CreateRole(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.Name, in.Permissions)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, dto)
		})
		rr.Put("/{id}", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid role id")
				return
			}
			var in struct {
				Name        string   `json:"name"`
				Permissions []string `json:"permissions"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.Name == "" {
				httpx.Error(w, http.StatusBadRequest, "name is required")
				return
			}
			dto, err := svc.UpdateRole(req.Context(), httpx.TenantID(req.Context()), actorID(req), id, in.Name, in.Permissions)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, dto)
		})
		rr.Delete("/{id}", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid role id")
				return
			}
			if err := svc.DeleteRole(req.Context(), httpx.TenantID(req.Context()), actorID(req), id); err != nil {
				writeErr(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	})

	// Designations.
	r.With(authz.Require(res, "designation.manage")).Route("/api/v1/access/designations", func(rr chi.Router) {
		rr.Get("/", func(w http.ResponseWriter, req *http.Request) {
			ds, err := svc.ListDesignations(req.Context(), httpx.TenantID(req.Context()))
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"designations": ds})
		})
		rr.Post("/", func(w http.ResponseWriter, req *http.Request) {
			var in struct {
				Name              string  `json:"name"`
				AppliesToUserType *string `json:"applies_to_user_type"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.Name == "" {
				httpx.Error(w, http.StatusBadRequest, "name is required")
				return
			}
			dto, err := svc.CreateDesignation(req.Context(), httpx.TenantID(req.Context()), actorID(req), in.Name, in.AppliesToUserType)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, dto)
		})
	})

	// Members + role assignment.
	r.With(authz.Require(res, "user.assign_roles")).Route("/api/v1/access/members", func(rr chi.Router) {
		rr.Get("/", func(w http.ResponseWriter, req *http.Request) {
			members, err := svc.ListMembers(req.Context(), httpx.TenantID(req.Context()))
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, err.Error())
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"members": members})
		})
		rr.Put("/{id}/roles", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid membership id")
				return
			}
			var in struct {
				RoleIDs []uuid.UUID `json:"role_ids"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "role_ids is required")
				return
			}
			if err := svc.SetMemberRoles(req.Context(), httpx.TenantID(req.Context()), actorID(req), id, in.RoleIDs); err != nil {
				writeErr(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	})
}

// actorID is the caller's membership id in the active tenant (audit actor / created_by).
func actorID(req *http.Request) uuid.UUID {
	ident, ok := httpx.IdentityFrom(req.Context())
	if !ok {
		return uuid.Nil
	}
	tenantID := httpx.TenantID(req.Context())
	for _, m := range ident.Memberships {
		if m.TenantID == tenantID {
			return m.MembershipID
		}
	}
	return uuid.Nil
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not found")
	case errors.Is(err, ErrSystemRole):
		httpx.Error(w, http.StatusConflict, "system roles cannot be modified")
	case errors.Is(err, ErrBadPerm):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}
