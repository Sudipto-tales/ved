# 10 — Finance, Payments & Audit

The financial module is where "no data loss" and "audit-safe" stop being nice words
and become a hard design constraint. A school's books must be **immutable,
reconstructable, and reconcilable**. This doc defines how.

## The two non-negotiable rules

1. **Money records are append-only. Never edit or delete a payment, invoice, or
   ledger entry.** Corrections are made by **reversal / contra entries** that
   reference the original. The original is preserved forever.
2. **The student account is a ledger, not a balance field.** The outstanding
   amount is *derived* by summing immutable entries — never stored as a mutable
   number that code overwrites.

These two rules are exactly the "append-only, event-sourced ledger" promised in
[08 — Offline & Sync](./08-offline-sync.md). They make finance both sync-safe
(no LWW can lose a payment) and audit-safe (no entry can silently vanish).

---

## Payment types in a school (the full map)

### Inflows — money IN

| Category | Examples | Trait |
|---|---|---|
| Academic fees | Tuition, term/monthly fees | Recurring |
| One-time fees | Admission, registration, re-admission | One-time |
| Examination | Exam fee, re-exam/supplementary | Periodic |
| Facility fees | Transport, hostel, mess, library, lab, sports | Recurring, opt-in |
| Sales | Uniform, books, stationery, ID card | One-time |
| Event/activity | Field trips, annual day, competitions | Ad-hoc |
| Penalties | Late-payment fine, library fine, damage fine | Rule/manual |
| Service fees | Certificate/transcript/TC issuance | Ad-hoc |
| **Refundable** | Caution money, security deposit | **Liability — must be refunded** |
| Voluntary | Donations, contributions | Ad-hoc |

### Reductions — not cash, but change what's owed

| Type | Examples |
|---|---|
| Concession / discount | Sibling, staff-ward, merit, need-based, early-bird |
| Scholarship | Internal or external-funded |
| Waiver | Full/partial forgiveness of a head |
| Write-off | Bad debt (uncollectable), with approval |

### Outflows — money OUT (Tier 2 finance scope)

| Category | Examples |
|---|---|
| Refunds | Deposit return, withdrawal refund, overpayment |
| Payroll | Staff salaries |
| Vendor / expense | Supplies, utilities, maintenance, services |
| Scholarship disbursement | Paid out to/for students |

> **Scope decision:** Tier-1 finance = **student fee collection + concessions/fines
> + refunds + audit + reports**. Tier-2 adds **expenses, vendor, payroll**. Full
> **double-entry GL + chart of accounts** is Tier-3, only if the school needs formal
> bookkeeping rather than fee management. The model below supports growing into it.

---

## Core domain model

### Configuration (set up once per academic year)

```
fee_head            (id, tenant_id, name, kind, refundable, taxable)
                     kind ∈ {RECURRING, ONE_TIME, PENALTY, DEPOSIT, SALE}
fee_structure       (id, tenant_id, academic_year_id, applies_to:
                     class/section/category, status)
fee_structure_line  (structure_id, fee_head_id, amount, frequency)
                     frequency ∈ {MONTHLY, TERM, QUARTERLY, ANNUAL, ONE_TIME}
fee_schedule        (structure_id, installment_no, due_date, portion)
concession_scheme   (id, tenant_id, name, basis:%/flat, applies_to_head?, rules)
fine_rule           (id, tenant_id, trigger:overdue, grace_days, basis:%/flat/slab)
```

### The ledger (immutable, event-sourced — the heart)

```
ledger_entry  (id UUIDv7, tenant_id, student_id,
               direction ∈ {DEBIT, CREDIT},
               fee_head_id, amount, currency,
               source_type ∈ {INVOICE, PAYMENT, CONCESSION, FINE, REFUND,
                              REVERSAL, WRITE_OFF, OPENING_BALANCE},
               source_id,                 -- the document that created this entry
               reverses_entry_id?,        -- set only on REVERSAL entries
               hlc, origin_node_id,       -- sync metadata ([08])
               created_by, created_at)    -- WHO + WHEN (immutable)
```

- A **charge** (invoice line, fine) = `DEBIT`. A **payment, concession, write-off** =
  `CREDIT`. A **refund** = `DEBIT` (reduces the credit balance).
- **Outstanding = Σ DEBIT − Σ CREDIT** for the student. Always derived, never stored.
- **Corrections** insert a `REVERSAL` entry pointing at `reverses_entry_id`. Nothing
  is ever updated or deleted.

### Demand / billing

```
invoice       (id UUIDv7, tenant_id, student_id, academic_year_id, period,
               status ∈ {DRAFT, ISSUED, PARTLY_PAID, PAID, OVERDUE, CANCELLED},
               issued_at, due_date, ...)         -- status derived from ledger
invoice_line  (invoice_id, fee_head_id, gross, concession, fine, net)
```

Invoices are generated from `fee_structure` + `fee_schedule` per student per period.
Issuing an invoice writes its `DEBIT` ledger entries. A cancelled invoice is
reversed, not deleted.

### Receipts / payments (immutable)

```
payment            (id UUIDv7, tenant_id, student_id,
                    receipt_no,             -- GAPLESS sequential, per tenant
                    amount, currency, method, paid_at,
                    collected_by, node_id,  -- WHO + WHERE collected
                    status ∈ {RECORDED, CLEARED, BOUNCED, VOIDED},
                    voided_by?, void_reason?, reverses_payment_id?)
payment_allocation (payment_id, invoice_id?, fee_head_id, amount)
                    -- applies one payment across invoices/heads; supports
                    -- PARTIAL and ADVANCE (unallocated) payments
cheque             (payment_id, cheque_no, bank, status, cleared_at, bounced_at)
online_txn         (payment_id, gateway, gateway_ref, status)
```

