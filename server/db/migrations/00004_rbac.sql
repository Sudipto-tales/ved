-- Migration #4 — RBAC (M2). Realises the 4-concept model from docs/05-rbac.md and the
-- table design in docs/database/02-identity-access.md.
--
-- The split mirrors identity (#3): IDENTITY/CATALOG IS GLOBAL, ACCESS IS TENANT-SCOPED.
--   * permissions       — GLOBAL: closed catalog seeded FROM CODE; no tenant_id, NO RLS.
--   * roles             — tenant-scoped bundles of permissions  (base cols + RLS).
--   * role_permissions  — tenant-scoped join: role  x permission (RLS).
--   * membership_roles  — tenant-scoped join: membership x role  (RLS).
--   * designations      — tenant-scoped HR/display titles        (base cols + RLS).
--
-- Permissions are FIXED (the strings handlers check, e.g. `student.onboard`); roles are
-- DYNAMIC admin-assembled bundles. Effective permissions for a membership = the union of
-- permissions across its roles, with `tenant.admin` short-circuiting to "all within this
-- tenant" (resolved in code; see internal/platform/authz). docs/plan/bridges.md §4.

-- +goose Up

-- ---- GLOBAL permission catalog (no tenant_id, no RLS; seeded from code) ----------
-- Fixed reference data, identical on every node, so it carries no sync/outbox routing:
-- it is code-seeded, not business data. (docs/database/02-identity-access.md.)
CREATE TABLE IF NOT EXISTS permissions (
    id          uuid PRIMARY KEY,
    key         text NOT NULL,                 -- e.g. 'student.onboard', 'tenant.admin'
    description text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS permissions_key_key ON permissions (key);

-- ---- Designations: HR/display job titles (tenant-scoped + RLS) -------------------
-- Designation != Role; the code NEVER checks a designation for authorization.
CREATE TABLE IF NOT EXISTS designations (
    id                    uuid PRIMARY KEY,
    tenant_id             uuid NOT NULL,
    name                  text NOT NULL,
    applies_to_user_type  text
                            CHECK (applies_to_user_type IS NULL OR
                                   applies_to_user_type IN ('STUDENT','TEACHER','EMPLOYEE','GUARDIAN')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz,
    hlc                   text NOT NULL,
    version               bigint NOT NULL DEFAULT 1,
    origin_node_id        uuid NOT NULL,
    CONSTRAINT designations_tenant_name_key UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS designations_tenant_idx ON designations (tenant_id) WHERE deleted_at IS NULL;

-- memberships.designation_id was reserved in #3; wire the FK now that the table exists.
ALTER TABLE memberships
    ADD CONSTRAINT memberships_designation_fk
    FOREIGN KEY (designation_id) REFERENCES designations (id);

-- ---- Roles: dynamic per-tenant permission bundles (tenant-scoped + RLS) ----------
CREATE TABLE IF NOT EXISTS roles (
    id              uuid PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    name            text NOT NULL,
    is_system       boolean NOT NULL DEFAULT false,  -- seeded default; protected from deletion
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    hlc             text NOT NULL,
    version         bigint NOT NULL DEFAULT 1,
    origin_node_id  uuid NOT NULL,
    CONSTRAINT roles_tenant_name_key UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS roles_tenant_idx ON roles (tenant_id) WHERE deleted_at IS NULL;

-- ---- role x permission (tenant-scoped join + RLS) -------------------------------
-- permission_id references the GLOBAL catalog; the row itself is tenant-owned.
CREATE TABLE IF NOT EXISTS role_permissions (
    tenant_id       uuid NOT NULL,
    role_id         uuid NOT NULL REFERENCES roles (id),
    permission_id   uuid NOT NULL REFERENCES permissions (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    hlc             text NOT NULL,
    origin_node_id  uuid NOT NULL,
    PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS role_permissions_tenant_role_idx ON role_permissions (tenant_id, role_id);

-- ---- membership x role (tenant-scoped join + RLS) -------------------------------
-- A membership can hold MANY roles; this is what the checkbox UI maps to.
CREATE TABLE IF NOT EXISTS membership_roles (
    tenant_id       uuid NOT NULL,
    membership_id   uuid NOT NULL REFERENCES memberships (id),
    role_id         uuid NOT NULL REFERENCES roles (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    hlc             text NOT NULL,
    origin_node_id  uuid NOT NULL,
    PRIMARY KEY (membership_id, role_id)
);
CREATE INDEX IF NOT EXISTS membership_roles_tenant_membership_idx ON membership_roles (tenant_id, membership_id);
CREATE INDEX IF NOT EXISTS membership_roles_tenant_role_idx ON membership_roles (tenant_id, role_id);

-- ---- RLS on every tenant-scoped table (USING also gates INSERT WITH CHECK) -------
ALTER TABLE designations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations     FORCE  ROW LEVEL SECURITY;
ALTER TABLE roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles            FORCE  ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE  ROW LEVEL SECURITY;
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON designations     USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON roles            USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON role_permissions USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON membership_roles USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- permissions is GLOBAL (no RLS). Grant the app role read on it explicitly; default
-- privileges already cover DML on the tenant-scoped tables created above.
GRANT SELECT, INSERT, UPDATE ON permissions TO ved_app;

-- +goose Down
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_designation_fk;
DROP TABLE IF EXISTS membership_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS designations;
DROP TABLE IF EXISTS permissions;
