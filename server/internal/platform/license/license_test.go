package license

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSignVerifyRoundtrip(t *testing.T) {
	s := NewSigner("platform-signing-key")
	in := Claims{
		TenantID:       uuid.Must(uuid.NewV7()),
		SubscriptionID: uuid.Must(uuid.NewV7()),
		Plan:           "Standard",
		Seats:          500,
		EnabledModules: []string{"academics", "finance"},
		IssuedAt:       time.Unix(1700000000, 0).UTC(),
		ExpiresAt:      time.Unix(1800000000, 0).UTC(),
		GraceDays:      14,
	}
	token, sig, err := s.Sign(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := s.Verify(token, sig)
	if err != nil {
		t.Fatal(err)
	}
	if out.TenantID != in.TenantID || out.Plan != in.Plan || out.Seats != in.Seats {
		t.Fatalf("roundtrip mismatch: %+v", out)
	}
}

func TestVerifyRejectsTamper(t *testing.T) {
	s := NewSigner("k")
	token, sig, _ := s.Sign(Claims{Plan: "A", Seats: 1})
	if _, err := s.Verify(token, sig+"x"); err == nil {
		t.Fatal("expected signature mismatch")
	}
	// A different key must not verify.
	if _, err := NewSigner("other").Verify(token, sig); err == nil {
		t.Fatal("expected verification to fail under a different key")
	}
}
