-- Migration #16 — Support (school side). A school admin raises a support ticket and
-- exchanges messages with the platform. These are tenant-scoped, sync-enabled tables:
-- every write routes through the outbox, so the node→cloud relay projects tickets/messages
-- into control_plane.support_* (the Support Console reads them there). Platform replies
-- flow back the other way (cloud→node) in a later slice.
--
-- Base columns + RLS per docs/database/00-conventions.md.

-- +goose Up

-- ---- support_ticket: one thread head per request ------------------------------------
CREATE TABLE IF NOT EXISTS support_ticket (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    subject          text NOT NULL,
    priority         text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
    status           text NOT NULL DEFAULT 'open'   CHECK (status IN ('open','pending','resolved')),
    last_message_at  timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS support_ticket_tenant_idx ON support_ticket (tenant_id, last_message_at DESC) WHERE deleted_at IS NULL;

-- ---- support_message: ordered thread; author is the SCHOOL or the PLATFORM -----------
CREATE TABLE IF NOT EXISTS support_message (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    ticket_id        uuid NOT NULL REFERENCES support_ticket (id),
    author_type      text NOT NULL CHECK (author_type IN ('SCHOOL','PLATFORM')),
    author_name      text NOT NULL DEFAULT '',
    body             text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS support_message_ticket_idx ON support_message (tenant_id, ticket_id, created_at) WHERE deleted_at IS NULL;

-- ---- RLS -----------------------------------------------------------------------------
ALTER TABLE support_ticket  ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket  FORCE  ROW LEVEL SECURITY;
ALTER TABLE support_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_message FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON support_ticket  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON support_message USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- +goose Down
DROP TABLE IF EXISTS support_message;
DROP TABLE IF EXISTS support_ticket;
