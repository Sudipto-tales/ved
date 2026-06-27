package registration

import "testing"

// The reserved blocklist must reject routing-namespace names, and those names must still
// be valid by format (so the blocklist is the only thing stopping them) — otherwise the
// guard is dead code. Mirrors web/src/shared/tenant/reserved.ts.
func TestReservedSlugs(t *testing.T) {
	for _, s := range []string{"platform", "www", "api", "admin", "app", "ved", "control-plane"} {
		if !reservedSlugs[s] {
			t.Errorf("expected %q to be reserved", s)
		}
		if !slugRe.MatchString(s) {
			t.Errorf("reserved slug %q should still pass the format regex", s)
		}
	}
	for _, s := range []string{"lincoln", "maple", "sunrise-public", "school1"} {
		if reservedSlugs[s] {
			t.Errorf("did not expect %q to be reserved", s)
		}
	}
}
