package authz

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/weloin/ved/internal/platform/httpx"
)

type ctxKey int

const permsKey ctxKey = iota

// Require returns middleware that admits the request only if the caller's membership in
// the active tenant holds `perm` (docs/plan/bridges.md §4). It runs AFTER the auth and
// tenant-context seams, so an Identity and an active tenant are present. The resolved
// PermSet is cached on the context so chained checks / handlers reuse it.
func Require(res *Resolver, perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			set, err := permsForRequest(r, res)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "could not resolve permissions")
				return
			}
			if !set.Has(perm) {
				httpx.Error(w, http.StatusForbidden, "missing permission: "+perm)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), permsKey, set)))
		})
	}
}

// permsForRequest resolves (and memoizes on the context) the caller's effective
// permissions for the active tenant.
func permsForRequest(r *http.Request, res *Resolver) (PermSet, error) {
	if set, ok := r.Context().Value(permsKey).(PermSet); ok {
		return set, nil
	}
	ident, ok := httpx.IdentityFrom(r.Context())
	if !ok {
		return PermSet{}, nil // unauthenticated → no permissions
	}
	tenantID := httpx.TenantID(r.Context())
	mid := membershipFor(ident, tenantID)
	if mid == uuid.Nil {
		return PermSet{}, nil // not a member of the active tenant → no permissions
	}
	return res.EffectivePermissions(r.Context(), tenantID, mid)
}

// PermissionsFrom returns the caller's effective permissions for the active tenant,
// resolving them if a Require gate has not already cached them. Used by /me/permissions.
func PermissionsFrom(r *http.Request, res *Resolver) (PermSet, error) {
	return permsForRequest(r, res)
}

func membershipFor(ident httpx.Identity, tenantID uuid.UUID) uuid.UUID {
	for _, m := range ident.Memberships {
		if m.TenantID == tenantID {
			return m.MembershipID
		}
	}
	return uuid.Nil
}
