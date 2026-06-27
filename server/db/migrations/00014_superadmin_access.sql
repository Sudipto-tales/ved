-- Tenant-plane migration #14 — super-admin access consent (M11 "Login As Tenant",
-- docs/promts.md "Tenant Controlled Access").
--
-- Impersonation is consent-gated and TENANT-owned: the school admin decides whether a
-- platform superadmin may "Login As" for support. The flag lives in the tenant plane
-- (tenant_profile) so the tenant controls it; the control plane only reads it before
-- minting a scoped, short-lived, audited impersonation token. Passwords are never shown.
--
-- Convention (docs/database/00): expand-only; tenant_profile already carries base + sync
-- columns and RLS, so this is a single defaulted column.

-- +goose Up
ALTER TABLE tenant_profile
    ADD COLUMN IF NOT EXISTS allow_superadmin_access boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE tenant_profile
    DROP COLUMN IF EXISTS allow_superadmin_access;
