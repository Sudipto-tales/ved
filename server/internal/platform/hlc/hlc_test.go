package hlc

import (
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestClockMonotonic_StalledWallClock(t *testing.T) {
	// Freeze the wall clock; the counter must still make every reading strictly increasing.
	frozen := time.Unix(1_700_000_000, 0)
	c := New(uuid.New())
	c.now = func() time.Time { return frozen }

	prev := c.Now()
	for i := 0; i < 1000; i++ {
		cur := c.Now()
		if !prev.Before(cur) {
			t.Fatalf("not strictly increasing at %d: %s !< %s", i, prev, cur)
		}
		prev = cur
	}
}

func TestClockMonotonic_BackwardsWallClock(t *testing.T) {
	c := New(uuid.New())
	now := time.Unix(1_700_000_000, 0)
	c.now = func() time.Time { return now }
	a := c.Now()
	now = now.Add(-time.Hour) // clock jumps backwards
	b := c.Now()
	if !a.Before(b) {
		t.Fatalf("backwards wall clock broke monotonicity: %s !< %s", a, b)
	}
}

func TestUpdateHappensAfterRemote(t *testing.T) {
	c := New(uuid.New())
	now := time.Unix(1_700_000_000, 0)
	c.now = func() time.Time { return now }
	// Remote is far ahead of our wall clock.
	remote := Timestamp{Physical: c.physMillis() + 60_000, Counter: 5, Node: uuid.New()}
	got := c.Update(remote)
	if !remote.Before(got) {
		t.Fatalf("Update result must happen-after remote: %s !< %s", remote, got)
	}
	// And a subsequent local Now stays ahead of the merged stamp.
	if !got.Before(c.Now()) {
		t.Fatal("Now after Update must keep increasing")
	}
}

func TestStringIsLexicographicallySortable(t *testing.T) {
	node := uuid.New()
	tss := []Timestamp{
		{Physical: 100, Counter: 2, Node: node},
		{Physical: 100, Counter: 0, Node: node},
		{Physical: 99, Counter: 50, Node: node},
		{Physical: 101, Counter: 0, Node: node},
	}
	strs := make([]string, len(tss))
	for i, ts := range tss {
		strs[i] = ts.String()
	}
	sort.Strings(strs)
	// After a plain string sort the logical order must be ascending.
	for i := 1; i < len(strs); i++ {
		if Compare(strs[i-1], strs[i]) > 0 {
			t.Fatalf("lexicographic sort disagrees with logical order: %s vs %s", strs[i-1], strs[i])
		}
	}
}

func TestCompareLegacyVsNew(t *testing.T) {
	// Legacy: bare UnixNano. New: physical is in ms. A new stamp at a strictly later time
	// must compare greater than an older legacy stamp, and vice-versa.
	legacyOld := "1700000000000000000" // ns  → 1_700_000_000_000 ms
	newLater := Timestamp{Physical: 1_700_000_000_001, Counter: 0, Node: uuid.New()}.String()
	newEarlier := Timestamp{Physical: 1_699_999_999_999, Counter: 0, Node: uuid.New()}.String()

	if Compare(legacyOld, newLater) >= 0 {
		t.Fatal("legacy stamp should precede a strictly-later new stamp")
	}
	if Compare(legacyOld, newEarlier) <= 0 {
		t.Fatal("legacy stamp should follow a strictly-earlier new stamp")
	}
}

func TestCompareUnparseableSortsLast(t *testing.T) {
	good := Timestamp{Physical: 100, Counter: 0, Node: uuid.New()}.String()
	if Compare("garbage", good) <= 0 {
		t.Fatal("unparseable token must sort after a valid one (never silently win LWW)")
	}
	if Compare(good, "garbage") >= 0 {
		t.Fatal("valid token must sort before an unparseable one")
	}
}

func TestParseRoundTrip(t *testing.T) {
	ts := Timestamp{Physical: 1_700_000_000_123, Counter: 42, Node: uuid.New()}
	got, err := Parse(ts.String())
	if err != nil {
		t.Fatal(err)
	}
	if got.cmp(ts) != 0 {
		t.Fatalf("round trip mismatch: %s vs %s", got, ts)
	}
}
