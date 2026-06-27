//go:build integration

// Integration tests for the dynamic school-registration form (control plane). Proves the
// golden-rule analog (field upserts + ONE cp_audit_log, NO cp_outbox), the locked/validation
// guards, that Register enforces visible+required fields and persists custom answers, and
// that the public projection only exposes visible fields. Owner pool, control_plane schema.
//
// The control-plane test DB is shared across tests (migrations only), so each test first
// resets the template to its built-ins (SaveRegistrationForm deletes absent custom fields).
//
// Run: ./ved.sh test ./internal/features/registration/...
package registration

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func hasField(fs []FieldDef, key string) bool {
	for _, f := range fs {
		if f.FieldKey == key {
			return true
		}
	}
	return false
}

func cloneAndSet(fs []FieldDef, key string, mut func(*FieldDef)) []FieldDef {
	out := make([]FieldDef, len(fs))
	copy(out, fs)
	for i := range out {
		if out[i].FieldKey == key {
			mut(&out[i])
		}
	}
	return out
}

func uniqSlug() string {
	h := uuid.NewString()
	return "rf" + h[len(h)-12:]
}

// builtinsOnly returns the current template stripped of custom fields.
func builtinsOnly(t *testing.T, svc *Service) []FieldDef {
	t.Helper()
	form, err := svc.GetRegistrationForm(context.Background(), true)
	require.NoError(t, err)
	require.NotEmpty(t, form, "built-in fields are seeded by the migration")
	builtins := []FieldDef{}
	for _, f := range form {
		if f.Kind == "BUILTIN" {
			builtins = append(builtins, f)
		}
	}
	return builtins
}

// resetToBuiltins clears any custom fields left by earlier tests AND registers a cleanup so
// this test's own custom fields don't leak into the shared control-plane template (Register
// in other tests would otherwise fail the new required-field check).
func resetToBuiltins(t *testing.T, svc *Service, adminID uuid.UUID) []FieldDef {
	t.Helper()
	builtins := builtinsOnly(t, svc)
	require.NoError(t, svc.SaveRegistrationForm(context.Background(), adminID, builtins))
	t.Cleanup(func() {
		_ = svc.SaveRegistrationForm(context.Background(), adminID, builtinsOnly(t, svc))
	})
	return builtins
}

func TestRegistrationFormSaveGoldenRule(t *testing.T) {
	svc, _, adminID := kycFixture(t)
	ctx := context.Background()
	builtins := resetToBuiltins(t, svc, adminID)
	require.True(t, hasField(builtins, "school_name"))

	var before int
	require.NoError(t, svc.pool.QueryRow(ctx,
		`SELECT count(*) FROM control_plane.cp_audit_log WHERE action='registration_form.update'`).Scan(&before))

	// Add a required custom dropdown field, then save the whole template.
	next := append([]FieldDef{}, builtins...)
	next = append(next, FieldDef{
		FieldKey: "board", Kind: "CUSTOM", FieldType: "DROPDOWN", Label: "Board",
		Visible: true, Required: true, Ordinal: 100,
		Options: []OptionDef{{Label: "CBSE", Value: "CBSE"}, {Label: "ICSE", Value: "ICSE"}},
	})
	require.NoError(t, svc.SaveRegistrationForm(ctx, adminID, next))

	// Exactly ONE new audit row, and ZERO cp_outbox rows (the template never reaches a node).
	var after, outbox int
	require.NoError(t, svc.pool.QueryRow(ctx,
		`SELECT count(*) FROM control_plane.cp_audit_log WHERE action='registration_form.update'`).Scan(&after))
	assert.Equal(t, before+1, after, "one audit row per save")
	require.NoError(t, svc.pool.QueryRow(ctx,
		`SELECT count(*) FROM control_plane.cp_outbox WHERE aggregate='registration_form'`).Scan(&outbox))
	assert.Equal(t, 0, outbox, "registration form is control-plane-only — no node push")

	saved, err := svc.GetRegistrationForm(ctx, true)
	require.NoError(t, err)
	assert.True(t, hasField(saved, "board"), "custom field persisted")

	// A locked built-in cannot be hidden.
	err = svc.SaveRegistrationForm(ctx, adminID, cloneAndSet(saved, "school_name", func(f *FieldDef) { f.Visible = false }))
	assert.ErrorIs(t, err, ErrLockedField, "locked field cannot be hidden")

	// A dropdown custom field with no options is rejected.
	noOpts := append([]FieldDef{}, saved...)
	noOpts = append(noOpts, FieldDef{FieldKey: "house", Kind: "CUSTOM", FieldType: "DROPDOWN", Label: "House", Visible: true})
	assert.ErrorIs(t, svc.SaveRegistrationForm(ctx, adminID, noOpts), ErrInvalidInput, "dropdown needs options")

	// An invalid custom key is rejected.
	badKey := append([]FieldDef{}, saved...)
	badKey = append(badKey, FieldDef{FieldKey: "Bad Key", Kind: "CUSTOM", FieldType: "TEXT", Label: "X", Visible: true})
	assert.ErrorIs(t, svc.SaveRegistrationForm(ctx, adminID, badKey), ErrInvalidInput, "custom key must be a slug")
}

