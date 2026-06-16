// Tenant-context middleware — the seam that arms RLS (plan/bridges.md §3).
//
// The active tenant is named one of two ways, in priority order:
//  1. X-Tenant-Slug — set by the subdomain gateway (lincoln.ved.com) and resolved to a
//     tenant_id via the injected SlugResolver (docs/25-subdomain-routing.md).
//  2. X-Tenant-ID — an explicit uuid, for API clients / tests / bare-localhost dev.
//
// Either way it is AUTHORISED: the chosen tenant must be one of the authenticated user's
// memberships, else 403. Downstream code reads the tenant ONLY from the request context.
package httpx

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type ctxKey int

const tenantKey ctxKey = iota

// SlugResolver maps a tenant slug to its tenant_id (false if unknown). Supplied by the
// node, which looks it up via the tenant_id_by_slug SECURITY DEFINER function.
type SlugResolver func(ctx context.Context, slug string) (uuid.UUID, bool)

// TenantContext returns the tenant-context middleware. `resolve` may be nil (then only
// X-Tenant-ID is honoured — e.g. the control plane / dev without subdomains).
func TenantContext(resolve SlugResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := resolveTenant(r, resolve)
			if !ok {
				Error(w, http.StatusBadRequest, "missing or unknown tenant (X-Tenant-Slug / X-Tenant-ID)")
				return
			}
			// When authenticated, the chosen tenant must be one the user belongs to.
			if ident, authed := IdentityFrom(r.Context()); authed && !ident.belongsTo(id) {
				Error(w, http.StatusForbidden, "not a member of this tenant")
				return
			}
			ctx := context.WithValue(r.Context(), tenantKey, id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func resolveTenant(r *http.Request, resolve SlugResolver) (uuid.UUID, bool) {
	if slug := r.Header.Get("X-Tenant-Slug"); slug != "" && resolve != nil {
		if id, ok := resolve(r.Context(), tenantSlug(slug)); ok {
			return id, true
		}
		return uuid.Nil, false
	}
	if raw := r.Header.Get("X-Tenant-ID"); raw != "" {
		if id, err := uuid.Parse(raw); err == nil {
			return id, true
		}
	}
	return uuid.Nil, false
}

// tenantSlug normalises a host-derived slug to the canonical tenant slug. The admin entry
// is reached at {slug}-admin.ved.com, and nginx authoritatively captures the whole leftmost
// label ("lincoln-admin"), so we strip the "-admin" suffix here — server-side, independent
// of any client value — to recover the tenant slug ("lincoln"). See docs/25 §2,§5.
func tenantSlug(s string) string {
	return strings.TrimSuffix(s, "-admin")
}

// belongsTo reports whether the identity holds a membership in the given tenant.
func (i Identity) belongsTo(tenantID uuid.UUID) bool {
	for _, m := range i.Memberships {
		if m.TenantID == tenantID {
			return true
		}
	}
	return false
}

// TenantID returns the active tenant from the context (zero UUID if unset).
func TenantID(ctx context.Context) uuid.UUID {
	if v, ok := ctx.Value(tenantKey).(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}
