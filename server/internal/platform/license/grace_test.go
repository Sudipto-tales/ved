package license

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func claims(expires time.Time, graceDays int) Claims {
	return Claims{TenantID: uuid.New(), ExpiresAt: expires, GraceDays: graceDays}
}

func TestEvaluate_Phases(t *testing.T) {
	exp := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	c := claims(exp, 7) // 7-day grace → locks 2026-06-08

	cases := []struct {
		name string
		now  time.Time
		want State
	}{
		{"well before expiry", exp.Add(-30 * 24 * time.Hour), StateActive},
		{"exactly at expiry is still active", exp, StateActive},
		{"one second past expiry → grace", exp.Add(time.Second), StateGrace},
		{"mid grace", exp.AddDate(0, 0, 3), StateGrace},
		{"exactly at grace end is still grace", exp.AddDate(0, 0, 7), StateGrace},
		{"one second past grace → locked", exp.AddDate(0, 0, 7).Add(time.Second), StateLocked},
		{"long past → locked", exp.AddDate(1, 0, 0), StateLocked},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Evaluate(c, tc.now).State; got != tc.want {
				t.Fatalf("Evaluate@%s = %s, want %s", tc.now, got, tc.want)
			}
		})
	}
}

func TestEvaluate_ZeroGraceLocksAtExpiry(t *testing.T) {
	exp := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	c := claims(exp, 0)
	if got := Evaluate(c, exp).State; got != StateActive {
		t.Fatalf("at expiry want ACTIVE, got %s", got)
	}
	if got := Evaluate(c, exp.Add(time.Second)).State; got != StateLocked {
		t.Fatalf("one second past expiry with zero grace want LOCKED, got %s", got)
	}
}

func TestEvaluate_RemainingNeverNegative(t *testing.T) {
	exp := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	e := Evaluate(claims(exp, 7), exp.AddDate(1, 0, 0))
	if e.Remaining < 0 {
		t.Fatalf("Remaining must be >= 0, got %s", e.Remaining)
	}
	if !e.Locked() {
		t.Fatal("expected Locked() true")
	}
}

func TestGuard_BootstrapAndSet(t *testing.T) {
	g := NewGuard()
	// No license installed → fenced.
	if !g.Locked() {
		t.Fatal("empty guard must be LOCKED")
	}
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	g.now = func() time.Time { return now }

	g.Set(claims(now.AddDate(0, 1, 0), 7)) // expires in a month
	if g.Locked() {
		t.Fatal("guard with a valid future license must not be locked")
	}
	if got := g.Evaluate().State; got != StateActive {
		t.Fatalf("want ACTIVE, got %s", got)
	}

	// Install an already-expired-past-grace license → locked.
	g.Set(claims(now.AddDate(0, 0, -30), 7))
	if !g.Locked() {
		t.Fatal("expired-past-grace license must lock")
	}
}
