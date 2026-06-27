//go:build integration

// Integration tests for M11 Slice A — registration KYC / risk / source (docs/promts.md
// "Additional Registration Features"). Owner pool, control_plane schema (no RLS).
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

// kycFixture returns a service plus a seeded plan + admin id (no approval).
func kycFixture(t *testing.T) (*Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	pool := testdb.ControlPlanePool(t)
	ctx := context.Background()
	platRepo := platform.NewRepo(pool)
	require.NoError(t, platform.SeedPlans(ctx, platRepo))
	require.NoError(t, platform.SeedSuperAdmin(ctx, platRepo))

	var planID, adminID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM control_plane.plan_catalog WHERE is_active LIMIT 1`).Scan(&planID))
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM control_plane.platform_admin LIMIT 1`).Scan(&adminID))

	svc := NewService(pool, uuid.Must(uuid.NewV7()), license.NewSigner(testSignKey))
	return svc, planID, adminID
}

func TestRiskScoringAtRegister(t *testing.T) {
	svc, planID, _ := kycFixture(t)
	ctx := context.Background()

	// A free-email-domain sign-up is flagged MEDIUM with a human-readable factor.
	h := uuid.NewString()
	freeSlug := "rk" + h[len(h)-12:]
	free, err := svc.Register(ctx, RegisterInput{
		SchoolName: "Free Mail School", Slug: freeSlug, AdminName: "Head",
		AdminEmail: freeSlug + "@gmail.com", PlanID: planID.String(),
		Source: "campaign", SourceDetail: "spring-promo",
	})
	require.NoError(t, err)
	d, err := svc.Detail(ctx, free.ID)
	require.NoError(t, err)
	assert.Equal(t, "MEDIUM", d.KYC.RiskScore)
	assert.NotEmpty(t, d.KYC.RiskFactors, "free email domain produces a factor")
	assert.Equal(t, "CAMPAIGN", d.KYC.Source, "free-text source is normalized to the known set")
	require.NotNil(t, d.KYC.SourceDetail)
	assert.Equal(t, "spring-promo", *d.KYC.SourceDetail)

	// A business-domain sign-up with no other signal is LOW.
	h2 := uuid.NewString()
	bizSlug := "bz" + h2[len(h2)-12:]
	biz, err := svc.Register(ctx, RegisterInput{
		SchoolName: "Biz School", Slug: bizSlug, AdminName: "Head",
		AdminEmail: "principal@" + bizSlug + ".edu", PlanID: planID.String(),
		BusinessReg: "BRN-123", GST: "GST-999",
	})
	require.NoError(t, err)
	db, err := svc.Detail(ctx, biz.ID)
	require.NoError(t, err)
	assert.Equal(t, "LOW", db.KYC.RiskScore)
	assert.Equal(t, "DIRECT", db.KYC.Source, "unset source defaults to DIRECT")
	require.NotNil(t, db.KYC.BusinessReg)
	assert.Equal(t, "BRN-123", *db.KYC.BusinessReg)
}

func TestSetKYCDecision(t *testing.T) {
	svc, planID, adminID := kycFixture(t)
	ctx := context.Background()

	h := uuid.NewString()
	slug := "kc" + h[len(h)-12:]
	reg, err := svc.Register(ctx, RegisterInput{
		SchoolName: "KYC School", Slug: slug, AdminName: "Head",
		AdminEmail: "head@" + slug + ".edu", PlanID: planID.String(),
	})
	require.NoError(t, err)

	// Starts PENDING.
	d, err := svc.Detail(ctx, reg.ID)
	require.NoError(t, err)
	assert.Equal(t, "PENDING", d.KYC.Status)

	// Verify it.
	require.NoError(t, svc.SetKYC(ctx, adminID, reg.ID, "VERIFIED", "docs check out"))
	d, err = svc.Detail(ctx, reg.ID)
	require.NoError(t, err)
	assert.Equal(t, "VERIFIED", d.KYC.Status)
	assert.Equal(t, "VERIFIED", d.Registration.KYCStatus, "queue DTO mirrors the status")
	require.NotNil(t, d.KYC.Notes)
	assert.Equal(t, "docs check out", *d.KYC.Notes)

	// Invalid status rejected; unknown registration is ErrNotFound.
	assert.ErrorIs(t, svc.SetKYC(ctx, adminID, reg.ID, "BOGUS", ""), ErrInvalidInput)
	assert.ErrorIs(t, svc.SetKYC(ctx, adminID, uuid.Must(uuid.NewV7()), "VERIFIED", ""), ErrNotFound)

	// Analytics counts our registration under VERIFIED.
	sum, err := svc.KYCAnalytics(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, sum.KYC["VERIFIED"], 1)
}
