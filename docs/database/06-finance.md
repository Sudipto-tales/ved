# Database — Finance

The finance slice of VED. It models student fee configuration, billing, payments,
concessions/fines/refunds, and — at its heart — an **append-only, event-sourced
ledger**. This file refines the schema sketches in [10](../10-finance-payments.md)
into the conventions format; where this and [10](../10-finance-payments.md) appear to
differ, [10](../10-finance-payments.md) wins.

All tables are tenant-scoped: they carry the **base columns + RLS** from
[00](./00-conventions.md) (`id`, `tenant_id`, `created_at`/`created_by`,
`updated_at`/`deleted_at`, `hlc`, `version`, `origin_node_id`). Below we show only the
**domain columns**. `student_id` references the student profile in
[04](./04-people.md).

## The two non-negotiable rules

1. **Money is append-only.** Never UPDATE or DELETE a `payment`, `invoice`, or
   `ledger_entry`. Corrections are made by **reversal rows** that point at the
   original; the original is preserved forever.
2. **The student account is a derived ledger sum, never a stored balance.** The
   amount owed is computed by summing immutable entries — there is no mutable
   `balance` column that code overwrites.

These are exactly the append-only, event-sourced ledger promised in
[08](../08-offline-sync.md): no Last-Writer-Wins merge can ever lose a payment,
and no entry can silently vanish from the audit trail.

Legend (from [00](./00-conventions.md)): `col?` nullable · `col ∈ {A, B}` `TEXT` +
`CHECK` enum · `→ table` foreign key · **(append-only)** ledger table, immutable.

---

## Configuration (set up once per academic year)

Mutable, tenant-scoped tables with the full base-column block.

```
fee_head            (name, kind, refundable, taxable)
                     kind ∈ {RECURRING, ONE_TIME, PENALTY, DEPOSIT, SALE}
                     -- refundable DEPOSIT = a liability we must return later

fee_structure       (academic_year_id → academic_year,
                     applies_to ∈ {CLASS, SECTION, CATEGORY},
                     applies_to_id,            -- the class/section/category targeted
                     status ∈ {DRAFT, ACTIVE, ARCHIVED})

fee_structure_line  (fee_structure_id → fee_structure,
                     fee_head_id → fee_head,
                     amount, currency,
                     frequency ∈ {MONTHLY, TERM, QUARTERLY, ANNUAL, ONE_TIME})

fee_schedule        (fee_structure_id → fee_structure,
                     installment_no,           -- 1..N within the structure
                     due_date, portion)        -- portion = fraction/amount due then

concession_scheme   (name, basis ∈ {PERCENT, FLAT}, value,
                     applies_to_head_id? → fee_head, rules)

fine_rule           (trigger ∈ {OVERDUE}, grace_days,
                     basis ∈ {PERCENT, FLAT, SLAB}, value)
```

`UNIQUE (tenant_id, fee_structure_id, installment_no)` on `fee_schedule`;
indexes lead with `tenant_id` per [00](./00-conventions.md).

---

## The ledger — `ledger_entry` **(append-only)**

The heart of the slice. Immutable and event-sourced: it has `created_at` /
`created_by` but **no `updated_at` / `deleted_at`**. Never UPDATEd or DELETEd.

```
ledger_entry  **(append-only)**
  (student_id → student ([04](./04-people.md)),
   direction ∈ {DEBIT, CREDIT},
   fee_head_id → fee_head,
   amount, currency,
   source_type ∈ {INVOICE, PAYMENT, CONCESSION, FINE, REFUND,
                  REVERSAL, WRITE_OFF, OPENING_BALANCE},
   source_id,                 -- the document (invoice/payment/…) that created this
   reverses_entry_id? → ledger_entry,   -- set ONLY on REVERSAL rows
   hlc, origin_node_id,       -- sync metadata ([08](../08-offline-sync.md))
   created_by, created_at)    -- WHO + WHEN, immutable
```

- A **charge** (invoice line, fine) = `DEBIT`. A **payment, concession, write-off** =
  `CREDIT`. A **refund** = `DEBIT` (it reduces the credit balance).
- **Outstanding = Σ DEBIT − Σ CREDIT** for the student. Always *derived* by summing
  these rows, never stored as a balance field.
- **Corrections** insert a `REVERSAL` row with `reverses_entry_id` pointing at the
  original entry and `amount` mirroring it in the opposite `direction`. Nothing is
  ever updated or deleted — the pair nets to zero and both stay in the trail.
- Reconstructable: the financial state as of any past date is recomputed by replaying
  entries up to that date.

> A DB trigger blocks `UPDATE` / `DELETE` on `ledger_entry` (and `payment`,
> `invoice`); immutability is enforced at the DB, not only the repository layer.

---

## Billing — `invoice` / `invoice_line`

