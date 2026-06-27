-- Control-plane migration #9 — AutoPay (M11, docs/promts.md "AutoPay").
--
-- Tracks recurring-payment opt-in per subscription plus the signals the AutoPay analytics
-- cards need: adoption (enabled share), failure rate, and renewal success. A real gateway
-- mandate is future infra; this is the state the console reports on.
--
-- Plain control-plane columns (docs/database/01): no tenant_id / RLS / sync.

-- +goose Up
ALTER TABLE control_plane.subscription
    ADD COLUMN IF NOT EXISTS autopay_enabled      boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS autopay_last_status  text CHECK (autopay_last_status IN ('SUCCESS','FAILED')),
    ADD COLUMN IF NOT EXISTS autopay_failed_count int NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE control_plane.subscription
    DROP COLUMN IF EXISTS autopay_failed_count,
    DROP COLUMN IF EXISTS autopay_last_status,
    DROP COLUMN IF EXISTS autopay_enabled;
