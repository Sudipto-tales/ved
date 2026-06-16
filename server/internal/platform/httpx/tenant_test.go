// Unit tests for tenant resolution from request headers (docs/25-subdomain-routing.md).
// No DB: the SlugResolver is faked. The care points are (1) the admin entry's host label
// "{slug}-admin" must normalise to the canonical "{slug}" before resolving, and (2) the
// X-Tenant-Slug → X-Tenant-ID priority order.
package httpx

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

func TestTenantSlug(t *testing.T) {
	cases := map[string]string{
		"lincoln":       "lincoln",
		"lincoln-admin": "lincoln",
		"maple-admin":   "maple",
		"admin":         "admin",   // not a suffix → unchanged
		"a-admin-admin": "a-admin", // strip exactly one trailing suffix
	}
	for in, want := range cases {
		if got := tenantSlug(in); got != want {
			t.Errorf("tenantSlug(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestResolveTenant(t *testing.T) {
	lincoln := uuid.New()
	// Fake resolver: only the canonical "lincoln" slug is known.
	resolve := func(_ context.Context, slug string) (uuid.UUID, bool) {
		if slug == "lincoln" {
			return lincoln, true
		}
		return uuid.Nil, false
	}

	t.Run("admin subdomain label resolves to the tenant", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("X-Tenant-Slug", "lincoln-admin") // as nginx captures it
		id, ok := resolveTenant(r, resolve)
		if !ok || id != lincoln {
			t.Fatalf("got (%v, %v), want (%v, true)", id, ok, lincoln)
		}
	})

	t.Run("plain slug resolves", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("X-Tenant-Slug", "lincoln")
		if id, ok := resolveTenant(r, resolve); !ok || id != lincoln {
			t.Fatalf("got (%v, %v), want (%v, true)", id, ok, lincoln)
		}
	})

	t.Run("unknown slug is rejected", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("X-Tenant-Slug", "ghost")
		if _, ok := resolveTenant(r, resolve); ok {
			t.Fatal("unknown slug should not resolve")
		}
	})

	t.Run("X-Tenant-ID honoured when no slug", func(t *testing.T) {
		explicit := uuid.New()
		r, _ := http.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("X-Tenant-ID", explicit.String())
		if id, ok := resolveTenant(r, resolve); !ok || id != explicit {
			t.Fatalf("got (%v, %v), want (%v, true)", id, ok, explicit)
		}
	})

	t.Run("slug takes priority over id", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("X-Tenant-Slug", "lincoln")
		r.Header.Set("X-Tenant-ID", uuid.New().String())
		if id, ok := resolveTenant(r, resolve); !ok || id != lincoln {
			t.Fatalf("got (%v, %v), want (%v, true)", id, ok, lincoln)
		}
	})

	t.Run("nothing supplied → no tenant", func(t *testing.T) {
		r, _ := http.NewRequest(http.MethodGet, "/", nil)
		if _, ok := resolveTenant(r, resolve); ok {
			t.Fatal("expected no tenant with no headers")
		}
	})
}
