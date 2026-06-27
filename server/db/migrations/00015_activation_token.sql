-- Tenant-plane migration #15 — magic-login activation tokens (M11 "Magic Login Link",
-- docs/promts.md, docs/24-login-and-registration.md).
--
-- At provisioning the control plane mints a one-time activation token alongside the
-- temp password. The school admin clicks `/activate?token=…` instead of typing
-- credentials: one-click, more secure, better UX. Only the SHA-256 hash is stored — the
-- raw token lives only in the emailed link.
--
-- Tenant-scoped + RLS + sync columns (cloud-first invariant). The node's PUBLIC
-- /auth/activate has no tenant context, so the lookup uses a narrow SECURITY DEFINER
-- function (the same controlled-bypass pattern as auth_memberships) that resolves a LIVE
-- token to its tenant + user, then the node sets app.tenant_id and consumes it.

-- +goose Up
CREATE TABLE IF NOT EXISTS activation_token (
    id              uuid PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    token_hash      text NOT NULL,
    expires_at      timestamptz NOT NULL,
    consumed_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    hlc             text NOT NULL,
    version         bigint NOT NULL DEFAULT 1,
    origin_node_id  uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS activation_token_hash_key ON activation_token (token_hash);
CREATE INDEX IF NOT EXISTS activation_token_user_idx ON activation_token (tenant_id, user_id) WHERE deleted_at IS NULL;

ALTER TABLE activation_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_token FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON activation_token USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ---- The one controlled cross-tenant activation read ----------------------------
-- Resolves a LIVE (unconsumed, unexpired, not soft-deleted) activation token to its
-- tenant + user. Runs as the definer so the public /auth/activate can find the row
-- without a tenant context; returns minimal columns only.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION auth_activation(p_token_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT a.id, a.tenant_id, a.user_id
    FROM activation_token a
    WHERE a.token_hash = p_token_hash
      AND a.consumed_at IS NULL
      AND a.deleted_at IS NULL
      AND a.expires_at > now();
$$;
-- +goose StatementEnd

REVOKE ALL ON FUNCTION auth_activation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_activation(text) TO ved_app;

-- +goose Down
DROP FUNCTION IF EXISTS auth_activation(text);
DROP TABLE IF EXISTS activation_token;
