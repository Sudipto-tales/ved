// M11 "Login As Tenant" — admin-initiated tenant impersonation (docs/promts.md
// "Tenant Impersonation"). Instead of ever showing a tenant's password, the superadmin
// mints a SHORT-LIVED, audited, node-compatible access token scoped to the tenant's
// School Admin — gated by the TENANT's own consent flag (tenant_profile, M11 Slice B).
// This is how Salesforce/Shopify/HubSpot do support access.
package registration

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/auth"
	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
)

// ErrConsentRequired is returned when a tenant has not enabled super-admin access.
var ErrConsentRequired = errors.New("tenant has not granted super-admin access")

// ImpersonationResult is the support session the platform hands the browser. The token
// authenticates against the tenant NODE exactly like a normal login, but expires in 30
// minutes and is stamped with the impersonating admin.
type ImpersonationResult struct {
	AccessToken  string    `json:"access_token"`
	Slug         string    `json:"slug"`
	UserID       uuid.UUID `json:"user_id"`
	Login        string    `json:"login"`
	ExpiresInSec int       `json:"expires_in_sec"`
}

// LoginAsTenant mints an impersonation token for the tenant's School Admin, provided the
// tenant has consented. It reads tenant-plane rows as the control-plane owner (which
// bypasses RLS), so it filters tenant_id explicitly — the same defence-in-depth the
// provisioning bootstrap uses.
func (s *Service) LoginAsTenant(ctx context.Context, mgr *auth.Manager, adminID, tenantID uuid.UUID) (ImpersonationResult, error) {
	// 1. Consent gate (tenant-owned) + the tenant's slug for the redirect.
	var allowed bool
	var slug string
	err := s.pool.QueryRow(ctx,
		`SELECT allow_superadmin_access, slug FROM tenant_profile WHERE tenant_id=$1 AND deleted_at IS NULL`,
		tenantID).Scan(&allowed, &slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return ImpersonationResult{}, ErrNotFound
	}
	if err != nil {
		return ImpersonationResult{}, err
	}
	if !allowed {
		return ImpersonationResult{}, ErrConsentRequired
	}

	// 2. Resolve the tenant's School Admin (the impersonation target).
	var userID, membershipID uuid.UUID
	var userType, login string
	err = s.pool.QueryRow(ctx,
		`SELECT m.user_id, m.id, m.user_type, u.login_identifier
		   FROM memberships m
		   JOIN membership_roles mr ON mr.membership_id = m.id AND mr.tenant_id = $1
		   JOIN roles ro            ON ro.id = mr.role_id AND ro.tenant_id = $1
		   JOIN users u             ON u.id = m.user_id
		  WHERE m.tenant_id = $1 AND ro.name = $2 AND ro.is_system AND ro.deleted_at IS NULL
		    AND m.status = 'ACTIVE' AND m.deleted_at IS NULL AND u.deleted_at IS NULL
		  ORDER BY m.created_at LIMIT 1`,
		tenantID, authz.SchoolAdminRole).Scan(&userID, &membershipID, &userType, &login)
	if errors.Is(err, pgx.ErrNoRows) {
		return ImpersonationResult{}, ErrNotFound
	}
	if err != nil {
		return ImpersonationResult{}, err
	}

	// 3. Mint the scoped, short-lived token (memberships = just this tenant's admin).
	token, err := mgr.IssueImpersonation(userID,
		[]auth.Membership{{MembershipID: membershipID, TenantID: tenantID, UserType: userType}}, adminID)
	if err != nil {
		return ImpersonationResult{}, err
	}

	// 4. Audit — who impersonated whom, and when.
	detail, _ := json.Marshal(map[string]any{"slug": slug, "login": login, "target_user_id": userID})
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO control_plane.cp_audit_log (id, admin_id, action, target_type, target_id, detail)
		 VALUES ($1,$2,'tenant.login_as','tenant',$3,$4)`,
		uuid.Must(uuid.NewV7()), adminID, tenantID, detail); err != nil {
		return ImpersonationResult{}, err
	}

	return ImpersonationResult{AccessToken: token, Slug: slug, UserID: userID, Login: login, ExpiresInSec: 1800}, nil
}

// RegisterPlatformImpersonation mounts the Login-As endpoint. The caller must gate the
// group on a platform token; the auth.Manager mints node-compatible tenant tokens.
func RegisterPlatformImpersonation(r chi.Router, svc *Service, mgr *auth.Manager) {
	r.With(platform.RequirePermission(platform.PermTenantManage)).
		Post("/api/v1/platform/tenants/{id}/login-as", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid id")
				return
			}
			ident, _ := platform.IdentityFrom(req.Context())
			res, err := svc.LoginAsTenant(req.Context(), mgr, ident.AdminID, id)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, res)
		})
}