- **Receipt numbers are gapless and sequential per tenant** (legal/audit
  requirement). Generated by a per-tenant counter; on the local node, prefix with
  the `node_id` or use a node-assigned block so two nodes never reuse a number.
- A payment is **never deleted**. To cancel: set `VOIDED` + reason + `voided_by`
  (requires `payment.void` permission) **and** insert a `REVERSAL` ledger entry. The
  original receipt stays in the register, marked void.
- **Cheque lifecycle**: `RECORDED → CLEARED` or `→ BOUNCED`. A bounced cheque inserts
  a reversal + optional bounce fine.

### Adjustments (all maker-checker for sensitive amounts)

```
concession_grant (id, tenant_id, student_id, fee_head_id, amount/%, scheme_id,
                  reason, requested_by, approved_by?, status) -> CREDIT on approve
fine_charge      (id, ..., rule_id?, amount, reason)          -> DEBIT
refund           (id, ..., amount, method, reason,
                  requested_by, approved_by?, status)         -> DEBIT on approve
write_off        (id, ..., amount, reason, approved_by)        -> CREDIT
```

### Cash management (Tier 2)

```
cash_session     (id, tenant_id, cashier_id, opened_at, opening_float,
                  closed_at?, counted_total?, expected_total?, variance?)
bank_deposit     (id, ..., amount, deposited_at, slip_ref)
reconciliation   (id, ..., statement_ref, matched_payment_ids[], status)
```

A cashier opens a session, collects, then **closes** it — counted vs expected cash is
reconciled and variance recorded. This is the daily-close control.

---

## Audit system

| Control | How |
|---|---|
| **Immutability** | No UPDATE/DELETE on `payment`, `invoice`, `ledger_entry`. Corrections = reversal entries. Enforced at the repository layer + DB trigger that blocks updates on these tables. |
| **Full trail** | Every financial record carries `created_by`, `created_at`, `node_id`. Sensitive actions (void, refund, write-off, concession) also store `requested_by` + `approved_by` + `reason`. |
| **Tamper-evidence** | A dedicated `financial_audit_log` is **append-only and hash-chained** (each row stores the hash of the previous), and is **replicated to the cloud** ([08](./08-offline-sync.md)). Any deletion/edit breaks the chain and is detectable. |
| **Maker-checker** | `concession.grant` vs `concession.approve`, `refund.request` vs `refund.approve`, `payment.void` requires supervisor permission. Thresholds configurable ([05](./05-rbac.md)). The person who creates can't approve their own. |
| **Gapless receipts** | Sequential per-tenant numbering means a missing receipt number is itself an audit flag. |
| **Reconstructable** | Because the ledger is the sum of immutable events, the entire financial state at any past date is recomputable by replaying entries up to that date. |
| **Reconciliation** | Daily cash close (counted vs expected) + bank reconciliation catch real-world discrepancies. |

---

## Reports (derived from the ledger — all as-of any date)

- **Daily collection** — by date range, payment mode, fee head, class, collector.
- **Outstanding / dues** with **aging buckets** (0–30 / 31–60 / 60+ days).
- **Defaulters list** per class/section.
- **Student ledger statement** — full charge/payment history, PDF.
- **Concession register**, **Fine register**, **Refund register**.
- **Receipt register** (gapless, includes voids).
- **Cash book / day book** + **cash session reconciliation**.
- **Bank reconciliation** status.
- **Income vs Expense** (Tier 2).
- **Deposit liability** — outstanding refundable deposits held.

---

## Finance permissions ([05](./05-rbac.md) catalog additions)

```
fee.structure.manage     fee.head.manage        concession.scheme.manage
invoice.generate         invoice.view
payment.record           payment.void           payment.view
concession.grant         concession.approve     # maker / checker
refund.request           refund.approve         # maker / checker
fine.manage              writeoff.approve
cash.session.manage      cash.reconcile
report.finance.view      report.finance.export
expense.manage           vendor.manage          payroll.manage   # Tier 2
```

### Separation-of-duties example

| Role | Permissions |
|---|---|
| Cashier | `payment.record`, `payment.view`, `invoice.view`, `cash.session.manage` |
| Accountant | + `payment.void`, `cash.reconcile`, `report.finance.*`, `concession.approve`, `refund.approve` |
| Fee Clerk | `invoice.generate`, `concession.grant`, `refund.request`, `fine.manage` |
| School Admin | `tenant.admin` (all) |

The clerk *requests* a concession/refund; the accountant *approves*; the cashier
*collects*; no single person controls a transaction end-to-end. That is the audit
backbone of a school finance system.

---

## Build order (slots into [07 — Roadmap](./07-roadmap.md))

1. Ledger + fee heads + fee structure + invoice generation (DEBIT entries).
2. Payment collection + allocation + gapless receipts (CREDIT entries) + immutability
   triggers + financial audit log.
3. Concessions + fines + maker-checker approvals.
4. Dues/aging + collection + student-ledger reports.
5. Refunds + refundable-deposit tracking.
6. Cash close + bank reconciliation.
7. (Tier 2) Expenses + vendor + payroll. (Tier 3) Double-entry GL if needed.
