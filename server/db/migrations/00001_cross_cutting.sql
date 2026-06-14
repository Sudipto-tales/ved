-- Migration #1 — the cross-cutting / shared-kernel tables, seeded before any slice
-- (see database/08-cross-cutting.md). Plus a demo `note` table that the walking
-- skeleton uses to prove the tenant-context → RLS → "row + outbox in one tx" path.
--
-- NOTE on RLS: policies + FORCE ROW LEVEL SECURITY are in place. RLS only bites when
-- the app connects as a NON-superuser role (a superuser bypasses it). Migration
-- 00002 creates the `ved_app` role and the app pool runs as it (db.Connect), so
-- tenant isolation is enforced — verified end-to-end.

-- +goose Up
CREATE TABLE IF NOT EXISTS outbox (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    aggregate      text NOT NULL,
    aggregate_id   uuid NOT NULL,
    op             text NOT NULL CHECK (op IN ('CREATE','UPDATE','DELETE')),
    payload        jsonb NOT NULL,
    schema_version int  NOT NULL DEFAULT 1,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    sent_at        timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_unsent_idx ON outbox (sent_at, created_at);

CREATE TABLE IF NOT EXISTS inbox (
    event_id   uuid PRIMARY KEY,
    tenant_id  uuid NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_cursor (
    id         uuid PRIMARY KEY,
    stream     text NOT NULL,
    consumer   text NOT NULL,
    last_seq   bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id                  uuid PRIMARY KEY,
    tenant_id           uuid NOT NULL,
    actor_membership_id uuid,
    action              text NOT NULL,
    resource_type       text NOT NULL,
    resource_id         uuid,
    before              jsonb,
    after               jsonb,
    at                  timestamptz NOT NULL DEFAULT now(),
    origin_node_id      uuid NOT NULL
);

-- Demo slice table (walking skeleton). Real slices follow the same column shape.
CREATE TABLE IF NOT EXISTS note (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    body           text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    hlc            text NOT NULL,
    version        bigint NOT NULL DEFAULT 1,
    origin_node_id uuid NOT NULL,
    deleted_at     timestamptz
);
CREATE INDEX IF NOT EXISTS note_tenant_idx ON note (tenant_id, created_at DESC);

-- RLS on every tenant-scoped table (database/00-conventions.md).
ALTER TABLE outbox      ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox      FORCE  ROW LEVEL SECURITY;
ALTER TABLE inbox       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox       FORCE  ROW LEVEL SECURITY;
ALTER TABLE audit_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log   FORCE  ROW LEVEL SECURITY;
ALTER TABLE note        ENABLE ROW LEVEL SECURITY;
ALTER TABLE note        FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON outbox    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON inbox     USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON audit_log USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON note      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- +goose Down
DROP TABLE IF EXISTS note;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS sync_cursor;
DROP TABLE IF EXISTS inbox;
DROP TABLE IF EXISTS outbox;
