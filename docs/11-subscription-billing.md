# 11 — Subscription & Billing

Each **tenant (school)** buys a subscription to use VED. The school admin submits
proof of payment (transaction ID + method + amount + screenshot); it lands in the
**platform superadmin** queue; superadmin verifies and the tenant is activated via a
**signed license** ([01](./01-overview.md)). This doc makes that concrete and lists
the features worth adding around it.

## Current (manual) flow — formalized

```
Admin registers school
  → picks a PLAN (tier + billing cycle)
  → submits PAYMENT PROOF (txn id, method, amount, payer, date, screenshot)
  → status = PENDING_VERIFICATION   (lands in platform superadmin queue)
  → superadmin: APPROVE | REJECT(reason) | REQUEST_INFO
  → on APPROVE: subscription ACTIVE + signed LICENSE issued + invoice sent to school
```

This is the recurring continuation of the registration state machine in
[01](./01-overview.md): `PENDING_PAYMENT_REVIEW → ACTIVE`.

## Subscription lifecycle (state machine)

```
TRIAL ─submit─▶ PENDING_VERIFICATION ─approve─▶ ACTIVE
   │                     │ reject                  │ period ends, unpaid
   │                     ▼                          ▼
   └────────────▶ (back to TRIAL/PENDING)        GRACE  ─grace ends─▶ SUSPENDED
                                                   │ renew-approved      │
                                                   └──────▶ ACTIVE       ▼
                                                                      EXPIRED → ARCHIVED
                              (also: UPGRADE / DOWNGRADE / CANCELLED)
```

> **Trust principle — never hold a school's data hostage.** On SUSPENDED/EXPIRED the
> system degrades to **read-only + export**, it does **not** delete or lock people out
> of their own records. Data is archived (not erased) only after a long retention
> window. This is both ethical and a strong sales/renewal argument.

## Data model

```
# ── Plans & pricing (all created/edited by the platform SUPERADMIN) ──
subscription_plan   (id, name, tier, currency, is_custom, is_active,
                     trial_days,                  -- free-trial length, superadmin-set
                     limits{max_students, max_staff})
plan_price          (plan_id, billing_cycle ∈ {MONTHLY, QUARTERLY, ANNUAL},
                     amount, discount_pct)        -- annual cheaper per month
feature             (key, name, description)      -- platform catalog of gateable features
plan_entitlement    (plan_id, feature_key, value) -- which features a plan grants
addon               (id, feature_key, price, billing_cycle) -- paid extra features
reminder_policy     (id, scope ∈ {GLOBAL, plan_id}, -- superadmin-set reminder schedule
                     offsets_days[],              -- e.g. [7,3,1] = days before expiry
                     also_in_grace, channels[])

# ── A tenant's subscription ──
subscription        (id, tenant_id, plan_id, status, billing_cycle,
                     current_period_start, current_period_end,
                     trial_end?, seats, grace_until?, cancelled_at?)
subscription_addon  (subscription_id, addon_id, price)

# ── Payment proof → verification ──
payment_submission  (id, tenant_id, subscription_id, amount, currency, method,
                     txn_id UNIQUE,           -- prevents reusing a transaction
                     payer_name, paid_at, proof_file_id, proof_hash,
                     status ∈ {PENDING, APPROVED, REJECTED, INFO_REQUESTED},
                     reviewed_by, reviewed_at, reject_reason)

# ── Invoice (issued to tenant admin on approval) ──
subscription_invoice(id, tenant_id, subscription_id, number, period,
                     subtotal, discount, tax, total, status, issued_at, pdf_file_id)
invoice_line        (invoice_id, description, amount)  -- plan + add-ons + discount

# ── Enforcement + notifications + audit ──
license             (id, tenant_id, subscription_id, signed_token, plan,
                     limits, entitlements, issued_at, expires_at, grace_days, revoked)
notification_log    (id, tenant_id, subscription_id, kind, period_ref, sent_at,
                     channel)                 -- dedupes reminders: each offset fires once
billing_audit       (append-only, hash-chained — who verified/changed what, when)
```

`txn_id UNIQUE` + `proof_hash` stop the same screenshot/transaction being submitted
twice. The billing audit log follows the same immutable, hash-chained, cloud-
replicated pattern as finance ([10](./10-finance-payments.md)) and sync
([08](./08-offline-sync.md)).

## License = the enforcement token

The signed license encodes **plan, seat/student limits, enabled modules, expiry,
grace days**. The school node validates it **offline**. Enforcement is graceful:

- Over seat/student limit → **soft warn**, then block *new* creations (never touch
  existing data).
- Module not in plan → feature hidden/locked.
- Past expiry → grace countdown → read-only → archive (per the trust principle above).

---

## Everything here is superadmin-configured (not hardcoded)

The platform superadmin owns all of these as **editable data**, no deploy needed:

- **Plans** — tiers, limits, and which features each grants.
- **Prices per cycle** — `plan_price` rows for MONTHLY / QUARTERLY / ANNUAL, with the
  **annual discount** (`discount_pct`). Annual is cheaper per month to reward prepay.
- **Free-trial length** — `plan.trial_days`, set per plan by the superadmin.
- **Reminder schedule** — `reminder_policy.offsets_days` (see below).
- **Feature catalog & entitlements** — what features exist and which plan unlocks them.

## Feature-based plans (future-ready, built in now)

A plan is a **bundle of entitlements**, not a fixed tier. Each `plan_entitlement`
grants a `feature_key` (e.g. `module.transport`, `reports.advanced`,
`students.bulk_import`), optionally with a limit value. The **license** carries a
snapshot of these entitlements, and the app/node **gates features on them**.

