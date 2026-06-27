//go:build integration

// Integration tests for the identity slice (M1, the auth bridge). users is GLOBAL (no
// RLS), so the invariant here is credential correctness, proven end-to-end: an onboarded
// user can log in with the generated temp credential (and is forced to reset), and a wrong
// password is rejected.
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/identity/...)
package identity

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/students"
	"github.com/weloin/ved/internal/platform/auth"
	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

func TestLoginWithGeneratedCredential(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	tenant := testdb.NewTenant(t, pool, nodeID)

	// Onboard a student → generated login handle + one-time temp password.
	studentSvc := students.NewService(students.NewRepo(pool, nodeID), onboarding.NewEngine(pool, nodeID))
	sres, err := studentSvc.Onboard(context.Background(), tenant.ID, tenant.Actor, students.OnboardInput{
		Name: "Logan Login", AdmissionNo: "ADM-ID-001",
	})
	require.NoError(t, err)

	svc := NewService(NewRepo(pool, nodeID), auth.NewManager("test-secret"))

	// Correct credential → tokens, forced reset, and the membership in this tenant.
	res, err := svc.Login(context.Background(), sres.LoginIdentifier, sres.TempPassword)
	require.NoError(t, err, "login with the generated temp credential should succeed")
	assert.NotEmpty(t, res.AccessToken, "access token issued")
	assert.NotEmpty(t, res.RefreshToken, "refresh token issued")
	assert.True(t, res.MustReset, "a freshly onboarded user must reset on first login")
	found := false
	for _, m := range res.Memberships {
		if m.TenantID == tenant.ID {
			found = true
		}
	}
	assert.True(t, found, "login surfaces the user's membership in this tenant")

	// Wrong password → invalid credentials.
	_, err = svc.Login(context.Background(), sres.LoginIdentifier, "definitely-wrong")
	assert.True(t, errors.Is(err, ErrInvalidCredentials), "wrong password is rejected")
}
