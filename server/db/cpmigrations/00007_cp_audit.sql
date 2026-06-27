-- Control-plane migration #7 — platform audit log (M11).
--
-- A minimal append-only audit trail for sensitive superadmin actions — first used by
-- "Login As Tenant" (impersonation), which must be traceable to the admin who did it,
-- the tenant they entered, and when. Plain control-plane table (docs/database/01):
-- no tenant_id / RLS / sync columns.

-- +goose Up
CREATE TABLE IF NOT EXISTS control_plane.cp_audit_log (
    id          uuid PRIMARY KEY,
    admin_id    uuid REFERENCES control_plane.platform_admin (id),
    action      text NOT NULL,
    target_type text,
    target_id   uuid,
    detail      jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cp_audit_log_created_idx ON control_plane.cp_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS cp_audit_log_target_idx  ON control_plane.cp_audit_log (target_type, target_id);

-- +goose Down
DROP TABLE IF EXISTS control_plane.cp_audit_log;
