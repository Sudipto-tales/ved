// Package search is the tenant-plane global search slice. It powers the navbar
// command palette: one endpoint that fans out across domain entities and returns a
// unified, ranked result set.
//
// The defining property is permission scoping, enforced HERE on the server, never
// trusted from the client: an entity is queried only if the caller's effective
// PermSet holds that entity's `.read` permission. So a School Admin (tenant.admin,
// which short-circuits PermSet.Has) searches everything, while a teacher searches
// only teacher-readable content — the same mechanism produces both. The client's
// optional `types` filter can only NARROW this set, never widen it.
//
// Reads run inside ONE RLS-armed transaction (app.tenant_id is set), so results are
// additionally scoped to the active school. v1 uses per-entity ILIKE on key columns;
// a pg_trgm index is the documented future optimization (the interface stays the same).
package search

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/onboarding"
)

// ---- Wire shapes (the OpenAPI contract) -----------------------------------------

// Hit is a single search result. URL is the frontend deep link to the record.
type Hit struct {
	Type     string  `json:"type"`     // "student" | "teacher" | "staff" | "guardian"
	ID       string  `json:"id"`       // record UUID
	Label    string  `json:"label"`    // primary line (name-from-handle, or guardian name)
	Sublabel string  `json:"sublabel"` // secondary line (admission_no / employee_code / phone)
	URL      string  `json:"url"`      // FE route, e.g. /students/{id}
	Score    float64 `json:"score"`    // relevance: exact code 1.0 > prefix 0.7 > substring 0.4
}

// Response groups hits by type so the palette can render labelled sections.
type Response struct {
	Query  string           `json:"query"`
	Groups map[string][]Hit `json:"groups"`
}

const (
	defaultLimit = 5  // per-entity cap
	maxLimit     = 10 // per-entity ceiling
	globalCap    = 30 // total hits across all entities
	minQueryLen  = 2  // shorter queries return empty (keeps client debounce cheap)
)

// ---- Entity registry -------------------------------------------------------------

// searchFunc runs one entity's RLS-scoped query inside the shared tenant tx.
type searchFunc func(ctx context.Context, tx pgx.Tx, q string, limit int) ([]Hit, error)

// entitySearcher pairs an entity type with the permission that gates it and its query.
// Guardians are surfaced under student.read (they are read through the student slice).
type entitySearcher struct {
	typ  string
	perm string
	run  searchFunc
}

var entities = []entitySearcher{
	{"student", "student.read", searchStudents},
	{"teacher", "teacher.read", searchTeachers},
	{"staff", "staff.read", searchStaff},
	{"guardian", "student.read", searchGuardians},
}

// ---- Service ---------------------------------------------------------------------

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

