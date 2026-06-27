//go:build integration

// Integration test for M11 Slice D — plan versioning / grandfathered pricing
// (docs/promts.md "Plan Versioning"). Proves a price change adds a new version, that the
// catalog headline rolls forward, that NEW subscribers bind to the latest version while
// EXISTING subscribers stay pinned (grandfathered), and the per-version subscriber counts.
//
// Run: ./ved.sh test ./internal/features/registration/...
package registration

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/license"
	"github.com/weloin/ved/internal/platform/testdb"
)

// approveSchool registers + pays + approves one school on a plan, returning the result.
func approveSchool(t *testing.T, svc *Service, adminID, planID uuid.UUID, prefix string) ApproveResult {
	t.Helper()
	ctx := context.Background()
	h := uuid.NewString()
	slug := prefix + h[len(h)-12:]
	reg, err := svc.Register(ctx, RegisterInput{
		SchoolName: "Plan School", Slug: slug, AdminName: "Head", AdminEmail: slug + "@t.com", PlanID: planID.String(),
	})
	require.NoError(t, err)
	require.NoError(t, svc.SubmitProof(ctx, reg.ID, ProofInput{
		Amount: 5000, Currency: "INR", Method: "BANK_TRANSFER", TxnID: "TXN-" + slug, PayerName: "Head",
	}))
	res, err := svc.Approve(ctx, adminID, reg.ID)
	require.NoError(t, err)
	return res
}

func TestPlanVersioningGrandfathered(t *testing.T) {
	pool := testdb.ControlPlanePool(t)
	ctx := context.Background()
	platRepo := platform.NewRepo(pool)
	require.NoError(t, platform.SeedPlans(ctx, platRepo))
	require.NoError(t, platform.SeedSuperAdmin(ctx, platRepo))
	require.NoError(t, EnsurePlanVersions(ctx, pool))

	var adminID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM control_plane.platform_admin LIMIT 1`).Scan(&adminID))
	svc := NewService(pool, uuid.Must(uuid.NewV7()), license.NewSigner(testSignKey))

	// A fresh plan so subscriber counts are isolated from other tests on this shared DB.
	planID, err := svc.CreatePlan(ctx, PlanInput{Name: "Versioned " + uuid.NewString()[:8], Tier: "T2", BillingCycle: "MONTHLY", Price: 1000, AnnualPrice: 10000, Seats: 100})
	require.NoError(t, err)

	// First subscriber pins v1.
	approveSchool(t, svc, adminID, planID, "pv1")
	v1, err := svc.ListPlanVersions(ctx, planID)
	require.NoError(t, err)
	require.Len(t, v1, 1)
	assert.Equal(t, 1, v1[0].Version)
	assert.Equal(t, 1000.0, v1[0].MonthlyPrice)
	assert.Equal(t, 1, v1[0].ActiveSubscribers)
	assert.True(t, v1[0].IsLatest)

	// Price increase → v2; the catalog headline rolls forward.
	v2, err := svc.CreatePlanVersion(ctx, planID, PlanVersionInput{MonthlyPrice: 1500, AnnualPrice: 15000, Currency: "INR"})
	require.NoError(t, err)
	assert.Equal(t, 2, v2.Version)
	var catalogPrice float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT price FROM control_plane.plan_catalog WHERE id=$1`, planID).Scan(&catalogPrice))
	assert.Equal(t, 1500.0, catalogPrice, "catalog price rolls forward to the latest version")

	// A NEW subscriber binds to v2; the original stays on v1 (grandfathered).
	approveSchool(t, svc, adminID, planID, "pv2")
	vs, err := svc.ListPlanVersions(ctx, planID)
	require.NoError(t, err)
	require.Len(t, vs, 2)
	// Newest first: v2.
	assert.Equal(t, 2, vs[0].Version)
	assert.Equal(t, 1, vs[0].ActiveSubscribers, "the new subscriber is on v2")
	assert.True(t, vs[0].IsLatest)
	assert.Equal(t, 500.0, vs[0].PriceDiff, "monthly delta from v1")
	// v1 retains its grandfathered subscriber.
	assert.Equal(t, 1, vs[1].Version)
	assert.Equal(t, 1, vs[1].ActiveSubscribers, "original subscriber stays grandfathered on v1")
	assert.False(t, vs[1].IsLatest)
}
