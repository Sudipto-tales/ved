package authz

import "testing"

func TestPermSetHas(t *testing.T) {
	s := PermSet{"student.read": {}, "student.onboard": {}}
	if !s.Has("student.read") {
		t.Fatal("expected granted permission to be present")
	}
	if s.Has("fee.manage") {
		t.Fatal("did not expect an ungranted permission")
	}
}

func TestTenantAdminShortCircuits(t *testing.T) {
	s := PermSet{TenantAdmin: {}}
	for _, p := range Catalog {
		if !s.Has(p.Key) {
			t.Fatalf("tenant.admin must grant every tenant-plane permission, missing %q", p.Key)
		}
	}
	// Keys() expands tenant.admin to the full catalog.
	if len(s.Keys()) != len(Catalog) {
		t.Fatalf("expected Keys() to expand to full catalog (%d), got %d", len(Catalog), len(s.Keys()))
	}
}

func TestEmptySetGrantsNothing(t *testing.T) {
	s := PermSet{}
	if s.Has("student.read") {
		t.Fatal("empty set should grant nothing")
	}
	if len(s.Keys()) != 0 {
		t.Fatal("empty set should yield no keys")
	}
}

func TestCatalogContainsTenantAdmin(t *testing.T) {
	found := false
	for _, p := range Catalog {
		if p.Key == TenantAdmin {
			found = true
		}
	}
	if !found {
		t.Fatal("catalog must contain tenant.admin")
	}
}
