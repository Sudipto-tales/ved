-- Migration #12 — Guardian Tier-2 guarded writes (M7, docs/18 "Tier 2 — guarded writes").
--
-- The guardian portal is a thin reader (M7 T1) PLUS a few guarded writes. Two of those
-- writes are maker-checker requests: a guardian SUBMITS, school staff DECIDE. Rather than
-- a generic approval framework, this is the MINIMAL per-feature shape (the scoped choice):
-- two tenant-scoped tables, each a small state machine PENDING → APPROVED/REJECTED.
--
--   leave_request          — guardian asks for a child's absence; the class teacher acts.
--   contact_change_request — guardian proposes new contact details; an admin applies them.
--
-- These are MUTABLE rows (status transitions), NOT append-only ledgers — so no
-- forbid_mutation() trigger. They carry the standard base + sync columns and RLS like
-- every tenant table (docs/database/00-conventions.md). The third T2 write — online fee
-- payment (guardian.pay_fees) — needs NO new table: it records a payment straight into the
-- existing finance ledger (simulated gateway, flow B), so it lives entirely in code.

-- +goose Up

-- ---- leave_request: guardian-submitted child absence, decided by a teacher -------------
CREATE TABLE IF NOT EXISTS leave_request (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    student_id       uuid NOT NULL REFERENCES student (id),
    guardian_id      uuid NOT NULL REFERENCES guardian (id),
    requested_by     uuid NOT NULL,                       -- guardian membership_id (the actor)
    from_date        date NOT NULL,
    to_date          date NOT NULL,
    reason           text NOT NULL,
    status           text NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
    decided_by       uuid,                                -- staff membership_id who acted
    decided_at       timestamptz,
    decision_note    text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT leave_request_dates_chk CHECK (to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS leave_request_student_idx ON leave_request (tenant_id, student_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leave_request_pending_idx ON leave_request (tenant_id, status) WHERE deleted_at IS NULL;

-- ---- contact_change_request: guardian-proposed contact edit, applied by an admin --------
CREATE TABLE IF NOT EXISTS contact_change_request (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    guardian_id      uuid NOT NULL REFERENCES guardian (id),
    requested_by     uuid NOT NULL,                       -- guardian membership_id (the actor)
    new_phone        text,                                -- null = leave this field unchanged
    new_email        text,
    new_address      jsonb,
    status           text NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    decided_by       uuid,
    decided_at       timestamptz,
    decision_note    text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT contact_change_some_field_chk
        CHECK (new_phone IS NOT NULL OR new_email IS NOT NULL OR new_address IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS contact_change_guardian_idx ON contact_change_request (tenant_id, guardian_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS contact_change_pending_idx ON contact_change_request (tenant_id, status) WHERE deleted_at IS NULL;

-- ---- RLS (tenant isolation; USING also gates INSERT WITH CHECK) -------------------------
ALTER TABLE leave_request          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_request          FORCE  ROW LEVEL SECURITY;
ALTER TABLE contact_change_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_change_request FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON leave_request          USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON contact_change_request USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- +goose Down
DROP TABLE IF EXISTS contact_change_request;
DROP TABLE IF EXISTS leave_request;
