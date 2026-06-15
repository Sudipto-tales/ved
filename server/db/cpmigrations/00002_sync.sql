-- Control-plane migration #2 — the cloud SYNC HUB store (docs/08-offline-sync.md). The
-- cloud holds the durable, per-tenant event HISTORY (system-of-record backup) that DR and
-- cross-school reporting replay from. The primary key on event_id is the idempotent inbox:
-- a duplicate/replayed delivery is an ON CONFLICT no-op (effectively-once apply).
--
-- Cloud-only, not tenant-scoped, no RLS/sync columns (control-plane convention).

-- +goose Up
CREATE TABLE IF NOT EXISTS control_plane.sync_event (
    event_id       uuid PRIMARY KEY,          -- = the node's outbox row id (dedupe key)
    tenant_id      uuid NOT NULL,
    aggregate      text NOT NULL,
    aggregate_id   uuid NOT NULL,
    op             text NOT NULL,
    payload        jsonb NOT NULL,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL,
    schema_version int  NOT NULL DEFAULT 1,
    occurred_at    timestamptz NOT NULL,       -- when the node created it
    received_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_event_tenant_idx ON control_plane.sync_event (tenant_id, occurred_at);

-- +goose Down
DROP TABLE IF EXISTS control_plane.sync_event;
