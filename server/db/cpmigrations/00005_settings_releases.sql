-- Control-plane migration #5 — platform Settings store + App Releases registry.
--
--   * platform_setting — a simple key→jsonb store for superadmin console config
--     (endpoints, integration credentials, branding). Plain control-plane data.
--   * app_release — the published desktop/mobile build registry the superadmin manages;
--     end users / tenants pull the latest build from here. `download_url` is the live link
--     (a CDN / object-store / release page); `storage_key` is reserved for future direct
--     upload to object storage. `published` gates whether it shows on the public list.
--
-- Control-plane convention (docs/database/01): no tenant_id / RLS / sync columns.

-- +goose Up
CREATE TABLE IF NOT EXISTS control_plane.platform_setting (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_plane.app_release (
    id           uuid PRIMARY KEY,
    platform     text NOT NULL CHECK (platform IN ('ANDROID','IOS','WINDOWS','MACOS','LINUX','WEB')),
    channel      text NOT NULL DEFAULT 'stable' CHECK (channel IN ('stable','beta','alpha')),
    version      text NOT NULL,
    file_name    text,
    download_url text,
    storage_key  text,                       -- reserved for direct object-store upload
    size_bytes   bigint NOT NULL DEFAULT 0,
    notes        text,
    published    boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_release_platform_idx ON control_plane.app_release (platform, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS control_plane.app_release;
DROP TABLE IF EXISTS control_plane.platform_setting;
