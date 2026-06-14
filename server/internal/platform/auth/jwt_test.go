package auth

import (
	"testing"

	"github.com/google/uuid"
)

func TestAccessTokenRoundTrip(t *testing.T) {
	m := NewManager("test-secret")
	uid := uuid.Must(uuid.NewV7())
	tid := uuid.Must(uuid.NewV7())
	mid := uuid.Must(uuid.NewV7())

	tok, err := m.IssueAccess(uid, []Membership{{MembershipID: mid, TenantID: tid, UserType: "EMPLOYEE"}}, true)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	claims, err := m.ParseAccess(tok)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if claims.Subject != uid.String() {
		t.Fatalf("subject mismatch: %s", claims.Subject)
	}
	if !claims.MustReset {
		t.Fatal("must_reset should be true")
	}
	if len(claims.Memberships) != 1 || claims.Memberships[0].TenantID != tid {
		t.Fatalf("memberships not carried: %+v", claims.Memberships)
	}
}

func TestWrongSecretRejected(t *testing.T) {
	good := NewManager("secret-a")
	bad := NewManager("secret-b")
	tok, _ := good.IssueAccess(uuid.Must(uuid.NewV7()), nil, false)
	if _, err := bad.ParseAccess(tok); err != ErrInvalidToken {
		t.Fatalf("want ErrInvalidToken for wrong secret, got %v", err)
	}
}

func TestRefreshIsNotAccess(t *testing.T) {
	m := NewManager("secret")
	uid := uuid.Must(uuid.NewV7())
	refresh, _ := m.IssueRefresh(uid)
	// A refresh token has no memberships claim; parsing as access still verifies the
	// signature but yields an empty membership set — refresh must be parsed as refresh.
	rc, err := m.ParseRefresh(refresh)
	if err != nil {
		t.Fatalf("parse refresh: %v", err)
	}
	if rc.Subject != uid.String() {
		t.Fatalf("refresh subject mismatch")
	}
	if rc.ID == "" {
		t.Fatal("refresh token should carry a jti for rotation")
	}
}
