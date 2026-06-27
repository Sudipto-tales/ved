-- Control-plane migration #10 — Support ticketing (the Support Console backend).
--
-- A school (tenant) raises a ticket with a subject + first message; the superadmin
-- replies and moves it through open → pending → resolved. Each ticket owns an ordered
-- thread of messages, authored by either the SCHOOL or the PLATFORM.
--
-- These are the cross-plane SINK tables: in the full feature school-side tickets/messages
-- arrive via the node→cloud sync hub, and platform replies are pushed back via cp_outbox.
-- For now the platform endpoints read/write them directly. Plain control-plane columns
-- (docs/database/01): no tenant_id-scoped RLS, no sync columns — tenant_id is just a FK.

-- +goose Up
CREATE TABLE IF NOT EXISTS control_plane.support_ticket (
    id              uuid PRIMARY KEY,
    tenant_id       uuid REFERENCES control_plane.tenant (id),
    school_name     text NOT NULL DEFAULT '',   -- denormalized label (tenant may not be provisioned yet)
    subject         text NOT NULL,
    priority        text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
    status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved')),
    last_message_at timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_status_idx ON control_plane.support_ticket (status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS control_plane.support_message (
    id          uuid PRIMARY KEY,
    ticket_id   uuid NOT NULL REFERENCES control_plane.support_ticket (id) ON DELETE CASCADE,
    author_type text NOT NULL CHECK (author_type IN ('SCHOOL','PLATFORM')),
    author_name text NOT NULL DEFAULT '',
    body        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_message_ticket_idx ON control_plane.support_message (ticket_id, created_at);

-- +goose Down
DROP TABLE IF EXISTS control_plane.support_message;
DROP TABLE IF EXISTS control_plane.support_ticket;