// Search fans out across the entities the caller may read and returns grouped hits.
//
//   - perms decides WHICH entities run: an entry is included iff perms.Has(perm).
//   - types (optional) further narrows to the requested set; it can never widen,
//     because each requested type is still gated by perms.Has below.
//
// All included queries run sequentially on ONE tenant-scoped tx (a pgx.Tx is not
// concurrency-safe; each query is indexed + LIMIT-bounded, so this is cheap).
func (s *Service) Search(ctx context.Context, tenantID uuid.UUID, perms authz.PermSet, types []string, q string, limit int) (Response, error) {
	out := Response{Query: q, Groups: map[string][]Hit{}}

	q = strings.TrimSpace(q)
	if len([]rune(q)) < minQueryLen {
		return out, nil
	}
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	want := typeFilter(types)

	included := make([]entitySearcher, 0, len(entities))
	for _, e := range entities {
		if !perms.Has(e.perm) {
			continue // permission gate — the security boundary
		}
		if want != nil && !want[e.typ] {
			continue // client narrowing (only narrows; perm already enforced)
		}
		included = append(included, e)
	}
	if len(included) == 0 {
		return out, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return out, fmt.Errorf("set tenant: %w", err)
	}

	total := 0
	for _, e := range included {
		if total >= globalCap {
			break
		}
		hits, err := e.run(ctx, tx, q, limit)
		if err != nil {
			return out, fmt.Errorf("search %s: %w", e.typ, err)
		}
		for i := range hits {
			hits[i].Score = score(q, hits[i].Label, hits[i].Sublabel)
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
//
// Each is a thin, read-only SELECT joining profile → memberships → users (the same
// join the owning slice's List uses). "Name" is ILIKE on users.login_identifier
// because people have no stored name column (NameFromHandle recovers the label).

func searchStudents(ctx context.Context, tx pgx.Tx, q string, limit int) ([]Hit, error) {
	rows, err := tx.Query(ctx,
		`SELECT s.id, u.login_identifier, s.admission_no
		   FROM student s
		   JOIN memberships m ON m.id = s.membership_id
		   JOIN users u       ON u.id = m.user_id
		  WHERE s.deleted_at IS NULL
		    AND (u.login_identifier ILIKE '%'||$1||'%' OR s.admission_no ILIKE '%'||$1||'%')
		  ORDER BY s.created_at DESC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Hit
	for rows.Next() {
		var id uuid.UUID
		var login, admissionNo string
		if err := rows.Scan(&id, &login, &admissionNo); err != nil {
			return nil, err
		}
		out = append(out, Hit{
			Type: "student", ID: id.String(),
			Label: onboarding.NameFromHandle(login), Sublabel: admissionNo,
			URL: "/students/" + id.String(),
		})
	}
	return out, rows.Err()
}

func searchTeachers(ctx context.Context, tx pgx.Tx, q string, limit int) ([]Hit, error) {
	rows, err := tx.Query(ctx,
		`SELECT t.id, u.login_identifier, COALESCE(t.employee_code,'')
		   FROM teacher t
		   JOIN memberships m ON m.id = t.membership_id
		   JOIN users u       ON u.id = m.user_id
		  WHERE t.deleted_at IS NULL
		    AND (u.login_identifier ILIKE '%'||$1||'%' OR t.employee_code ILIKE '%'||$1||'%')
		  ORDER BY t.created_at DESC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Hit
	for rows.Next() {
		var id uuid.UUID
		var login, code string
		if err := rows.Scan(&id, &login, &code); err != nil {
			return nil, err
		}
		out = append(out, Hit{
			Type: "teacher", ID: id.String(),
			Label: onboarding.NameFromHandle(login), Sublabel: code,
			URL: "/teachers/" + id.String(),
		})
	}
	return out, rows.Err()
}

func searchStaff(ctx context.Context, tx pgx.Tx, q string, limit int) ([]Hit, error) {
	rows, err := tx.Query(ctx,
		`SELECT e.id, u.login_identifier, COALESCE(e.department,''), COALESCE(e.designation,'')
		   FROM employee e
		   JOIN memberships m ON m.id = e.membership_id
		   JOIN users u       ON u.id = m.user_id
		  WHERE e.deleted_at IS NULL
		    AND (u.login_identifier ILIKE '%'||$1||'%'
		         OR e.department ILIKE '%'||$1||'%'
		         OR e.designation ILIKE '%'||$1||'%')
		  ORDER BY e.created_at DESC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Hit
	for rows.Next() {
		var id uuid.UUID
		var login, dept, desig string
		if err := rows.Scan(&id, &login, &dept, &desig); err != nil {
			return nil, err
		}
		sub := strings.TrimSpace(strings.Join(nonEmpty(desig, dept), " · "))
		out = append(out, Hit{
			Type: "staff", ID: id.String(),
			Label: onboarding.NameFromHandle(login), Sublabel: sub,
			URL: "/staff/" + id.String(),
		})
	}
	return out, rows.Err()
}

func searchGuardians(ctx context.Context, tx pgx.Tx, q string, limit int) ([]Hit, error) {
	rows, err := tx.Query(ctx,
		`SELECT g.id, g.name, COALESCE(g.phone,'')
		   FROM guardian g
		  WHERE g.deleted_at IS NULL
		    AND (g.name ILIKE '%'||$1||'%' OR g.phone ILIKE '%'||$1||'%')
		  ORDER BY g.name ASC
		  LIMIT $2`, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Hit
	for rows.Next() {
		var id uuid.UUID
		var name, phone string
		if err := rows.Scan(&id, &name, &phone); err != nil {
			return nil, err
		}
		out = append(out, Hit{
			Type: "guardian", ID: id.String(),
			Label: name, Sublabel: phone,
			URL: "/students/guardians/" + id.String(),
		})
	}
	return out, rows.Err()
}

// ---- Helpers ---------------------------------------------------------------------

// typeFilter turns the comma-separated `types` query param into a set, or nil if
// the caller did not narrow (nil => all permitted entities).
func typeFilter(types []string) map[string]bool {
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

func nonEmpty(vals ...string) []string {
	out := make([]string, 0, len(vals))
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			out = append(out, v)
		}
	}
	return out
}

// score is a cheap, stable relevance heuristic computed in Go (no DB-side ranking):
// an exact code/sublabel match ranks above a prefix match above a substring match.
func score(q, label, sublabel string) float64 {
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

// Register mounts GET /api/v1/search on the auth + tenant-scoped group. There is no
// top-level authz.Require: no single permission covers cross-entity search, so the
// handler resolves the caller's full PermSet and the service gates each entity.
func Register(r chi.Router, pool *pgxpool.Pool, _ uuid.UUID, res *authz.Resolver) {
	svc := NewService(pool)

	r.Get("/api/v1/search", func(w http.ResponseWriter, req *http.Request) {
		perms, err := authz.PermissionsFrom(req, res)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not resolve permissions")
			return
		}
		qv := req.URL.Query()
		types := splitCSV(qv.Get("types"))
		limit := parseLimit(qv.Get("limit"))
		out, err := svc.Search(req.Context(), httpx.TenantID(req.Context()), perms, types, qv.Get("q"), limit)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, out)
	})
}

func splitCSV(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return strings.Split(s, ",")
}

func parseLimit(s string) int {
	if s == "" {
		return defaultLimit
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return defaultLimit
	}
	return n
}
