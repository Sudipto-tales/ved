-- Control-plane migration #3 — the cloud→node CONFIG OUTBOX (docs/08-offline-sync.md
-- "what flows which way": Cloud → Node = license, tenant config, catalog/template updates).
-- It is the cloud's transactional outbox for the OTHER sync direction: the control plane
-- writes a config-change row here in the same tx as the change, and a cloud relay publishes
-- it on cloud.<tenant_id>.<aggregate>.<op> for the owning node to apply (LWW + tombstone).
--
-- Cloud-only, not tenant-scoped, no RLS (control-plane convention). tenant_id is carried so
-- the relay can address the right node's subject; hlc/origin lets the node merge it.

-- +goose Up
CREATE TABLE IF NOT EXISTS control_plane.cp_outbox (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,             -- destination tenant (→ its node)
    aggregate      text NOT NULL,            -- e.g. 'tenant_profile', 'license'
    aggregate_id   uuid NOT NULL,
    op             text NOT NULL CHECK (op IN ('CREATE','UPDATE','DELETE')),
    payload        jsonb NOT NULL,           -- full-row snapshot the node merges
    schema_version int  NOT NULL DEFAULT 1,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL,            -- the cloud's own node id (cloud is a writer too)
    created_at     timestamptz NOT NULL DEFAULT now(),
    sent_at        timestamptz
);
CREATE INDEX IF NOT EXISTS cp_outbox_unsent_idx ON control_plane.cp_outbox (sent_at, created_at);

-- +goose Down
DROP TABLE IF EXISTS control_plane.cp_outbox;