Because plans are just entitlement bundles, a future "special-features plan" is
**pure data** — add the feature to the catalog, attach it to a plan or sell it as an
add-on. No schema or code change. This is the seam that makes feature-based pricing
free later, exactly as you described.

## Renewal reminder engine

The superadmin sets **when** reminders fire via `reminder_policy.offsets_days` — a
list of "days before expiry." Example, a 30-day subscription with
`offsets_days = [2, 1, 0]`:

```
current_period_end = day 30
   day 28  → "2 days left"
   day 29  → "1 day left"
   day 30  → "expires today"
   (if also_in_grace)  day 31+ → "in grace — N days until suspension"
```

A **daily background job** (River) runs once per day:

```
for each ACTIVE / GRACE subscription:
    d = days_until(current_period_end)
    if d ∈ policy.offsets_days  AND  notification_log has no row for (sub, period, d):
        notify(tenant_admin, policy.channels)   # in-app banner + email/SMS
        notification_log.insert(sub, period, d, channel)
```

`notification_log` (keyed by subscription + period + offset) guarantees **each
reminder is sent exactly once per period**, even if the job runs twice or a node
reconnects after being offline. Change `offsets_days` to `[7,3,1]` and every school
on that policy immediately gets the new schedule — no code change.

## Invoice on approval + billing history

When the superadmin **verifies** a payment submission:

1. The subscription advances (`PENDING_VERIFICATION → ACTIVE`, period extended by the
   billing cycle) and a fresh **license** is issued.
2. A **`subscription_invoice`** is generated — line items for the plan + any add-ons,
   minus the annual discount, plus tax — given a **gapless invoice number**, rendered
   to **PDF**, and **delivered to the tenant admin** (in-app + email).
3. The tenant admin's **Billing → History** page lists **all past transactions**:
   every invoice and payment submission with date, amount, billing cycle, method,
   transaction id, status, and a PDF download. This is the school's complete record of
   what it has paid VED.

Since invoices and submissions are **immutable rows**, the history doubles as the
school's own audit trail — and ours — of every subscription payment.

## Extra features worth adding

### Tier 1 — add now (cheap, high value)

| Feature | Why |
|---|---|
| **Plans & tiers** (Basic/Standard/Premium) with feature + limit gates | Turns the license into a real product lever; modules map straight to gates |
| **Billing cycles** monthly / quarterly / annual, annual discounted | Annual prepay improves cash flow and retention |
| **Free trial** (X days, full features) | Lets schools migrate their data before paying — drives adoption |
| **Verification queue** with approve / reject(reason) / request-info | Makes manual review fast and auditable |
| **Duplicate txn-id / proof-hash detection** | Stops fraud/reuse of payment proof |
| **Subscription invoice/receipt to the school** | Schools need a document for *their* books |
| **Renewal reminders** (in-app + email/SMS) at T-30 / T-7 / T-1 and in grace | Reduces involuntary churn; biggest revenue saver |
| **Expiry banner + grace countdown** in the app | No surprises; nudges renewal |
| **Read-only-on-expiry (never lock data)** | Trust + legal safety |

### Tier 2 — fast-follow

| Feature | Why |
|---|---|
| **Add-on modules** (transport, hostel, library as paid extras) | Upsell without forcing a higher tier |
| **Upgrade / downgrade with proration** | Schools grow mid-year |
| **Coupons / promo / referral discounts** | Acquisition & loyalty |
| **Per-student / per-seat pricing option** | Fairer for small schools, scales for large |
| **Custom / enterprise plans** | Big schools/boards negotiate |
| **Multi-school billing** (one owner, many schools — consolidated or per-school, volume discount) | Matches the multi-tenant-membership future ([03](./03-multi-tenancy.md)) |
| **Platform billing dashboard** (MRR/ARR, active/trial/churned, pending verifications, upcoming renewals, revenue by plan) | Run the business |
| **Tax/GST on invoices** | Region-dependent compliance |

### Tier 3 — automation (design the seam now, build later)

| Feature | Why |
|---|---|
| **Real payment gateway** (Razorpay / Stripe / Paystack) | Auto-verify + auto-renew; the manual flow is just the pre-gateway stage of the *same* state machine |
| **Webhook reconciliation** gateway → subscription | Hands-off renewals |
| **Self-serve plan changes & card-on-file** | Removes superadmin from the loop |
| **Reseller / partner billing** | Distribution channel |
| **Usage metering** (if any usage-based pricing) | Future pricing flexibility |

> **Key design seam:** the manual proof flow and a future gateway are the **same
> subscription state machine** — only the `PENDING_VERIFICATION → ACTIVE` transition
> changes from *superadmin clicks approve* to *gateway webhook confirms*. Build the
> state machine + license issuance cleanly now and the gateway drops in later with no
> rework.

## Notifications

- **To school admin:** proof received · approved · rejected(reason) · info requested ·
  expiring soon · in grace · expired/read-only · renewed · invoice issued.
- **To platform superadmin:** new submission pending · verification SLA breaching ·
  renewals due this week.

## Build order (slots into [07 — Roadmap](./07-roadmap.md) Phase 4)

1. Superadmin plan management (plans, `plan_price` per cycle + annual discount,
   `trial_days`, feature catalog + entitlements) + subscription state machine +
   license issuance (entitlement snapshot).
2. Payment-proof submission (txn id, method, amount, screenshot→MinIO, proof hash) +
   verification queue + duplicate detection + billing audit log.
3. Subscription invoice + read-only-on-expiry enforcement.
4. Renewal reminders + expiry/grace banners.
5. (T2) Add-ons, proration, coupons, multi-school billing, platform dashboard.
6. (T3) Payment gateway + webhooks behind the same state machine.
