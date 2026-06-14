// Package auth is the JWT kernel (docs/plan/bridges.md §2 — the auth bridge). It
// mints and verifies the two tokens the system uses:
//
//   - access  — short-lived, carries identity + the user's memberships + the
//     must_reset_password flag. The auth middleware verifies it on every request.
//   - refresh — long-lived, carries only the subject; rotates the access token.
//
// The token shape IS the contract: slices never parse JWTs themselves, they read
// what the middleware resolved. Change claims here, not in handlers.
package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Membership is the minimal membership descriptor carried in the access token.
type Membership struct {
	MembershipID uuid.UUID `json:"mid"`
	TenantID     uuid.UUID `json:"tid"`
	UserType     string    `json:"typ"`
}

// AccessClaims is the access-token body.
type AccessClaims struct {
	Memberships []Membership `json:"memberships"`
	MustReset   bool         `json:"must_reset"`
	jwt.RegisteredClaims
}

// RefreshClaims is the refresh-token body.
type RefreshClaims struct {
	jwt.RegisteredClaims
}

// ErrInvalidToken is returned for any malformed, expired, or wrong-kind token.
var ErrInvalidToken = errors.New("invalid token")

// Manager issues and verifies tokens with one HMAC secret.
type Manager struct {
	secret     []byte
	issuer     string
	accessTTL  time.Duration
	refreshTTL time.Duration
	now        func() time.Time
}

// NewManager builds a Manager. A short access TTL and a long refresh TTL are the
// default posture; the offline node tolerates clock skew via NotBefore leeway.
func NewManager(secret string) *Manager {
	return &Manager{
		secret:     []byte(secret),
		issuer:     "ved-node",
		accessTTL:  15 * time.Minute,
		refreshTTL: 720 * time.Hour, // 30 days
		now:        time.Now,
	}
}

// IssueAccess mints an access token for the user with their memberships.
func (m *Manager) IssueAccess(userID uuid.UUID, memberships []Membership, mustReset bool) (string, error) {
	now := m.now()
	claims := AccessClaims{
		Memberships: memberships,
		MustReset:   mustReset,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			Issuer:    m.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

// IssueRefresh mints a long-lived refresh token (subject only).
func (m *Manager) IssueRefresh(userID uuid.UUID) (string, error) {
	now := m.now()
	claims := RefreshClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			Issuer:    m.issuer,
			ID:        uuid.Must(uuid.NewV7()).String(), // jti for rotation tracking
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.refreshTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

// ParseAccess verifies and returns the access claims.
func (m *Manager) ParseAccess(token string) (*AccessClaims, error) {
	claims := &AccessClaims{}
	if err := m.parse(token, claims); err != nil {
		return nil, err
	}
	return claims, nil
}

// ParseRefresh verifies and returns the refresh claims.
func (m *Manager) ParseRefresh(token string) (*RefreshClaims, error) {
	claims := &RefreshClaims{}
	if err := m.parse(token, claims); err != nil {
		return nil, err
	}
	return claims, nil
}

func (m *Manager) parse(token string, claims jwt.Claims) error {
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("%w: unexpected signing method", ErrInvalidToken)
		}
		return m.secret, nil
	}, jwt.WithIssuer(m.issuer), jwt.WithLeeway(30*time.Second))
	if err != nil || !parsed.Valid {
		return ErrInvalidToken
	}
	return nil
}
