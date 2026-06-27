// Package hlc implements a Hybrid Logical Clock (docs/08-offline-sync.md pillar 5). An HLC
// orders events consistently across machines WITHOUT synchronized wall clocks: it pairs a
// physical millisecond timestamp with a logical counter that breaks ties and absorbs clock
// skew. On send we stamp Now(); on receive we Update() against the remote stamp so causal
// order is preserved even if the remote clock ran ahead. The canonical string encoding is
// zero-padded so plain lexicographic comparison agrees with logical order — which is what
// the relay's ORDER BY and the LWW merge rely on.
//
// Migration note: M1–M5 rows were stamped with the placeholder NowHLC (a bare
// time.Now().UnixNano() decimal string, no counter). Compare() recognises that legacy form
// and orders it correctly against the new "physical:counter:node" form, so mixed data
// compares sanely during/after the cutover.
package hlc

import (
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Timestamp is a single HLC reading. Physical is wall-clock milliseconds; Counter is the
// logical tiebreaker; Node is the originating node (final tiebreaker for total order).
type Timestamp struct {
	Physical int64
	Counter  uint32
	Node     uuid.UUID
}

// String encodes the timestamp lexicographically-sortable: 15-digit zero-padded physical
// (room past year 5000 in ms), 10-digit counter, then the node UUID. Two tokens compare by
// raw string the same way they compare logically.
func (t Timestamp) String() string {
	return fmt.Sprintf("%015d:%010d:%s", t.Physical, t.Counter, t.Node)
}

// Before reports whether t precedes u in HLC order (physical, then counter, then node).
func (t Timestamp) Before(u Timestamp) bool { return t.cmp(u) < 0 }

func (t Timestamp) cmp(u Timestamp) int {
	switch {
	case t.Physical != u.Physical:
		if t.Physical < u.Physical {
			return -1
		}
		return 1
	case t.Counter != u.Counter:
		if t.Counter < u.Counter {
			return -1
		}
		return 1
	default:
		return strings.Compare(t.Node.String(), u.Node.String())
	}
}

// Parse decodes a canonical token. It also accepts the legacy bare-nanosecond form
// (all digits, no separator) produced before M6, mapping it to a physical-only stamp so it
// orders correctly against new tokens.
func Parse(s string) (Timestamp, error) {
	if s == "" {
		return Timestamp{}, fmt.Errorf("empty hlc")
	}
	if !strings.ContainsRune(s, ':') {
		// Legacy: time.Now().UnixNano() decimal. Convert ns → ms (counter 0).
		ns, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return Timestamp{}, fmt.Errorf("legacy hlc %q: %w", s, err)
		}
		return Timestamp{Physical: ns / int64(time.Millisecond)}, nil
	}
	parts := strings.SplitN(s, ":", 3)
	if len(parts) < 2 {
		return Timestamp{}, fmt.Errorf("malformed hlc %q", s)
	}
	phys, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return Timestamp{}, fmt.Errorf("hlc physical %q: %w", s, err)
	}
	ctr, err := strconv.ParseUint(parts[1], 10, 32)
	if err != nil {
		return Timestamp{}, fmt.Errorf("hlc counter %q: %w", s, err)
	}
	ts := Timestamp{Physical: phys, Counter: uint32(ctr)}
	if len(parts) == 3 {
		ts.Node, _ = uuid.Parse(parts[2]) // node is a tiebreaker; tolerate absence
	}
	return ts, nil
}

// Compare orders two HLC tokens: -1 if a<b, 0 if equal, +1 if a>b. Unparseable tokens sort
// last (treated as the maximum) so a corrupt stamp never silently "wins" a LWW merge by
// comparing as small. Tolerant of mixed legacy/new encodings.
func Compare(a, b string) int {
	ta, ea := Parse(a)
	tb, eb := Parse(b)
	switch {
	case ea != nil && eb != nil:
		return strings.Compare(a, b)
	case ea != nil:
		return 1
	case eb != nil:
		return -1
	default:
		return ta.cmp(tb)
	}
}

// Clock is a monotonic HLC source for one node. Concurrency-safe.
type Clock struct {
	mu       sync.Mutex
	node     uuid.UUID
	lastPhys int64
	counter  uint32
	now      func() time.Time // injectable for tests
}

// New builds a Clock for the given node.
func New(node uuid.UUID) *Clock { return &Clock{node: node, now: time.Now} }

func (c *Clock) physMillis() int64 { return c.now().UnixNano() / int64(time.Millisecond) }

// Now returns the next local timestamp, guaranteed strictly increasing per call even when
// the wall clock stalls or goes backwards (the counter advances instead).
func (c *Clock) Now() Timestamp {
	c.mu.Lock()
	defer c.mu.Unlock()
	phys := c.physMillis()
	if phys > c.lastPhys {
		c.lastPhys = phys
		c.counter = 0
	} else {
		c.counter++
	}
	return Timestamp{Physical: c.lastPhys, Counter: c.counter, Node: c.node}
}

// Update advances the clock on receipt of a remote timestamp so the returned stamp happens
// after both local and remote (the standard HLC receive rule). Use it when applying an
// inbound event before stamping any derived local write.
func (c *Clock) Update(remote Timestamp) Timestamp {
	c.mu.Lock()
	defer c.mu.Unlock()
	phys := c.physMillis()
	max := phys
	if c.lastPhys > max {
		max = c.lastPhys
	}
	if remote.Physical > max {
		max = remote.Physical
	}
	switch {
	case max == c.lastPhys && max == remote.Physical:
		if remote.Counter > c.counter {
			c.counter = remote.Counter
		}
		c.counter++
	case max == c.lastPhys:
		c.counter++
	case max == remote.Physical:
		c.counter = remote.Counter + 1
	default:
		c.counter = 0
	}
	c.lastPhys = max
	return Timestamp{Physical: c.lastPhys, Counter: c.counter, Node: c.node}
}

// --- process-global default clock (used by the convenience NowHLC) ---

var def = New(uuid.Nil)

// SetNode rebinds the global clock to this node id (call once at startup with the node id).
func SetNode(node uuid.UUID) { def = New(node) }

// Now returns the global clock's next stamp as a canonical string.
func Now() string { return def.Now().String() }
