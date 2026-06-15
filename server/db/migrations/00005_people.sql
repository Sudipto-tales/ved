-- Migration #5 — People (M3): the first real domain slice. Realises the student
-- admission record + guardians from docs/database/04-people.md, plus a MINIMAL subset of
-- the tenant-setup slice (docs/database/03-tenant-setup.md) — just the `slug` the login
-- handle generator depends on (docs/06-onboarding-credentials.md). The full tenant-setup
-- slice (academic_year, terms, dropdowns, …) lands later; this is only what M3 needs.
--
-- All tables are tenant-scoped: base columns + RLS from docs/database/00-conventions.md.
-- teacher/employee profiles are the SAME shape and arrive in M5 — not duplicated here.

-- +goose Up

-- ---- tenant_profile (minimal): one row per tenant; slug drives login handles --------
CREATE TABLE IF NOT EXISTS tenant_profile (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    display_name     text NOT NULL,
    slug             text NOT NULL,                       -- immutable; {name}.{type}@{slug}.com
    institution_type text NOT NULL DEFAULT 'SCHOOL'
                       CHECK (institution_type IN ('SCHOOL','COLLEGE')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT tenant_profile_tenant_key UNIQUE (tenant_id)
);
-- slug is globally reserved at provisioning (one school per slug across the platform).
CREATE UNIQUE INDEX IF NOT EXISTS tenant_profile_slug_key ON tenant_profile (slug) WHERE deleted_at IS NULL;

-- ---- student: the admission record (identity lives on memberships) -------------------
CREATE TABLE IF NOT EXISTS student (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    membership_id    uuid NOT NULL REFERENCES memberships (id),  -- user_type = STUDENT
    admission_no     text NOT NULL,
    dob              date,
    gender           text CHECK (gender IS NULL OR gender IN ('MALE','FEMALE','OTHER','UNDISCLOSED')),
    category         text,
    blood_group      text,
    address          jsonb,
    prior_school     text,
    prior_class      text,
    prior_marks      jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT student_tenant_admission_key UNIQUE (tenant_id, admission_no),
    CONSTRAINT student_membership_key UNIQUE (membership_id)
);
CREATE INDEX IF NOT EXISTS student_tenant_idx ON student (tenant_id) WHERE deleted_at IS NULL;

-- ---- guardian: a parent/guardian contact (may exist with NO login) -------------------
CREATE TABLE IF NOT EXISTS guardian (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    name             text NOT NULL,
    relation_default text,
    phone            text NOT NULL,
    email            text,
    occupation       text,
    address          jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS guardian_tenant_idx ON guardian (tenant_id) WHERE deleted_at IS NULL;

-- ---- guardian_student: M:N link + the guardian-portal scoping boundary ---------------
CREATE TABLE IF NOT EXISTS guardian_student (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    guardian_id      uuid NOT NULL REFERENCES guardian (id),
    student_id       uuid NOT NULL REFERENCES student (id),
    relation         text NOT NULL
                       CHECK (relation IN ('FATHER','MOTHER','GUARDIAN','GRANDPARENT','SIBLING','OTHER')),
    is_primary       boolean NOT NULL DEFAULT false,
    can_pay          boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT guardian_student_key UNIQUE (tenant_id, guardian_id, student_id)
);
CREATE INDEX IF NOT EXISTS guardian_student_student_idx ON guardian_student (tenant_id, student_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS guardian_student_guardian_idx ON guardian_student (tenant_id, guardian_id) WHERE deleted_at IS NULL;

-- ---- person_document: polymorphic docs for any person ((owner_type, owner_id)) -------
CREATE TABLE IF NOT EXISTS person_document (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    owner_type       text NOT NULL CHECK (owner_type IN ('STUDENT','TEACHER','EMPLOYEE','GUARDIAN')),
    owner_id         uuid NOT NULL,                       -- soft polymorphic ref (same tenant)
    kind             text NOT NULL,
    storage_key      text NOT NULL,
    verified         boolean NOT NULL DEFAULT false,
    verified_by      uuid REFERENCES memberships (id),
    verified_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS person_document_owner_idx ON person_document (tenant_id, owner_type, owner_id) WHERE deleted_at IS NULL;

-- ---- RLS on every tenant-scoped table (USING also gates INSERT WITH CHECK) -----------
ALTER TABLE tenant_profile   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_profile   FORCE  ROW LEVEL SECURITY;
ALTER TABLE student          ENABLE ROW LEVEL SECURITY;
ALTER TABLE student          FORCE  ROW LEVEL SECURITY;
ALTER TABLE guardian         ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian         FORCE  ROW LEVEL SECURITY;
ALTER TABLE guardian_student ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_student FORCE  ROW LEVEL SECURITY;
ALTER TABLE person_document  ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_document  FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_profile   USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON student          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON guardian         USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON guardian_student USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON person_document  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- +goose Down
DROP TABLE IF EXISTS person_document;
DROP TABLE IF EXISTS guardian_student;
DROP TABLE IF EXISTS guardian;
DROP TABLE IF EXISTS student;
DROP TABLE IF EXISTS tenant_profile;
