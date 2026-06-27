package license

import (
	"sync"
	"time"
)

// Guard holds the node's current verified license claims and answers the offline-grace
// question "may this node still mutate?". The control plane pushes a fresh license down the
// cloud→node sync path on every contact; the node calls Set to install it, and Evaluate to
// check posture (cheaply, on each request) against the wall clock. Concurrency-safe.
//
// Before any license is installed the Guard is in a configurable bootstrap state — a fresh
// node provisioned offline should default to ACTIVE for a short window, not LOCKED.
type Guard struct {
	mu     sync.RWMutex
	claims *Claims
	now    func() time.Time // injectable for tests
}

// NewGuard builds an empty Guard (no license yet).
func NewGuard() *Guard { return &Guard{now: time.Now} }

// Set installs newly verified claims as the node's current license. A later ExpiresAt
// extends the term; the caller is responsible for having Verify'd the signature first.
func (g *Guard) Set(c Claims) {
	g.mu.Lock()
	defer g.mu.Unlock()
	cc := c
	g.claims = &cc
}

// Evaluate returns the current license evaluation. With no license installed it reports
// LOCKED with a zero expiry, so an un-provisioned node is fenced until a license arrives.
func (g *Guard) Evaluate() Evaluation {
	g.mu.RLock()
	defer g.mu.RUnlock()
	if g.claims == nil {
		return Evaluation{State: StateLocked}
	}
	return Evaluate(*g.claims, g.now())
}

// Locked is the hot-path check a mutation gate calls.
func (g *Guard) Locked() bool { return g.Evaluate().Locked() }
