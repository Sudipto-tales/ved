// Package platform is the control-plane identity + RBAC slice. It is a SEPARATE
// namespace from the tenant plane: platform superadmins span tenants but hold no tenant
// business permissions, and a tenant role grants nothing here (docs/05-rbac.md, docs/02).
//
// It owns platform-admin login (→ a platform-scoped JWT), the platform permission
// catalog, and the `RequirePermission` gate the control-plane handlers sit behind. Kept
// deliberately small for M4: the seeded superadmin holds every platform permission.
package platform

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/crypto"
	"github.com/weloin/ved/internal/platform/httpx"
)

// Platform permission catalog — the closed set the control-plane handlers check. Mirrors
// the platform FE manifest (web/platform/src/routes.tsx). SEPARATE namespace, prefix
// `platform.`; never merged with the tenant catalog.
const (
	PermRegistrationReview = "platform.registration.review"
	PermPaymentReview      = "platform.payment.review"
	PermTenantManage       = "platform.tenant.manage"
	PermSubscriptionManage = "platform.subscription.manage"
	PermLicenseManage      = "platform.license.manage"
	PermAnalyticsView      = "platform.analytics.view"
	PermSupportManage      = "platform.support.manage"
)

const issuer = "ved-platform"
const scope = "platform"

var ErrInvalidCredentials = errors.New("invalid credentials")

// Identity is the authenticated platform admin resolved from the token.
type Identity struct {
	AdminID    uuid.UUID
	SuperAdmin bool
}

type ctxKey int

const identityKey ctxKey = iota

// ---- JWT (platform-scoped; distinct issuer from the tenant token) ----------------

type claims struct {
	Scope      string `json:"scope"`
	SuperAdmin bool   `json:"superadmin"`
	jwt.RegisteredClaims
}

// TokenManager mints/verifies platform tokens with one HMAC secret.
type TokenManager struct {
	secret []byte
	ttl    time.Duration
}

func NewTokenManager(secret string) *TokenManager {
	return &TokenManager{secret: []byte(secret), ttl: 8 * time.Hour}
}

func (m *TokenManager) issue(adminID uuid.UUID, super bool) (string, error) {
	now := time.Now()
	c := claims{
		Scope:      scope,
		SuperAdmin: super,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   adminID.String(),
			Issuer:    issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(m.secret)
}

func (m *TokenManager) parse(token string) (*claims, error) {
	c := &claims{}
	parsed, err := jwt.ParseWithClaims(token, c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	}, jwt.WithIssuer(issuer))
	if err != nil || !parsed.Valid || c.Scope != scope {
		return nil, ErrInvalidCredentials
	}
	return c, nil
}

// ---- Repository / Service --------------------------------------------------------

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(pool *pgxpool.Pool) *Repo { return &Repo{pool: pool} }

type Service struct {
	repo *Repo
	tm   *TokenManager
}

func NewService(repo *Repo, tm *TokenManager) *Service { return &Service{repo: repo, tm: tm} }

// Login verifies a platform admin's credentials and mints a platform token.
func (s *Service) Login(ctx context.Context, email, password string) (string, error) {
	var id uuid.UUID
	var hash string
	var super bool
	var status string
	err := s.repo.pool.QueryRow(ctx,
		`SELECT id, password_hash, is_superadmin, status
		   FROM control_plane.platform_admin WHERE lower(email) = lower($1)`, email).
		Scan(&id, &hash, &super, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidCredentials
	}
	if err != nil {
		return "", err
	}
	if status != "ACTIVE" || crypto.VerifyPassword(password, hash) != nil {
		return "", ErrInvalidCredentials
	}
	return s.tm.issue(id, super)
}

// ---- Middleware ------------------------------------------------------------------

// Authenticator requires a valid platform token and stores the Identity on the context.
func Authenticator(tm *TokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearer(r)
			if raw == "" {
				httpx.Error(w, http.StatusUnauthorized, "missing platform token")
				return
			}
			c, err := tm.parse(raw)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "invalid or expired platform token")
				return
			}
			id, _ := uuid.Parse(c.Subject)
			ctx := context.WithValue(r.Context(), identityKey, Identity{AdminID: id, SuperAdmin: c.SuperAdmin})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequirePermission gates a handler on a platform permission. For M4 a superadmin holds
// every platform permission; non-superadmin granular roles are a later refinement.
func RequirePermission(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := IdentityFrom(r.Context())
			if !ok {
				httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
				return
			}
			if !id.SuperAdmin {
				httpx.Error(w, http.StatusForbidden, "missing platform permission: "+perm)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// IdentityFrom returns the authenticated platform identity from the context.
func IdentityFrom(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(identityKey).(Identity)
	return id, ok
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const p = "Bearer "
	if len(h) > len(p) && strings.EqualFold(h[:len(p)], p) {
		return strings.TrimSpace(h[len(p):])
	}
	return ""
}

// ---- HTTP ------------------------------------------------------------------------

// RegisterPublic mounts the unauthenticated platform login endpoint.
func RegisterPublic(r chi.Router, svc *Service) {
	r.Post("/api/v1/platform/login", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.Email == "" || in.Password == "" {
			httpx.Error(w, http.StatusBadRequest, "email and password are required")
			return
		}
		token, err := svc.Login(req.Context(), in.Email, in.Password)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"access_token": token, "scope": scope})
	})
}
