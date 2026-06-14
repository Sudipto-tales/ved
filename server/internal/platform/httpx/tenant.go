// Tenant-context middleware — the seam that arms RLS (plan/bridges.md §3).
//
// The client names its active tenant in `X-Tenant-ID` (chosen from the tenant
// picker). At M1 this is now AUTHORISED: the tenant must be one of the
// authenticated user's memberships, so a caller cannot point at a tenant they don't
// belong to. Downstream code reads the tenant ONLY from the request context — no
// slice passes tenant_id by hand.
package httpx

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

type ctxKey int

const tenantKey ctxKey = iota

// TenantContext extracts the active tenant, verifies it against the caller's
// memberships (when an Identity is present), and stores it on the request context.
// Requests to tenant-scoped routes without a valid, authorised tenant are rejected.
func TenantContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := r.Header.Get("X-Tenant-ID")
		if raw == "" {
			Error(w, http.StatusBadRequest, "missing X-Tenant-ID")
			return
		}
		id, err := uuid.Parse(raw)
		if err != nil {
			Error(w, http.StatusBadRequest, "invalid X-Tenant-ID")
			return
		}
		// When authenticated, the chosen tenant must be one the user belongs to.
		if ident, ok := IdentityFrom(r.Context()); ok && !ident.belongsTo(id) {
			Error(w, http.StatusForbidden, "not a member of this tenant")
			return
		}
		ctx := context.WithValue(r.Context(), tenantKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
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
