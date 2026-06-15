// Package license signs and verifies the offline-validatable license token the control
// plane issues to a node (docs/database/01-control-plane.md "License", docs/01-overview.md).
//
// The token is a base64url(JSON) claims blob; the signature is an HMAC-SHA256 over that
// blob with the platform signing key. A node validates the signature and the expiry
// OFFLINE, honoring the last valid license through a grace window. (HMAC is the M4
// mechanism; an asymmetric key so nodes verify without holding the signing secret is a
// later hardening — the Sign/Verify seam stays the same.)
package license

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Claims is the signed license body the node enforces on.
type Claims struct {
	TenantID       uuid.UUID `json:"tenant_id"`
	SubscriptionID uuid.UUID `json:"subscription_id"`
	Plan           string    `json:"plan"`
	Seats          int       `json:"seats"`
	EnabledModules []string  `json:"enabled_modules"`
	IssuedAt       time.Time `json:"issued_at"`
	ExpiresAt      time.Time `json:"expires_at"`
	GraceDays      int       `json:"grace_days"`
}

// Signer issues and verifies license tokens with one HMAC key.
type Signer struct{ key []byte }

// NewSigner builds a Signer from the platform signing key.
func NewSigner(key string) *Signer { return &Signer{key: []byte(key)} }

// Sign serialises the claims to a base64url token and returns (token, signature).
func (s *Signer) Sign(c Claims) (token, signature string, err error) {
	raw, err := json.Marshal(c)
	if err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	signature = s.sign(token)
	return token, signature, nil
}

// Verify checks the signature and decodes the claims (used by the node, M6).
func (s *Signer) Verify(token, signature string) (Claims, error) {
	if !hmac.Equal([]byte(s.sign(token)), []byte(signature)) {
		return Claims{}, fmt.Errorf("invalid license signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return Claims{}, err
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return Claims{}, err
	}
	return c, nil
}

func (s *Signer) sign(token string) string {
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(token))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
