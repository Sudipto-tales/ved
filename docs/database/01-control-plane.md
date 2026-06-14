# Database — Control Plane (cloud-only)

These tables run the **platform** side of VED: school registration, subscription
billing, payment-proof verification, tenant provisioning, and licensing
([02](../02-architecture.md), [01](../01-overview.md)). They live **only in the
central cloud**, in their own schema/namespace, and are owned by the platform
superadmin — never a tenant admin.

**They are not tenant-scoped.** Unlike every table in the tenant-plane slices, these
carry **no `tenant_id`, no RLS policy, and no sync columns** (`hlc`, `version`,
`origin_node_id`, `deleted_at`) — they never ride the NATS sync stream to a node.
They **do** keep UUIDv7 primary keys (`id`) and `created_at` / `updated_at`, so the
shared column block in [00-conventions.md](./00-conventions.md) does **not** apply
here beyond those four columns. Each table below is marked **(control-plane)**.

---

## Registration state machine

The school admin self-registers; the platform superadmin reviews. This row drives the
registration state machine from [01](../01-overview.md) until a `tenant` is
provisioned and a subscription goes `ACTIVE`.

```
school_registration  (control-plane)
  id                  UUIDv7 PK
  school_name         -- requested display name
  slug                -- requested tenant slug (validated, lower-kebab)
  admin_name
  admin_email         UNIQUE  -- the future tenant owner
  admin_phone?
  status ∈ {ADMIN_REGISTERED, ONBOARDING, PENDING_PAYMENT_REVIEW,
            ACTIVE, REJECTED, SUSPENDED}
  requested_plan_id?  → plan_catalog   -- plan picked during onboarding
  reject_reason?      -- set on REJECTED
  tenant_id?          → tenant         -- set once provisioned (ACTIVE)
  created_at, updated_at
```

`ADMIN_REGISTERED → ONBOARDING → PENDING_PAYMENT_REVIEW → ACTIVE`; superadmin may
`REJECT(reason)` or later `SUSPEND`. Recurring renewals reuse this transition via
[11](../11-subscription-billing.md).

## Tenant directory

The canonical list of every school the platform knows about. A node is bound to
exactly one `tenant.id`; the slug is the stable public handle.

```
tenant  (control-plane)
  id              UUIDv7 PK
  slug            UNIQUE, IMMUTABLE   -- never changes after provisioning
  name
  status ∈ {PROVISIONED, ACTIVE, SUSPENDED, OFFBOARDED}
  provisioned_at?
  created_at, updated_at
```

## Plans & pricing

Superadmin-owned catalog of subscription plans; the source for what a `subscription`
and the issued `license` may grant. See [11](../11-subscription-billing.md) for the
full plan/price/entitlement model.

```
plan_catalog  (control-plane)
  id              UUIDv7 PK
  name
  tier
  currency
  price           -- price for the plan's billing cycle
  billing_cycle ∈ {MONTHLY, QUARTERLY, ANNUAL}
  seats           -- max_students / max_staff limit
  enabled_modules -- JSON: entitlement/feature keys this plan grants
  is_active
  created_at, updated_at
```

## Subscription

One row per tenant subscription; the state machine in
[11](../11-subscription-billing.md). Period dates drive the renewal-reminder job.

```
subscription  (control-plane)
  id                    UUIDv7 PK
  tenant_id             → tenant
  plan_id               → plan_catalog
  status ∈ {TRIAL, PENDING_VERIFICATION, ACTIVE, GRACE,
            SUSPENDED, EXPIRED, CANCELLED, ARCHIVED}
  billing_cycle ∈ {MONTHLY, QUARTERLY, ANNUAL}
  current_period_start
  current_period_end
  trial_end?
  seats
  grace_until?
  cancelled_at?
  created_at, updated_at
```

## Subscription invoice

Issued to the tenant admin on each approval; immutable record for the school's books
([11](../11-subscription-billing.md)).

```
subscription_invoice  (control-plane)
  id              UUIDv7 PK
  tenant_id       → tenant
  subscription_id → subscription
  number          UNIQUE  -- gapless, sequential
  period
  subtotal, discount, tax, total
  status ∈ {ISSUED, PAID, VOID}
  pdf_file_id     -- MinIO storage key for rendered PDF
  issued_at
  created_at, updated_at
```

## Payment proof

The manual screenshot-based proof the school admin uploads; lands in the superadmin
verification queue. `txn_id` + `proof_hash` block reusing a transaction/screenshot.

```
payment_proof  (control-plane)
  id              UUIDv7 PK
  tenant_id       → tenant
  subscription_id → subscription
  amount, currency
  method
  txn_id          UNIQUE
  payer_name
  paid_at
  storage_key     -- MinIO object for the uploaded screenshot
  proof_hash      -- dedupes the same image
  status ∈ {PENDING, APPROVED, REJECTED, INFO_REQUESTED}
  reviewed_by?    -- platform superadmin
  reviewed_at?
  reject_reason?
  created_at, updated_at
```

## License

The signed enforcement token issued to a node on approval. The node validates it
**offline** and honors the last valid license through a grace window
([01](../01-overview.md), [11](../11-subscription-billing.md)).

```
license  (control-plane)
  id              UUIDv7 PK
  tenant_id       → tenant
  subscription_id → subscription
  plan
  seats           -- seat/student limit snapshot
  enabled_modules -- entitlement snapshot the node gates features on
  signed_token    -- the signed license blob
  signature       -- platform signature (node verifies)
  node_id?        -- node binding (set when bound to a node)
  issued_at
  expires_at
  grace_days
  revoked
  created_at, updated_at
```

---

## How the chain links

1. **Register** — `school_registration` rises `ADMIN_REGISTERED → ONBOARDING`; the
   admin picks a `plan_catalog` row.
2. **Submit proof** — admin uploads a `payment_proof` (screenshot → MinIO
   `storage_key`); registration → `PENDING_PAYMENT_REVIEW`, proof `status = PENDING`.
3. **Review** — superadmin sets `payment_proof.status = APPROVED | REJECTED |
   INFO_REQUESTED`, stamping `reviewed_by` / `reviewed_at`.
4. **Activate** — on approval the `tenant` is provisioned (`PROVISIONED → ACTIVE`),
   `subscription.status` advances to `ACTIVE` with its period extended, and a
   `subscription_invoice` is generated for the tenant admin.
5. **Issue license** — a fresh `license` is signed (plan + seats + `enabled_modules`
   snapshot, `expires_at`, `grace_days`) and delivered to the node, which enforces it
   offline. Renewals replay steps 2–5 via [11](../11-subscription-billing.md).
```