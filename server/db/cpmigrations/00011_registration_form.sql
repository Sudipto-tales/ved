-- Control-plane migration #11 — the DYNAMIC SCHOOL-REGISTRATION FORM.
--
-- The superadmin decides what a prospective school must submit at sign-up — without a
-- code change. This mirrors the tenant-plane "dynamic onboarding template" (M10), but
-- on the control plane:
--   * registration_field_config is a SINGLE GLOBAL template (no tenant_id / RLS / sync
--     columns — control-plane convention, docs/database/01). It drives the public
--     /signup form AND the superadmin review screen.
--   * BUILTIN fields map 1:1 to real school_registration columns (school_name, slug,
--     admin_name, admin_email, admin_phone, plan_id). The ones Register() structurally
--     requires are `locked` — they can be relabelled/reordered but never hidden or made
--     optional (the control-plane echo of M10's always-required name/admission_no).
--   * CUSTOM fields are superadmin-invented (text/number/date/dropdown/file …). They have
--     no column, so their answers land in school_registration.extra_fields (JSONB).
--
-- Saving the template is the golden-rule analog: field rows + ONE cp_audit_log row in one
-- tx (no cp_outbox — the template is control-plane-only; nodes never need it).

-- +goose Up
CREATE TABLE IF NOT EXISTS control_plane.registration_field_config (
    id          uuid PRIMARY KEY,
    field_key   text NOT NULL UNIQUE,                 -- builtin key OR custom slug
    kind        text NOT NULL CHECK (kind IN ('BUILTIN','CUSTOM')),
    field_type  text NOT NULL CHECK (field_type IN
                  ('TEXT','NUMBER','DATE','EMAIL','PHONE','DROPDOWN','FILE')),
    label       text NOT NULL,
    help_text   text NOT NULL DEFAULT '',
    visible     boolean NOT NULL DEFAULT true,
    required    boolean NOT NULL DEFAULT false,
    locked      boolean NOT NULL DEFAULT false,        -- structurally mandatory builtin
    ordinal     int NOT NULL DEFAULT 0,
    options     jsonb NOT NULL DEFAULT '[]',           -- DROPDOWN: [{"label":..,"value":..}]
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_field_config_order_idx
    ON control_plane.registration_field_config (ordinal, field_key);

-- Custom-field answers (built-ins keep their own typed columns).
ALTER TABLE control_plane.school_registration
    ADD COLUMN IF NOT EXISTS extra_fields jsonb NOT NULL DEFAULT '{}';

-- Seed the built-ins (idempotent). The first five are locked because Register() requires
-- them in code; admin_phone is the one freely toggleable built-in.
INSERT INTO control_plane.registration_field_config
  (id, field_key, kind, field_type, label, visible, required, locked, ordinal)
VALUES
  (gen_random_uuid(), 'school_name', 'BUILTIN', 'TEXT',     'School name',  true, true,  true,  10),
  (gen_random_uuid(), 'slug',        'BUILTIN', 'TEXT',     'URL slug',     true, true,  true,  20),
  (gen_random_uuid(), 'admin_name',  'BUILTIN', 'TEXT',     'Admin name',   true, true,  true,  30),
  (gen_random_uuid(), 'admin_email', 'BUILTIN', 'EMAIL',    'Admin email',  true, true,  true,  40),
  (gen_random_uuid(), 'admin_phone', 'BUILTIN', 'PHONE',    'Admin phone',  true, false, false, 50),
  (gen_random_uuid(), 'plan_id',     'BUILTIN', 'DROPDOWN', 'Plan',         true, true,  true,  60),
  -- KYC built-ins map to existing columns; hidden by default, the superadmin can opt to
  -- collect them at sign-up (and mark them required) without a code change.
  (gen_random_uuid(), 'business_reg','BUILTIN', 'TEXT',     'Business registration no.', false, false, false, 70),
  (gen_random_uuid(), 'gst',         'BUILTIN', 'TEXT',     'GST number',                false, false, false, 80)
ON CONFLICT (field_key) DO NOTHING;

-- +goose Down
ALTER TABLE control_plane.school_registration DROP COLUMN IF EXISTS extra_fields;
DROP TABLE IF EXISTS control_plane.registration_field_config;
