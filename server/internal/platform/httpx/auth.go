// Auth middleware — the first seam in the chain (docs/plan/bridges.md §2). It
// verifies the Bearer access token and resolves { user_id, memberships } onto the
// request context. Slices NEVER parse JWTs; they read the resolved Identity.
//
// This replaces the M0 stub: identity now comes from a signed token, not a trusted
// header.
package httpx

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/weloin/ved/internal/platform/auth"
)

// Identity is the authenticated caller, resolved from the access token.
type Identity struct {
	UserID      uuid.UUID
	Memberships []auth.Membership
	MustReset   bool
	// Impersonator is set (to the platform superadmin id) when this is a "Login As
	// Tenant" support session (M11); empty for ordinary logins.
	Impersonator string
}

const identityKey ctxKey = iota + 1 // tenantKey is 0

// Authenticator returns middleware that requires a valid access token. On success
// the Identity is stored on the context; on failure the request is rejected 401.
func Authenticator(m *auth.Manager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearerToken(r)
			if raw == "" {
				Error(w, http.StatusUnauthorized, "missing bearer token")
				return
			}
			claims, err := m.ParseAccess(raw)
			if err != nil {
				Error(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}
			uid, err := uuid.Parse(claims.Subject)
			if err != nil {
				Error(w, http.StatusUnauthorized, "invalid token subject")
				return
			}
			id := Identity{UserID: uid, Memberships: claims.Memberships, MustReset: claims.MustReset, Impersonator: claims.Impersonator}
			ctx := context.WithValue(r.Context(), identityKey, id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// IdentityFrom returns the authenticated identity from the context.
func IdentityFrom(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(identityKey).(Identity)
	return id, ok
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}
