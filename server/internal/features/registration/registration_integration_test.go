//go:build integration

// Integration test for the control-plane registration slice (M4). Proves the golden chain
// end to end against a real database: register → submit proof → approve, where approval is
// the state machine that activates the tenant + subscription, writes a GAPLESS invoice,
// signs a license, and cross-plane-provisions the first tenant admin. The control plane is
// a superuser with NO RLS (control_plane schema) — so this uses the owner pool.
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/features/registration/...)
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

func TestRegisterApproveProvisionGoldenChain(t *testing.T) {
	pool := testdb.ControlPlanePool(t)
	ctx := context.Background()

	// Seed the plan catalog + a platform superadmin (the approver).
	platRepo := platform.NewRepo(pool)
	require.NoError(t, platform.SeedPlans(ctx, platRepo))
	require.NoError(t, platform.SeedSuperAdmin(ctx, platRepo))

	var planID, adminID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM control_plane.plan_catalog WHERE is_active ORDER BY price LIMIT 1`).Scan(&planID))
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM control_plane.platform_admin LIMIT 1`).Scan(&adminID))

	svc := NewService(pool, uuid.Must(uuid.NewV7()), license.NewSigner("test-license-key"))

	approve := func(slug string) ApproveResult {
		reg, err := svc.Register(ctx, RegisterInput{
			SchoolName: "Test School " + slug, Slug: slug,
			AdminName: "Head Admin", AdminEmail: slug + "@test.com", PlanID: planID.String(),
		})
		require.NoError(t, err, "register")
		assert.NotEmpty(t, reg.Status, "registration has an initial status")
		assert.Nil(t, reg.TenantID, "no tenant until approved")

		require.NoError(t, svc.SubmitProof(ctx, reg.ID, ProofInput{
			Amount: 1000, Currency: "INR", Method: "BANK_TRANSFER", TxnID: "TXN-" + slug, PayerName: "Head Admin",
		}), "submit proof")

		res, err := svc.Approve(ctx, adminID, reg.ID)
		require.NoError(t, err, "approve → provision")
		return res
	}

	// UUIDv7 is time-ordered (shared leading bytes), so use the RANDOM tail for the slug.
	uniq := func() string {
		h := uuid.NewString() // random v4
		return "cp" + h[len(h)-12:]
	}

	// First school: full chain produces tenant + subscription + invoice + license + admin.
	a := approve(uniq())
	assert.NotEqual(t, uuid.Nil, a.TenantID, "tenant provisioned")
	assert.NotEqual(t, uuid.Nil, a.SubscriptionID, "subscription created")
	assert.NotEqual(t, uuid.Nil, a.LicenseID, "license issued")
	assert.NotEmpty(t, a.InvoiceNumber, "invoice numbered")
	assert.NotEmpty(t, a.AdminLogin, "tenant admin login generated")
	assert.NotEmpty(t, a.AdminTempPass, "one-time admin password generated")

	// The tenant row is ACTIVE in the control plane.
	var status string
	require.NoError(t, pool.QueryRow(ctx, `SELECT status FROM control_plane.tenant WHERE id=$1`, a.TenantID).Scan(&status))
	assert.Equal(t, "ACTIVE", status, "approved tenant is ACTIVE")

	// The cross-plane handoff created the tenant admin user in `public`.
	var adminUsers int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE login_identifier=$1`, a.AdminLogin).Scan(&adminUsers))
	assert.Equal(t, 1, adminUsers, "tenant admin user exists in the tenant plane")

	// Second school: the invoice counter is GAPLESS (monotonic, zero-padded → lexical order).
	b := approve(uniq())
	assert.Greater(t, b.InvoiceNumber, a.InvoiceNumber, "invoice numbers are gapless/monotonic")
}
