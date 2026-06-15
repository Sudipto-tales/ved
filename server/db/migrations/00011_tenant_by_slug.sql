-- Migration #11 — resolve a tenant by its slug for subdomain routing (docs/25).
--
-- A subdomain (lincoln.ved.com) carries the slug, not the tenant_id. The tenant-context
-- middleware must map slug → tenant_id BEFORE a tenant is set, so it can't go through RLS
-- (which needs app.tenant_id). We expose one narrow, audited bypass — a SECURITY DEFINER
-- function returning only the tenant_id for a live tenant_profile slug — exactly the same
-- pattern as auth_memberships (#3). Every other read of tenant_profile stays under RLS.

-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION tenant_id_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM tenant_profile
    WHERE slug = p_slug AND deleted_at IS NULL
    LIMIT 1;
$$;
-- +goose StatementEnd

REVOKE ALL ON FUNCTION tenant_id_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_id_by_slug(text) TO ved_app;

-- +goose Down
DROP FUNCTION IF EXISTS tenant_id_by_slug(text);
