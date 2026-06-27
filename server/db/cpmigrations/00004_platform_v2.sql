-- Control-plane migration #4 — Super-Admin Platform v2 (M9, docs/promts.md).
--
-- Adds the columns the v2 super-admin surface needs:
--   * license lifecycle  — a status state machine + auto-renew + end-of-cycle cancel,
--     beyond the original boolean `revoked` (kept as a node-compat mirror).
--   * payment-proof clarification — the note that accompanies the INFO_REQUESTED state
--     (the status value already exists in the CHECK constraint).
--   * plan catalog — annual price + an ACTIVE/ARCHIVED status (the Plans & Prices grid
--     shows monthly + annual + status; archive hides a plan without deleting history).
--
-- Control-plane convention (docs/database/01): no tenant_id/RLS/sync columns. Plain DDL.
-- Analytics endpoints compute on-the-fly from existing rows — no new tables this round.

-- +goose Up
ALTER TABLE control_plane.license
    ADD COLUMN IF NOT EXISTS status               text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','SUSPENDED','EXPIRED','CANCELLED','TRIAL')),
    ADD COLUMN IF NOT EXISTS auto_renew           boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz,
    ADD COLUMN IF NOT EXISTS superseded_by        uuid REFERENCES control_plane.license (id);

-- Backfill: any previously revoked license maps to CANCELLED.
UPDATE control_plane.license SET status = 'CANCELLED' WHERE revoked AND status = 'ACTIVE';

ALTER TABLE control_plane.payment_proof
    ADD COLUMN IF NOT EXISTS clarification_note text;

-- "Send Reminder" records when the superadmin last nudged a pending registration
-- (email delivery is a later infra concern; this is the audit-friendly timestamp).
ALTER TABLE control_plane.school_registration
    ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

ALTER TABLE control_plane.plan_catalog
    ADD COLUMN IF NOT EXISTS annual_price numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE','ARCHIVED'));

-- +goose Down
ALTER TABLE control_plane.plan_catalog
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS annual_price;
ALTER TABLE control_plane.school_registration
    DROP COLUMN IF EXISTS reminded_at;
ALTER TABLE control_plane.payment_proof
    DROP COLUMN IF EXISTS clarification_note;
ALTER TABLE control_plane.license
    DROP COLUMN IF EXISTS superseded_by,
    DROP COLUMN IF EXISTS cancelled_at,
    DROP COLUMN IF EXISTS cancel_at_period_end,
    DROP COLUMN IF EXISTS auto_renew,
    DROP COLUMN IF EXISTS status;
