package registration

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/httpx"
)

// Control-plane (superadmin) global search — the platform-plane mirror of the
// tenant search slice. One endpoint fans out across control-plane entities, but an
// entity is queried only if the caller is permitted to manage it. The control_plane
// schema has no RLS/tenant_id, so scope is enforced purely by the permission gate.
//
// Permission model today: only a superadmin passes any platform permission (see
// platform.RequirePermission). So the include-check is "superadmin → all, else
// none", isolated in platformSearchAllowed so that when granular platform roles
// land, only that one helper changes.

// PlatformHit is one control-plane search result.
type PlatformHit struct {
	Type     string  `json:"type"`     // "registration" | "tenant" | "subscription" | "plan" | "license"
	ID       string  `json:"id"`
	Label    string  `json:"label"`
	Sublabel string  `json:"sublabel"`
	URL      string  `json:"url"`
	Score    float64 `json:"score"`
}

// PlatformSearchResponse groups hits by type for labelled palette sections.
type PlatformSearchResponse struct {
	Query  string                   `json:"query"`
	Groups map[string][]PlatformHit `json:"groups"`
}

const (
	platformDefaultLimit = 5
	platformMaxLimit     = 10
	platformGlobalCap    = 30
	platformMinQueryLen  = 2
)

type platformSearchFunc func(ctx context.Context, s *Service, q string, limit int) ([]PlatformHit, error)

type platformEntity struct {
	typ  string
	perm string
	run  platformSearchFunc
}

var platformEntities = []platformEntity{
	{"registration", platform.PermRegistrationReview, searchRegistrations},
	{"tenant", platform.PermTenantManage, searchCPTenants},
	{"subscription", platform.PermSubscriptionManage, searchCPSubscriptions},
	{"plan", platform.PermSubscriptionManage, searchCPPlans},
	{"license", platform.PermLicenseManage, searchCPLicenses},
}

// platformSearchAllowed is the single gate. Today: superadmin holds every platform
// permission; everyone else holds none — mirroring platform.RequirePermission.
func platformSearchAllowed(id platform.Identity, _ string) bool { return id.SuperAdmin }

// PlatformSearch fans out across the control-plane entities the caller may manage.
func (s *Service) PlatformSearch(ctx context.Context, id platform.Identity, types []string, q string, limit int) (PlatformSearchResponse, error) {
	out := PlatformSearchResponse{Query: q, Groups: map[string][]PlatformHit{}}

	q = strings.TrimSpace(q)
	if len([]rune(q)) < platformMinQueryLen {
		return out, nil
	}
	if limit <= 0 {
		limit = platformDefaultLimit
	}
	if limit > platformMaxLimit {
		limit = platformMaxLimit
	}

	want := platformTypeFilter(types)

	total := 0
	for _, e := range platformEntities {
		if total >= platformGlobalCap {
			break
		}
		if !platformSearchAllowed(id, e.perm) {
			continue // permission gate — the security boundary
		}
		if want != nil && !want[e.typ] {
			continue // client narrowing only (perm already enforced)
		}
		hits, err := e.run(ctx, s, q, limit)
		if err != nil {
			return out, fmt.Errorf("platform search %s: %w", e.typ, err)
		}
		for i := range hits {
			hits[i].Score = platformScore(q, hits[i].Label, hits[i].Sublabel)
		}
		sort.SliceStable(hits, func(i, j int) bool { return hits[i].Score > hits[j].Score })
		if len(hits) > 0 {
			out.Groups[e.typ] = hits
			total += len(hits)
		}
	}
	return out, nil
}

// ---- Per-entity queries ----------------------------------------------------------

func searchRegistrations(ctx context.Context, s *Service, q string, limit int) ([]PlatformHit, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, school_name, admin_email
		   FROM control_plane.school_registration
		  WHERE school_name ILIKE '%'||$1||'%'
		     OR slug ILIKE '%'||$1||'%'
		     OR admin_email ILIKE '%'||$1||'%'
		     OR admin_name ILIKE '%'||$1||'%'
		  ORDER BY created_at DESC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlatformHit
	for rows.Next() {
		var id uuid.UUID
		var name, email string
		if err := rows.Scan(&id, &name, &email); err != nil {
			return nil, err
		}
		out = append(out, PlatformHit{
			Type: "registration", ID: id.String(),
			Label: name, Sublabel: email,
			URL: "/registrations/" + id.String(),
		})
	}
	return out, rows.Err()
}

