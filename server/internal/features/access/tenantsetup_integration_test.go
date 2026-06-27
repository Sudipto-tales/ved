//go:build integration

// Integration tests for the dynamic onboarding template + dropdowns (M10) against a real
// Postgres: seed defaults, save a template (golden rule: rows + outbox + audit), enforce a
// required field via the engine, and dropdown CRUD with RLS isolation.
//
// Run: ./ved.sh test ./internal/features/access/...
package access

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/platform/onboarding"
	"github.com/weloin/ved/internal/platform/testdb"
)

func TestOnboardingTemplateSeedAndSave(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	repo := NewRepo(pool, nodeID)
	svc := NewService(repo)
	ctx := context.Background()

	tenant := testdb.NewTenant(t, pool, nodeID)
	require.NoError(t, SeedTenantSetup(ctx, repo, tenant.ID))

	// Seeded template for STUDENT carries the built-in fields.
	tmpl, err := svc.GetOnboardingTemplate(ctx, tenant.ID, "STUDENT")
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(tmpl), 8, "student template seeded with all built-in fields")

	// Save: make `dob` required + hide `prior_school`. One save → one outbox + one audit.
	outboxBefore := testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM outbox WHERE aggregate='onboarding_template'`)
	fields := make([]FieldConfigDTO, len(tmpl))
	copy(fields, tmpl)
	for i := range fields {
		if fields[i].FieldKey == "dob" {
			fields[i].Required = true
		}
		if fields[i].FieldKey == "prior_school" {
			fields[i].Visible = false
		}
	}
	require.NoError(t, svc.SetOnboardingTemplate(ctx, tenant.ID, tenant.Actor, "STUDENT", fields))

	assert.Equal(t, outboxBefore+1, testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM outbox WHERE aggregate='onboarding_template'`),
		"one save writes exactly one outbox event")
	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenant.ID, `SELECT count(*) FROM audit_log WHERE action='onboarding_template.updated'`),
		"one save writes exactly one audit row")

	got, err := svc.GetOnboardingTemplate(ctx, tenant.ID, "STUDENT")
	require.NoError(t, err)
	byKey := map[string]FieldConfigDTO{}
	for _, f := range got {
		byKey[f.FieldKey] = f
	}
	assert.True(t, byKey["dob"].Required, "dob now required")
	assert.False(t, byKey["prior_school"].Visible, "prior_school now hidden")

	// Saving a non-configurable field is rejected.
	assert.Error(t, svc.SetOnboardingTemplate(ctx, tenant.ID, tenant.Actor, "STUDENT",
		[]FieldConfigDTO{{FieldKey: "ssn", Label: "SSN", Visible: true}}))
}

func TestOnboardingRequiredEnforced(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	repo := NewRepo(pool, nodeID)
	svc := NewService(repo)
	engine := onboarding.NewEngine(pool, nodeID)
	ctx := context.Background()

	tenant := testdb.NewTenant(t, pool, nodeID)
	require.NoError(t, SeedTenantSetup(ctx, repo, tenant.ID))

	// Mark gender required.
	tmpl, err := svc.GetOnboardingTemplate(ctx, tenant.ID, "STUDENT")
	require.NoError(t, err)
	for i := range tmpl {
		if tmpl[i].FieldKey == "gender" {
			tmpl[i].Required = true
		}
	}
	require.NoError(t, svc.SetOnboardingTemplate(ctx, tenant.ID, tenant.Actor, "STUDENT", tmpl))

	// The engine reports gender missing when absent, and clears once supplied.
	require.NoError(t, engine.WithTenant(ctx, tenant.ID, func(tx pgx.Tx) error {
		missing, err := engine.MissingRequiredFields(ctx, tx, "STUDENT", map[string]bool{"gender": false})
		require.NoError(t, err)
		assert.Equal(t, []string{"Gender"}, missing, "gender required & absent → reported")

		missing, err = engine.MissingRequiredFields(ctx, tx, "STUDENT", map[string]bool{"gender": true})
		require.NoError(t, err)
		assert.Empty(t, missing, "gender supplied → satisfied")
		return nil
	}))
}

func TestDropdownCrudAndIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	repo := NewRepo(pool, nodeID)
	svc := NewService(repo)
	ctx := context.Background()

	tenantA := testdb.NewTenant(t, pool, nodeID)
	tenantB := testdb.NewTenant(t, pool, nodeID)

	// Upsert a DEPARTMENT option in A; update it (same category+value) — no duplicate.
	id, err := svc.UpsertDropdown(ctx, tenantA.ID, tenantA.Actor, DropdownOptionDTO{Category: "DEPARTMENT", Label: "Accounts", Value: "ACCOUNTS", Active: true})
	require.NoError(t, err)
	_, err = svc.UpsertDropdown(ctx, tenantA.ID, tenantA.Actor, DropdownOptionDTO{Category: "DEPARTMENT", Label: "Finance & Accounts", Value: "ACCOUNTS", Active: true})
	require.NoError(t, err)

	assert.Equal(t, 1, testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM dropdown_option WHERE category='DEPARTMENT' AND deleted_at IS NULL`),
		"upsert on (category,value) updates in place — no duplicate")

	// RLS: tenant B cannot see A's option.
	assert.Equal(t, 0, testdb.CountInTenant(t, pool, tenantB.ID, `SELECT count(*) FROM dropdown_option WHERE id=$1`, id),
		"foreign tenant sees none of A's dropdowns")

	opts, err := svc.ListDropdowns(ctx, tenantA.ID)
	require.NoError(t, err)
	var found bool
	for _, o := range opts {
		if o.ID == id {
			found = true
			assert.Equal(t, "Finance & Accounts", o.Label, "label was updated")
		}
	}
	assert.True(t, found)

	// Soft delete drops it from the list.
	require.NoError(t, svc.DeleteDropdown(ctx, tenantA.ID, tenantA.Actor, id))
	assert.Equal(t, 0, testdb.CountInTenant(t, pool, tenantA.ID, `SELECT count(*) FROM dropdown_option WHERE category='DEPARTMENT' AND deleted_at IS NULL`),
		"soft-deleted option leaves the active list")
	assert.ErrorIs(t, svc.DeleteDropdown(ctx, tenantA.ID, tenantA.Actor, id), ErrNotFound, "re-deleting is a no-op")
}
