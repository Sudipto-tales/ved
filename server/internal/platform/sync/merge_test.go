package sync

import (
	"testing"

	"github.com/google/uuid"
	"github.com/weloin/ved/internal/platform/hlc"
)

// stamp builds a canonical HLC string at a given physical/counter for ordering tests.
func stamp(phys int64, ctr uint32) string {
	return hlc.Timestamp{Physical: phys, Counter: ctr, Node: uuid.Nil}.String()
}

func TestResolve(t *testing.T) {
	older := stamp(100, 0)
	newer := stamp(200, 0)

	cases := []struct {
		name       string
		found      bool
		stored, in string
		op         string
		want       Action
	}{
		{"absent create", false, "", newer, "CREATE", ActionInsert},
		{"absent update", false, "", newer, "UPDATE", ActionInsert},
		{"absent delete is noop", false, "", newer, "DELETE", ActionSkip},
		{"newer update wins", true, older, newer, "UPDATE", ActionUpdate},
		{"newer delete tombstones", true, older, newer, "DELETE", ActionTombstone},
		{"older update loses", true, newer, older, "UPDATE", ActionSkip},
		{"older delete loses (no resurrection of delete)", true, newer, older, "DELETE", ActionSkip},
		{"equal hlc is idempotent skip", true, newer, newer, "UPDATE", ActionSkip},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Resolve(c.found, c.stored, c.in, c.op); got != c.want {
				t.Fatalf("Resolve(%v,%q,%q,%q) = %s, want %s", c.found, c.stored, c.in, c.op, got, c.want)
			}
		})
	}
}

func TestRowSpecValidate(t *testing.T) {
	if err := (RowSpec{Table: "note", Columns: []string{"body"}}).validate(); err != nil {
		t.Fatalf("valid spec rejected: %v", err)
	}
	if err := (RowSpec{Table: "note; DROP TABLE note", Columns: []string{"body"}}).validate(); err == nil {
		t.Fatal("SQL-injection table identifier must be rejected")
	}
	if err := (RowSpec{Table: "note", Columns: []string{"body = 1"}}).validate(); err == nil {
		t.Fatal("unsafe column identifier must be rejected")
	}
}
