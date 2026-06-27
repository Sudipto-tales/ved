//go:build integration

// Integration test for M11 Slice B — "Login As Tenant" impersonation (docs/promts.md).
// Proves the consent gate, that the minted token is a valid node token carrying the
// impersonator + the tenant's admin membership, and that the action is audited.
//
// Run: ./ved.sh test ./internal/features/registration/...
package registration

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/access"
	"github.com/weloin/ved/internal/platform/auth"
)

func TestLoginAsTenantConsentAndToken(t *testing.T) {
	svc, _, adminID, a := v2Fixture(t) // approves one tenant (provisions a School Admin)
	ctx := context.Background()
	mgr := auth.NewManager("test-node-secret")

	// Without consent, impersonation is refused.
	_, err := svc.LoginAsTenant(ctx, mgr, adminID, a.TenantID)
	assert.ErrorIs(t, err, ErrConsentRequired, "no consent → refused")

	// The tenant grants super-admin access (tenant-owned flag, golden rule write).
	accessSvc := access.NewService(access.NewRepo(svc.pool, svc.nodeID))
	require.NoError(t, accessSvc.SetSuperadminAccess(ctx, a.TenantID, uuid.Must(uuid.NewV7()), true))
	allowed, err := accessSvc.GetSuperadminAccess(ctx, a.TenantID)
	require.NoError(t, err)
	require.True(t, allowed)

	// Now Login-As mints a token.
	res, err := svc.LoginAsTenant(ctx, mgr, adminID, a.TenantID)
	require.NoError(t, err)
	assert.NotEmpty(t, res.AccessToken)
	assert.Equal(t, a.Slug, res.Slug)
	assert.Equal(t, a.AdminLogin, res.Login, "impersonates the provisioned School Admin")

	// The token is a valid NODE access token: it parses with the node manager, carries the
	// impersonator id, and scopes exactly one membership to the target tenant.
	claims, err := mgr.ParseAccess(res.AccessToken)
	require.NoError(t, err, "minted token verifies as a node token")
	assert.Equal(t, adminID.String(), claims.Impersonator, "stamped with the impersonating admin")
	assert.False(t, claims.MustReset, "support is not bounced into a password reset")
	require.Len(t, claims.Memberships, 1)
	assert.Equal(t, a.TenantID, claims.Memberships[0].TenantID)
	assert.Equal(t, res.UserID.String(), claims.Subject)

	// The impersonation is audited in the control plane.
	var audits int
	require.NoError(t, svc.pool.QueryRow(ctx,
		`SELECT count(*) FROM control_plane.cp_audit_log
		  WHERE action='tenant.login_as' AND admin_id=$1 AND target_id=$2`, adminID, a.TenantID).Scan(&audits))
	assert.GreaterOrEqual(t, audits, 1, "login-as writes an audit row")

	// Revoking consent closes the door again.
	require.NoError(t, accessSvc.SetSuperadminAccess(ctx, a.TenantID, uuid.Must(uuid.NewV7()), false))
	_, err = svc.LoginAsTenant(ctx, mgr, adminID, a.TenantID)
	assert.ErrorIs(t, err, ErrConsentRequired, "revoked consent → refused")
}