func TestRegisterEnforcesAndPersistsCustomFields(t *testing.T) {
	svc, planID, adminID := kycFixture(t)
	ctx := context.Background()
	builtins := resetToBuiltins(t, svc, adminID)

	next := append([]FieldDef{}, builtins...)
	next = append(next,
		FieldDef{FieldKey: "board", Kind: "CUSTOM", FieldType: "TEXT", Label: "Board", Visible: true, Required: true, Ordinal: 100},
		FieldDef{FieldKey: "secret_note", Kind: "CUSTOM", FieldType: "TEXT", Label: "Secret", Visible: false, Ordinal: 110},
	)
	require.NoError(t, svc.SaveRegistrationForm(ctx, adminID, next))

	slug := uniqSlug()
	base := RegisterInput{SchoolName: "S", Slug: slug, AdminName: "A", AdminEmail: slug + "@t.com", PlanID: planID.String()}

	// Missing the required custom field → rejected, naming the LABEL.
	_, err := svc.Register(ctx, base)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrInvalidInput)
	assert.Contains(t, err.Error(), "Board")

	// Provide it (plus a hidden field that must be dropped) → success + persisted.
	withExtra := base
	withExtra.Extra = map[string]any{"board": "CBSE", "secret_note": "should be dropped"}
	reg, err := svc.Register(ctx, withExtra)
	require.NoError(t, err)

	var raw []byte
	require.NoError(t, svc.pool.QueryRow(ctx,
		`SELECT extra_fields FROM control_plane.school_registration WHERE id=$1`, reg.ID).Scan(&raw))
	var extra map[string]any
	require.NoError(t, json.Unmarshal(raw, &extra))
	assert.Equal(t, "CBSE", extra["board"], "visible custom answer persisted")
	_, hasSecret := extra["secret_note"]
	assert.False(t, hasSecret, "hidden custom field is not persisted even if posted")
}

func TestRegistrationFormPublicProjection(t *testing.T) {
	svc, _, adminID := kycFixture(t)
	ctx := context.Background()
	builtins := resetToBuiltins(t, svc, adminID)

	// Hide a non-locked built-in (admin_phone).
	hidden := cloneAndSet(builtins, "admin_phone", func(f *FieldDef) { f.Visible = false; f.Required = false })
	require.NoError(t, svc.SaveRegistrationForm(ctx, adminID, hidden))

	pub, err := svc.GetRegistrationForm(ctx, false)
	require.NoError(t, err)
	assert.False(t, hasField(pub, "admin_phone"), "hidden field absent from the public projection")
	assert.True(t, hasField(pub, "school_name"), "locked field still present")

	for i := 1; i < len(pub); i++ {
		assert.LessOrEqual(t, pub[i-1].Ordinal, pub[i].Ordinal, "ordered by ordinal")
	}
}
