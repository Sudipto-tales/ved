// Offline license-grace state machine (docs/01-overview.md, docs/08-offline-sync.md
// "Identity & license"). A node validates its license OFFLINE: each successful cloud contact
// pushes a fresh license (a later ExpiresAt) down the cloud→node sync path; while offline
// the node simply counts down against the last valid license. The grace window keeps a
// school fully operational for GraceDays past expiry (only nagging), then locks — so a
// transient outage never bricks a school, but an indefinitely-disconnected/revoked node
// eventually stops.
package license

import "time"

// State is the node's license posture, derived purely from the claims + the wall clock.
type State string

const (
	// StateActive — within the paid term; no UI nag, full function.
	StateActive State = "ACTIVE"
	// StateGrace — past expiry but inside the grace window; fully operational, but the UI
	// nags to reconnect/renew. The node is presumably offline or the subscription lapsed.
	StateGrace State = "GRACE"
	// StateLocked — past expiry + grace; mutations are blocked (read-only) until a fresh
	// license arrives. This is the offline-grace LOCK.
	StateLocked State = "LOCKED"
)

// Evaluation is the full result of assessing a license at a point in time.
type Evaluation struct {
	State       State
	ExpiresAt   time.Time
	GraceEndsAt time.Time
	// Remaining is time left in the CURRENT phase: until ExpiresAt when ACTIVE, until
	// GraceEndsAt when in GRACE, and 0 when LOCKED. Never negative.
	Remaining time.Duration
}

// Locked reports whether mutations should be blocked.
func (e Evaluation) Locked() bool { return e.State == StateLocked }

// Evaluate derives the license state at `now`. Grace is GraceDays after ExpiresAt; a
// non-positive GraceDays means "lock immediately at expiry" (no grace).
func Evaluate(c Claims, now time.Time) Evaluation {
	graceEnds := c.ExpiresAt.AddDate(0, 0, c.GraceDays)
	switch {
	case !now.After(c.ExpiresAt):
		return Evaluation{State: StateActive, ExpiresAt: c.ExpiresAt, GraceEndsAt: graceEnds, Remaining: c.ExpiresAt.Sub(now)}
	case !now.After(graceEnds):
		return Evaluation{State: StateGrace, ExpiresAt: c.ExpiresAt, GraceEndsAt: graceEnds, Remaining: graceEnds.Sub(now)}
	default:
		return Evaluation{State: StateLocked, ExpiresAt: c.ExpiresAt, GraceEndsAt: graceEnds, Remaining: 0}
	}
}
