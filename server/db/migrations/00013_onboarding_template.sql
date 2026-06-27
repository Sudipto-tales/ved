-- Migration #13 — Dynamic onboarding template + dropdown lists (M10, docs/06
-- "the onboarding template … is configurable per tenant", docs/database/03-tenant-setup.md).
--
-- Two tenant-scoped config tables let a School Admin tailor the people-onboarding forms
-- WITHOUT a code change:
--   * onboarding_field_config — per person_type, toggles VISIBILITY + REQUIREDness (and a
--     display label + order) over the BUILT-IN optional fields the students/teachers/staff
--     slices already collect. This is the "field-toggle" model (not arbitrary columns): the
--     field_key always maps to an existing OnboardInput field; the config just governs
--     whether the form shows it and whether the backend insists on it.
--   * dropdown_option — admin-managed option lists ("every school names these differently":
--     STUDENT_CATEGORY, BLOOD_GROUP, GENDER, GUARDIAN_RELATION, DEPARTMENT, DESIGNATION).
--
-- Both are tenant-scoped + RLS + sync columns (the cloud-first invariant: every write rides
-- the outbox, every row carries hlc/version/origin_node_id and a UUIDv7 PK). Mutable config
-- (no append-only trigger).

-- +goose Up
CREATE TABLE IF NOT EXISTS onboarding_field_config (
    id                uuid PRIMARY KEY,
    tenant_id         uuid NOT NULL,
    person_type       text NOT NULL CHECK (person_type IN ('STUDENT','TEACHER','EMPLOYEE','GUARDIAN')),
    field_key         text NOT NULL,                 -- maps to an existing OnboardInput field
    label             text NOT NULL,                 -- display label (admin-renamable)
    visible           boolean NOT NULL DEFAULT true,
    required          boolean NOT NULL DEFAULT false,
    ordinal           int NOT NULL DEFAULT 0,
    dropdown_category text,                           -- if the field is a SELECT, its option list
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    hlc               text NOT NULL,
    version           bigint NOT NULL DEFAULT 1,
    origin_node_id    uuid NOT NULL,
    CONSTRAINT onboarding_field_config_key UNIQUE (tenant_id, person_type, field_key)
);
CREATE INDEX IF NOT EXISTS onboarding_field_config_tenant_idx
    ON onboarding_field_config (tenant_id, person_type) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS dropdown_option (
    id              uuid PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    category        text NOT NULL,                    -- e.g. STUDENT_CATEGORY, BLOOD_GROUP
    label           text NOT NULL,
    value           text NOT NULL,
    ordinal         int NOT NULL DEFAULT 0,
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    hlc             text NOT NULL,
    version         bigint NOT NULL DEFAULT 1,
    origin_node_id  uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS dropdown_option_key
    ON dropdown_option (tenant_id, category, value) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dropdown_option_tenant_idx
    ON dropdown_option (tenant_id, category) WHERE deleted_at IS NULL;

-- ---- RLS (tenant isolation; USING also gates INSERT WITH CHECK) ------------------
ALTER TABLE onboarding_field_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_field_config FORCE  ROW LEVEL SECURITY;
ALTER TABLE dropdown_option         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropdown_option         FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON onboarding_field_config USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON dropdown_option         USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- +goose Down
DROP TABLE IF EXISTS dropdown_option;
DROP TABLE IF EXISTS onboarding_field_config;
