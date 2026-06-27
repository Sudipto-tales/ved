-- Migration #17 — surface the school name + slug alongside each membership (docs/24, docs/25).
--
-- After login the tenant app should greet the user with their school's name (sidebar brand,
-- "Welcome to {School}" hero) for EVERY persona, not just admins. The only endpoint that
-- carries the name today (GET /access/profile) is gated tenant.settings, so teachers/
-- students/guardians can't read it. Instead we widen auth_memberships — the same narrow,
-- audited SECURITY DEFINER bypass that login already uses (#3) — to also return the tenant's
-- display_name + slug via a LEFT JOIN on tenant_profile. The function runs as the definer, so
-- the cross-tenant tenant_profile read at login is fine; every other read stays under RLS.
--
-- The RETURNS TABLE signature changes, so CREATE OR REPLACE is insufficient — DROP first.

-- +goose Up
DROP FUNCTION IF EXISTS auth_memberships(uuid);

-- +goose StatementBegin
CREATE FUNCTION auth_memberships(p_user_id uuid)
RETURNS TABLE (id uuid, tenant_id uuid, user_type text, status text, tenant_name text, tenant_slug text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.id, m.tenant_id, m.user_type, m.status,
           COALESCE(tp.display_name, '') AS tenant_name,
           COALESCE(tp.slug, '')         AS tenant_slug
    FROM memberships m
    LEFT JOIN tenant_profile tp
      ON tp.tenant_id = m.tenant_id AND tp.deleted_at IS NULL
    WHERE m.user_id = p_user_id
      AND m.deleted_at IS NULL
      AND m.status = 'ACTIVE';
$$;
-- +goose StatementEnd

REVOKE ALL ON FUNCTION auth_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_memberships(uuid) TO ved_app;

-- +goose Down
DROP FUNCTION IF EXISTS auth_memberships(uuid);

-- +goose StatementBegin
CREATE FUNCTION auth_memberships(p_user_id uuid)
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
