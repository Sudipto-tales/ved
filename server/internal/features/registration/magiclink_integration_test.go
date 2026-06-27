//go:build integration

// Integration test for M11 Slice C — magic login link (docs/promts.md "Magic Login
// Link"). Proves provisioning mints a one-time token, that /activate (identity.Activate)
// logs the admin in, and that the link is genuinely single-use.
//
// Run: ./ved.sh test ./internal/features/registration/...
package registration

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/identity"
	"github.com/weloin/ved/internal/platform/auth"
)

func TestMagicLinkActivation(t *testing.T) {
	svc, _, _, a := v2Fixture(t) // approves a tenant → mints a magic token
	ctx := context.Background()

	require.NotEmpty(t, a.MagicToken, "approval returns a one-time activation token")

	idSvc := identity.NewService(identity.NewRepo(svc.pool, svc.nodeID), auth.NewManager("test-node-secret"))

	// The link logs the admin in: tokens issued, scoped to the tenant, forced to reset.
	res, err := idSvc.Activate(ctx, a.MagicToken)
	require.NoError(t, err)
	assert.NotEmpty(t, res.AccessToken)
	assert.NotEmpty(t, res.RefreshToken)
	assert.True(t, res.MustReset, "provisioned admin is still forced to set a password")
	require.Len(t, res.Memberships, 1)
	assert.Equal(t, a.TenantID, res.Memberships[0].TenantID)

	// The token is consumed — a re-used link is rejected (single-use).
	_, err = idSvc.Activate(ctx, a.MagicToken)
	assert.ErrorIs(t, err, identity.ErrInvalidCredentials, "magic link is single-use")

	// A bogus token is rejected too.
	_, err = idSvc.Activate(ctx, "not-a-real-token-"+uuid.NewString())
	assert.ErrorIs(t, err, identity.ErrInvalidCredentials)
}
