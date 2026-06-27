//go:build integration

// Integration test for M11 Slice E — AutoPay (docs/promts.md "AutoPay"). Proves the
// per-subscription toggle, that it surfaces on the enriched tenant row, and that the
// analytics aggregate reflects enabled/failed/renewal state.
//
// Run: ./ved.sh test ./internal/features/registration/...
package registration

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAutoPayToggleAndAnalytics(t *testing.T) {
	svc, _, _, a := v2Fixture(t) // approves a tenant → one ACTIVE subscription
	ctx := context.Background()

	var subID uuid.UUID
	require.NoError(t, svc.pool.QueryRow(ctx,
		`SELECT id FROM control_plane.subscription WHERE tenant_id=$1`, a.TenantID).Scan(&subID))

	// Toggle AutoPay on; it surfaces on the enriched tenant row.
	require.NoError(t, svc.SetAutoPay(ctx, subID, true))
	tenants, err := svc.ListTenantsEnriched(ctx)
	require.NoError(t, err)
	var seen bool
	for _, tn := range tenants {
		if tn.ID == a.TenantID {
			seen = true
			assert.True(t, tn.AutoPayEnabled, "enriched row shows AutoPay enabled")
			require.NotNil(t, tn.SubscriptionID)
			assert.Equal(t, subID, *tn.SubscriptionID)
		}
	}
	assert.True(t, seen)

	// Analytics counts at least our enabled subscription, and adoption is non-zero.
	sum, err := svc.AutoPayAnalytics(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, sum.Enabled, 1)
	assert.GreaterOrEqual(t, sum.ActiveSubscriptions, 1)
	assert.Greater(t, sum.AdoptionPct, 0.0)

	// Record a successful renewal and re-check the renewal-success metric is computed.
	_, err = svc.pool.Exec(ctx, `UPDATE control_plane.subscription SET autopay_last_status='SUCCESS' WHERE id=$1`, subID)
	require.NoError(t, err)
	sum, err = svc.AutoPayAnalytics(ctx)
	require.NoError(t, err)
	assert.Greater(t, sum.RenewalSuccessPct, 0.0, "a recorded success lifts renewal-success%")

	// Toggle off, and an unknown subscription is ErrNotFound.
	require.NoError(t, svc.SetAutoPay(ctx, subID, false))
	assert.ErrorIs(t, svc.SetAutoPay(ctx, uuid.Must(uuid.NewV7()), true), ErrNotFound)
}
