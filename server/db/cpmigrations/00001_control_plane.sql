-- Control-plane migration #1 — the cloud-only platform schema (docs/database/01-control-plane.md).
--
-- These tables run the PLATFORM side: school registration, subscription billing,
-- payment-proof verification, tenant provisioning, licensing. They live in their OWN
-- schema (`control_plane`) and are owned by the platform superadmin — never a tenant.
--
-- Convention (docs/database/01): control-plane tables are NOT tenant-scoped — no
-- tenant_id, no RLS, no sync columns (hlc/version/origin_node_id/deleted_at). They keep
-- UUIDv7 PKs + created_at/updated_at only. They never ride the NATS sync stream.

-- +goose Up
CREATE SCHEMA IF NOT EXISTS control_plane;

-- Platform identity — the superadmin(s). SEPARATE namespace from tenant `users`.
CREATE TABLE IF NOT EXISTS control_plane.platform_admin (
    id            uuid PRIMARY KEY,
    email         text NOT NULL UNIQUE,
    name          text NOT NULL,
    password_hash text NOT NULL,             -- argon2id
    is_superadmin boolean NOT NULL DEFAULT true,
    status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Subscription plan catalog (docs/11). Source of seats + entitlements.
CREATE TABLE IF NOT EXISTS control_plane.plan_catalog (
    id              uuid PRIMARY KEY,
    name            text NOT NULL,
    tier            text NOT NULL,
    currency        text NOT NULL DEFAULT 'INR',
    price           numeric(12,2) NOT NULL DEFAULT 0,
    billing_cycle   text NOT NULL CHECK (billing_cycle IN ('MONTHLY','QUARTERLY','ANNUAL')),
    seats           int NOT NULL DEFAULT 0,
    enabled_modules jsonb NOT NULL DEFAULT '[]',
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Tenant directory — the canonical list of every school. A node binds to one tenant.id.
CREATE TABLE IF NOT EXISTS control_plane.tenant (
    id              uuid PRIMARY KEY,
    slug            text NOT NULL UNIQUE,      -- immutable public handle
    name            text NOT NULL,
    status          text NOT NULL DEFAULT 'PROVISIONED'
                      CHECK (status IN ('PROVISIONED','ACTIVE','SUSPENDED','OFFBOARDED')),
    provisioned_at  timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Registration state machine (docs/01). Drives ADMIN_REGISTERED → … → ACTIVE.
CREATE TABLE IF NOT EXISTS control_plane.school_registration (
    id                uuid PRIMARY KEY,
    school_name       text NOT NULL,
    slug              text NOT NULL,           -- requested tenant slug (lower-kebab)
    admin_name        text NOT NULL,
    admin_email       text NOT NULL UNIQUE,    -- the future tenant owner
    admin_phone       text,
    status            text NOT NULL DEFAULT 'ADMIN_REGISTERED'
                        CHECK (status IN ('ADMIN_REGISTERED','ONBOARDING','PENDING_PAYMENT_REVIEW',
                                          'ACTIVE','REJECTED','SUSPENDED')),
    requested_plan_id uuid REFERENCES control_plane.plan_catalog (id),
    reject_reason     text,
    tenant_id         uuid REFERENCES control_plane.tenant (id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Subscription — one per tenant (docs/11 state machine).
CREATE TABLE IF NOT EXISTS control_plane.subscription (
    id                   uuid PRIMARY KEY,
    tenant_id            uuid NOT NULL REFERENCES control_plane.tenant (id),
    plan_id              uuid NOT NULL REFERENCES control_plane.plan_catalog (id),
    status               text NOT NULL DEFAULT 'PENDING_VERIFICATION'
                           CHECK (status IN ('TRIAL','PENDING_VERIFICATION','ACTIVE','GRACE',
                                             'SUSPENDED','EXPIRED','CANCELLED','ARCHIVED')),
    billing_cycle        text NOT NULL CHECK (billing_cycle IN ('MONTHLY','QUARTERLY','ANNUAL')),
    current_period_start timestamptz,
    current_period_end   timestamptz,
    trial_end            timestamptz,
    seats                int NOT NULL DEFAULT 0,
    grace_until          timestamptz,
    cancelled_at         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Subscription invoice — gapless sequential number; immutable record (docs/11).
CREATE TABLE IF NOT EXISTS control_plane.subscription_invoice (
    id              uuid PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES control_plane.tenant (id),
    subscription_id uuid NOT NULL REFERENCES control_plane.subscription (id),
    number          text NOT NULL UNIQUE,      -- gapless, sequential
    period          text,
    subtotal        numeric(12,2) NOT NULL DEFAULT 0,
    discount        numeric(12,2) NOT NULL DEFAULT 0,
    tax             numeric(12,2) NOT NULL DEFAULT 0,
    total           numeric(12,2) NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','PAID','VOID')),
    pdf_file_id     text,
    issued_at       timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Payment proof — manual screenshot proof in the verification queue (docs/01, docs/11).
CREATE TABLE IF NOT EXISTS control_plane.payment_proof (
    id              uuid PRIMARY KEY,
    registration_id uuid REFERENCES control_plane.school_registration (id),
    tenant_id       uuid REFERENCES control_plane.tenant (id),
    subscription_id uuid REFERENCES control_plane.subscription (id),
    amount          numeric(12,2) NOT NULL,
    currency        text NOT NULL DEFAULT 'INR',
    method          text NOT NULL,
    txn_id          text NOT NULL UNIQUE,      -- blocks reusing a transaction
    payer_name      text,
    paid_at         timestamptz,
    storage_key     text,                      -- MinIO object for the screenshot
    proof_hash      text UNIQUE,               -- dedupes the same image
    status          text NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','APPROVED','REJECTED','INFO_REQUESTED')),
    reviewed_by     uuid REFERENCES control_plane.platform_admin (id),
    reviewed_at     timestamptz,
    reject_reason   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- License — the signed enforcement token issued to a node; validated offline (docs/01).
CREATE TABLE IF NOT EXISTS control_plane.license (
    id              uuid PRIMARY KEY,
    tenant_id       uuid NOT NULL REFERENCES control_plane.tenant (id),
    subscription_id uuid NOT NULL REFERENCES control_plane.subscription (id),
    plan            text NOT NULL,
    seats           int NOT NULL DEFAULT 0,
    enabled_modules jsonb NOT NULL DEFAULT '[]',
    signed_token    text NOT NULL,             -- the signed license blob (base64 JSON)
    signature       text NOT NULL,             -- platform signature (node verifies)
    node_id         uuid,
    issued_at       timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    grace_days      int NOT NULL DEFAULT 14,
    revoked         boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS license_tenant_idx ON control_plane.license (tenant_id, revoked);

-- Gapless counter table — named sequences advanced inside the approval tx (so a rolled-
-- back approval leaves no gap, unlike a Postgres SEQUENCE).
CREATE TABLE IF NOT EXISTS control_plane.counter (
    name  text PRIMARY KEY,
    value bigint NOT NULL DEFAULT 0
);

-- +goose Down
DROP TABLE IF EXISTS control_plane.counter;
DROP TABLE IF EXISTS control_plane.license;
DROP TABLE IF EXISTS control_plane.payment_proof;
DROP TABLE IF EXISTS control_plane.subscription_invoice;
DROP TABLE IF EXISTS control_plane.subscription;
DROP TABLE IF EXISTS control_plane.school_registration;
DROP TABLE IF EXISTS control_plane.tenant;
DROP TABLE IF EXISTS control_plane.plan_catalog;
DROP TABLE IF EXISTS control_plane.platform_admin;
DROP SCHEMA IF EXISTS control_plane;