`invoice` is **append-only** (immutable demand document); a cancelled invoice is
**reversed**, not deleted. `invoice_line` is its immutable detail.

```
invoice       **(append-only)**
  (student_id → student ([04](./04-people.md)),
   academic_year_id → academic_year,
   period,                    -- the billing period (e.g. month/term)
   status ∈ {DRAFT, ISSUED, PARTLY_PAID, PAID, OVERDUE, CANCELLED},
                              -- DERIVED from the ledger, not authoritative
   issued_at, due_date)

invoice_line
  (invoice_id → invoice,
   fee_head_id → fee_head,
   gross, concession, fine, net)   -- net = gross − concession + fine
```

Invoices are generated from `fee_structure` + `fee_schedule` per student per period.
**Issuing an invoice writes its `DEBIT` ledger entries** (one per line,
`source_type = INVOICE`, `source_id = invoice.id`). The `status` shown is a derived
read of those entries vs. their payments — never the source of truth.

---

## Payments — `payment` **(append-only)**

Immutable receipt record. Has `created_at` / `created_by` but **no `updated_at` /
`deleted_at`**. Never UPDATEd or DELETEd.

```
payment  **(append-only)**
  (student_id → student ([04](./04-people.md)),
   receipt_no,                -- GAPLESS sequential, per tenant
   amount, currency, method,  -- method ∈ {CASH, CHEQUE, CARD, UPI, ONLINE, …}
   paid_at,
   collected_by → membership, -- WHO collected
   node_id → node,            -- WHERE collected
   status ∈ {RECORDED, CLEARED, BOUNCED, VOIDED})
```

`UNIQUE (tenant_id, receipt_no)` per [00](./00-conventions.md).

- **Gapless receipt numbering** is a legal/audit requirement: numbers are sequential
  per tenant with no gaps, so a *missing* number is itself an audit flag. A per-tenant
  counter assigns them; on an offline node ([08](../08-offline-sync.md)), each node
  draws from a **node-assigned block** (or prefixes with `node_id`) so two nodes never
  reuse a number while disconnected.
- **Recording a payment writes a `CREDIT` ledger entry** (`source_type = PAYMENT`,
  `source_id = payment.id`).
- A payment is **never deleted**. To cancel: set `status = VOIDED` (with the reversal
  metadata captured on the adjustment row in [10](../10-finance-payments.md)) **and**
  insert a `REVERSAL` ledger entry that negates the original `CREDIT`. The receipt
  stays in the register, marked void — preserving the gapless sequence.
- **Cheque lifecycle**: `RECORDED → CLEARED` or `→ BOUNCED`; a bounce inserts a
  reversal entry plus an optional bounce fine (`source_type = FINE`).

---

## How money enters the ledger

Every money event creates one or more `ledger_entry` rows; the ledger is the single
derived-from source for every dues/collection report ([10](../10-finance-payments.md)).

| Event | Document row | Ledger effect |
|---|---|---|
| Issue invoice | `invoice` + `invoice_line` | `DEBIT` per line |
| Collect payment | `payment` (gapless receipt) | `CREDIT` |
| Grant concession | adjustment ([10](../10-finance-payments.md)) | `CREDIT` |
| Charge fine | adjustment | `DEBIT` |
| Refund deposit / overpay | adjustment | `DEBIT` |
| Write off bad debt | adjustment | `CREDIT` |
| Void / bounce / correct | — | `REVERSAL` (negates the original) |
| Opening balance on migration | — | `OPENING_BALANCE` (`DEBIT` or `CREDIT`) |

### Guardian online payment (T2 — [18](../18-guardian-portal.md))

When a guardian pays through the portal, the gateway callback writes, in **one
transaction**, a `payment` row (`method = ONLINE`, gapless `receipt_no`, `status` set
from the gateway result) **and** its matching `CREDIT` `ledger_entry`. Like every
write, it also emits an `outbox` event ([08](../08-offline-sync.md)) so the node and
cloud converge. The guardian's "amount due" in the portal is the same derived
**Σ DEBIT − Σ CREDIT** — never a cached balance.

---

## Why this is sync-safe and audit-safe

- **No lost payments:** `payment` and `ledger_entry` are append-only, so the
  per-field Last-Writer-Wins merge of [08](../08-offline-sync.md) never overwrites a
  money row — there is nothing to overwrite.
- **No silent edits:** corrections are visible `REVERSAL` rows, and the DB trigger
  rejects UPDATE/DELETE on the three append-only tables.
- **Reconstructable:** sum the immutable entries up to any date to get the exact
  state then. The balance is always a query, never a stored number.

See [10](../10-finance-payments.md) for adjustments (concession / fine / refund /
write-off), payment allocation, cash sessions, the hash-chained financial audit log,
maker-checker permissions, and reports.
