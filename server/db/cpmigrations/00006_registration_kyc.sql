-- Control-plane migration #6 — Registration KYC / Risk / Source (M11, docs/promts.md
-- "Additional Registration Features").
--
-- Enriches school_registration with the three superadmin review signals:
--   * KYC verification — business-registration number, GST number, free-form notes, and
--     a VERIFIED/PENDING/REJECTED status the superadmin sets during review.
--   * Risk score — a LOW/MEDIUM/HIGH triage computed at registration time from cheap
--     heuristics (free-email domain, duplicate email/slug, registration velocity);
--     `risk_factors` keeps the human-readable reasons behind the score.
--   * Source tracking — where the request came from (WEBSITE/REFERRAL/CAMPAIGN/DIRECT),
--     with an optional free-text detail (campaign id, referrer slug, …).
--
-- Control-plane convention (docs/database/01): no tenant_id/RLS/sync columns. Plain DDL.
-- All columns are nullable / defaulted so existing rows backfill cleanly.

-- +goose Up
ALTER TABLE control_plane.school_registration
    ADD COLUMN IF NOT EXISTS kyc_status        text NOT NULL DEFAULT 'PENDING'
        CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED')),
    ADD COLUMN IF NOT EXISTS kyc_business_reg  text,
    ADD COLUMN IF NOT EXISTS kyc_gst           text,
    ADD COLUMN IF NOT EXISTS kyc_notes         text,
    ADD COLUMN IF NOT EXISTS kyc_reviewed_by   uuid REFERENCES control_plane.platform_admin (id),
    ADD COLUMN IF NOT EXISTS kyc_reviewed_at   timestamptz,
    ADD COLUMN IF NOT EXISTS risk_score        text NOT NULL DEFAULT 'LOW'
        CHECK (risk_score IN ('LOW','MEDIUM','HIGH')),
    ADD COLUMN IF NOT EXISTS risk_factors      jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'DIRECT'
        CHECK (source IN ('WEBSITE','REFERRAL','CAMPAIGN','DIRECT')),
    ADD COLUMN IF NOT EXISTS source_detail     text;

-- +goose Down
ALTER TABLE control_plane.school_registration
    DROP COLUMN IF EXISTS source_detail,
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS risk_factors,
    DROP COLUMN IF EXISTS risk_score,
    DROP COLUMN IF EXISTS kyc_reviewed_at,
    DROP COLUMN IF EXISTS kyc_reviewed_by,
    DROP COLUMN IF EXISTS kyc_notes,
    DROP COLUMN IF EXISTS kyc_gst,
    DROP COLUMN IF EXISTS kyc_business_reg,
    DROP COLUMN IF EXISTS kyc_status;
