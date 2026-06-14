-- Migration #3 — Identity & Access (M1). Realises the user/membership split from
-- docs/03-multi-tenancy.md and docs/database/02-identity-access.md.
--
-- The defining nuance: IDENTITY IS GLOBAL, ACCESS IS TENANT-SCOPED.
--   * users        — GLOBAL: no tenant_id, NO RLS. One person = one row across schools.
--   * memberships  — tenant-scoped: base columns + RLS (user x tenant join).
--
-- Login is a cross-tenant operation (resolve which tenants a global user belongs to)
-- that runs BEFORE a tenant is chosen, so a single app.tenant_id cannot be set yet.
-- RLS on `memberships` would therefore hide every row at login. We expose exactly one
-- narrow, auditable bypass for that: a SECURITY DEFINER function `auth_memberships`
-- that returns only the minimal membership rows for a given user_id. Every other read
-- of memberships goes through normal RLS. (docs/plan/bridges.md §2 auth bridge.)

-- +goose Up

-- ---- GLOBAL identity (no tenant_id, no RLS) -------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  uuid PRIMARY KEY,
    login_identifier    text NOT NULL,                       -- generated handle OR email; globally UNIQUE
    password_hash       text NOT NULL,                       -- argon2id; never plaintext
    must_reset_password boolean NOT NULL DEFAULT true,       -- forced reset on first login
    real_contact_email  text,                                -- optional real inbox for reset/notices
    phone               text,                                -- optional real channel
    status              text NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','SUSPENDED','LOCKED')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    -- sync metadata applies to users; tenant_id does NOT.
    hlc                 text NOT NULL,
    version             bigint NOT NULL DEFAULT 1,
    origin_node_id      uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_login_identifier_key
    ON users (lower(login_identifier)) WHERE deleted_at IS NULL;

-- ---- Membership: user x tenant (tenant-scoped + RLS) ----------------------------
CREATE TABLE IF NOT EXISTS memberships (
    id                  uuid PRIMARY KEY,
    tenant_id           uuid NOT NULL,
    user_id             uuid NOT NULL REFERENCES users (id),
    user_type           text NOT NULL
                          CHECK (user_type IN ('STUDENT','TEACHER','EMPLOYEE','GUARDIAN')),
    designation_id      uuid,                                -- FK added with designations (M2)
    status              text NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('PENDING','ACTIVE','INACTIVE','SUSPENDED')),
    joined_at           timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    hlc                 text NOT NULL,
    version             bigint NOT NULL DEFAULT 1,
    origin_node_id      uuid NOT NULL,
    CONSTRAINT memberships_tenant_user_key UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_tenant_type_status_idx
    ON memberships (tenant_id, user_type, status);
CREATE INDEX IF NOT EXISTS memberships_user_idx
    ON memberships (user_id) WHERE deleted_at IS NULL;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ---- The one controlled cross-tenant identity read ------------------------------
-- Resolves the live, ACTIVE memberships for a global user at login time. Runs as the
-- definer (table owner) so it sees across tenants; returns minimal columns only.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION auth_memberships(p_user_id uuid)
RETURNS TABLE (id uuid, tenant_id uuid, user_type text, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.id, m.tenant_id, m.user_type, m.status
    FROM memberships m
    WHERE m.user_id = p_user_id
      AND m.deleted_at IS NULL
      AND m.status = 'ACTIVE';
$$;
-- +goose StatementEnd

REVOKE ALL ON FUNCTION auth_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_memberships(uuid) TO ved_app;

-- +goose Down
DROP FUNCTION IF EXISTS auth_memberships(uuid);
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS users;