func searchCPTenants(ctx context.Context, s *Service, q string, limit int) ([]PlatformHit, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, slug, status
		   FROM control_plane.tenant
		  WHERE name ILIKE '%'||$1||'%' OR slug ILIKE '%'||$1||'%'
		  ORDER BY created_at DESC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlatformHit
	for rows.Next() {
		var id uuid.UUID
		var name, slug, status string
		if err := rows.Scan(&id, &name, &slug, &status); err != nil {
			return nil, err
		}
		out = append(out, PlatformHit{
			Type: "tenant", ID: id.String(),
			Label: name, Sublabel: slug + " · " + status,
			URL: "/tenants/" + id.String(),
		})
	}
	return out, rows.Err()
}

func searchCPSubscriptions(ctx context.Context, s *Service, q string, limit int) ([]PlatformHit, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT sub.tenant_id, t.name, t.slug, sub.status
		   FROM control_plane.subscription sub
		   JOIN control_plane.tenant t ON t.id = sub.tenant_id
		  WHERE t.name ILIKE '%'||$1||'%' OR t.slug ILIKE '%'||$1||'%'
		  ORDER BY sub.created_at DESC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlatformHit
	for rows.Next() {
		var tenantID uuid.UUID
		var name, slug, status string
		if err := rows.Scan(&tenantID, &name, &slug, &status); err != nil {
			return nil, err
		}
		out = append(out, PlatformHit{
			Type: "subscription", ID: tenantID.String(),
			Label: name, Sublabel: "Subscription · " + status,
			URL: "/tenants/" + tenantID.String(),
		})
	}
	return out, rows.Err()
}

func searchCPPlans(ctx context.Context, s *Service, q string, limit int) ([]PlatformHit, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, tier
		   FROM control_plane.plan_catalog
		  WHERE name ILIKE '%'||$1||'%' OR tier ILIKE '%'||$1||'%'
		  ORDER BY price ASC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlatformHit
	for rows.Next() {
		var id uuid.UUID
		var name, tier string
		if err := rows.Scan(&id, &name, &tier); err != nil {
			return nil, err
		}
		out = append(out, PlatformHit{
			Type: "plan", ID: id.String(),
			Label: name, Sublabel: tier,
			URL: "/plans",
		})
	}
	return out, rows.Err()
}

func searchCPLicenses(ctx context.Context, s *Service, q string, limit int) ([]PlatformHit, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT l.id, t.name, t.slug, l.plan, l.status
		   FROM control_plane.license l
		   JOIN control_plane.tenant t ON t.id = l.tenant_id
		  WHERE l.superseded_by IS NULL
		    AND (t.name ILIKE '%'||$1||'%' OR t.slug ILIKE '%'||$1||'%' OR l.plan ILIKE '%'||$1||'%')
		  ORDER BY l.issued_at DESC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlatformHit
	for rows.Next() {
		var id uuid.UUID
		var name, slug, plan, status string
		if err := rows.Scan(&id, &name, &slug, &plan, &status); err != nil {
			return nil, err
		}
		out = append(out, PlatformHit{
			Type: "license", ID: id.String(),
			Label: name, Sublabel: plan + " · " + status,
			URL: "/licenses",
		})
	}
	return out, rows.Err()
}

// ---- Helpers ---------------------------------------------------------------------

func platformTypeFilter(types []string) map[string]bool {
	if len(types) == 0 {
		return nil
	}
	set := map[string]bool{}
	for _, t := range types {
		t = strings.TrimSpace(t)
		if t != "" {
			set[t] = true
		}
	}
	if len(set) == 0 {
		return nil
	}
	return set
}

func platformScore(q, label, sublabel string) float64 {
	q = strings.ToLower(strings.TrimSpace(q))
	l, s := strings.ToLower(label), strings.ToLower(sublabel)
	switch {
	case s == q || l == q:
		return 1.0
	case strings.HasPrefix(l, q) || strings.HasPrefix(s, q):
		return 0.7
	default:
		return 0.4
	}
}

// ---- HTTP ------------------------------------------------------------------------

// RegisterPlatformSearch mounts GET /api/v1/platform/search inside the platform
// Authenticator group. There is no single platform.RequirePermission because the
// endpoint spans entities with different permissions; the handler reads the platform
// Identity and the service gates each entity via platformSearchAllowed.
func RegisterPlatformSearch(r chi.Router, svc *Service) {
	r.Get("/api/v1/platform/search", func(w http.ResponseWriter, req *http.Request) {
		id, ok := platform.IdentityFrom(req.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		qv := req.URL.Query()
		types := platformSplitCSV(qv.Get("types"))
		limit := platformParseLimit(qv.Get("limit"))
		out, err := svc.PlatformSearch(req.Context(), id, types, qv.Get("q"), limit)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, out)
	})
}

func platformSplitCSV(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return strings.Split(s, ",")
}

func platformParseLimit(s string) int {
	if s == "" {
		return platformDefaultLimit
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return platformDefaultLimit
	}
	return n
}
