-- Control-plane migration #8 — plan versioning / grandfathered pricing (M11, docs/promts.md
-- "Plan Versioning (Very Important)").
--
-- When a plan's price changes, existing subscribers keep paying their original price while
-- new subscribers get the latest — "grandfathered pricing". We model this as an immutable
-- chain of plan_version rows; a subscription PINS the version it bought (plan_version_id),
-- and new subscriptions bind to the plan's highest (latest) version.
--
-- Plain control-plane tables (docs/database/01): no tenant_id / RLS / sync columns.

-- +goose Up
CREATE TABLE IF NOT EXISTS control_plane.plan_version (
    id             uuid PRIMARY KEY,
    plan_id        uuid NOT NULL REFERENCES control_plane.plan_catalog (id),
    version        int NOT NULL,
    monthly_price  numeric(12,2) NOT NULL DEFAULT 0,
    annual_price   numeric(12,2) NOT NULL DEFAULT 0,
    currency       text NOT NULL DEFAULT 'INR',
    effective_date timestamptz NOT NULL DEFAULT now(),
    status         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plan_version_plan_version_key UNIQUE (plan_id, version)
);
CREATE INDEX IF NOT EXISTS plan_version_plan_idx ON control_plane.plan_version (plan_id, version DESC);

ALTER TABLE control_plane.subscription
    ADD COLUMN IF NOT EXISTS plan_version_id uuid REFERENCES control_plane.plan_version (id);

-- Backfill: every existing plan gets a v1 capturing its current pricing, and every existing
-- subscription is pinned to its plan's v1 (so the chain is consistent from day one).
INSERT INTO control_plane.plan_version (id, plan_id, version, monthly_price, annual_price, currency, effective_date)
SELECT gen_random_uuid(), pc.id, 1, pc.price, pc.annual_price, pc.currency, pc.created_at
  FROM control_plane.plan_catalog pc
 WHERE NOT EXISTS (SELECT 1 FROM control_plane.plan_version pv WHERE pv.plan_id = pc.id);

UPDATE control_plane.subscription s
   SET plan_version_id = pv.id
  FROM control_plane.plan_version pv
 WHERE pv.plan_id = s.plan_id AND pv.version = 1 AND s.plan_version_id IS NULL;

-- +goose Down
ALTER TABLE control_plane.subscription DROP COLUMN IF EXISTS plan_version_id;
DROP TABLE IF EXISTS control_plane.plan_version;
