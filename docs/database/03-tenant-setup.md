# Database — Tenant Setup

The tables a school configures *once* before any people or money exist: its identity
and slug, the academic year/term calendar everything anchors to, the config-driven
dropdowns, rooms, and the document/number-format templates. This is the **tenant**
slice — feature catalog section B ([09](../09-feature-catalog.md)).

All tables below are **tenant-scoped**: they carry the base columns + RLS from
[00-conventions.md](./00-conventions.md) (not repeated here). Only slice-specific
columns are shown. Legend: `col?` nullable · `col ∈ {A, B}` `TEXT`+`CHECK` ·
`→ table` FK.

## `tenant_profile`

The school/college's own profile *inside* its tenant (distinct from the cloud-only
`tenant` control-plane row, [01](./01-control-plane.md)). One row per tenant.

```sql
legal_name        TEXT NOT NULL,
display_name      TEXT NOT NULL,
slug              TEXT NOT NULL,    -- set at provisioning, IMMUTABLE thereafter
institution_type  TEXT NOT NULL,   -- ∈ {SCHOOL, COLLEGE}
logo_storage_key  TEXT?,            -- object key in MinIO ([02]); no blobs in PG
address           JSONB?,           -- lines, city, state, postcode, country
contact_email     TEXT?,            -- the school's real public email
contact_phone     TEXT?
-- UNIQUE (tenant_id, slug)  — and slug is globally reserved at provisioning
```

- **`slug` is chosen once at provisioning and never changes.** It drives the generated
  login handles `{name}.{type}@{slug}.com` ([06](../06-onboarding-credentials.md)), so
  editing it would orphan every existing login identifier. There is no update path for
  it — surfaced read-only in the UI.
- `institution_type` flips school vs college presentation; the academic depth itself is
  the `program`/`program_stage` config in [17](../17-academics-model.md).
- Branding is referenced by `logo_storage_key`, never stored inline.

## `academic_year`

The anchor every dated record hangs from — fees, exams, sections, promotion all
reference an `academic_year_id` ([10](../10-finance-payments.md), [17](../17-academics-model.md)).

```sql
name        TEXT NOT NULL,          -- "2026–27"
start_date  DATE NOT NULL,
end_date    DATE NOT NULL,
is_current  BOOLEAN NOT NULL DEFAULT false
-- UNIQUE (tenant_id, name)
-- partial unique: at most one row per tenant with is_current = true
```

- `is_current` is the default-selected year across the app; the partial unique index
  guarantees exactly one. Year-end promotion opens the next year and flips the flag.

## `term`

Semesters / terms within a year (Term 1/2/3, Sem 1…6). Ordered by `ordinal`.

```sql
academic_year_id  UUID NOT NULL → academic_year,
name              TEXT NOT NULL,    -- "Term 1", "Semester 3"
ordinal           INT  NOT NULL,    -- sort order within the year
start_date        DATE NOT NULL,
end_date          DATE NOT NULL
-- UNIQUE (tenant_id, academic_year_id, ordinal)
-- composite FK carries tenant_id (no cross-tenant year link)
```

## `dropdown_option`

Config-driven values for dynamic dropdowns — designations, student categories,
document types, payment methods, blood groups, and the like — grouped by `category`.

```sql
category   TEXT NOT NULL,           -- "DESIGNATION", "STUDENT_CATEGORY", ...
label      TEXT NOT NULL,           -- shown to the user
value      TEXT NOT NULL,           -- stable machine code referenced elsewhere
ordinal    INT  NOT NULL DEFAULT 0, -- order within the category
active      BOOLEAN NOT NULL DEFAULT true
-- UNIQUE (tenant_id, category, value)
```

- **Why config-driven, not hardcoded enums:** every school names these differently and
  adds its own as it grows. A new designation or category must be a row a School Admin
  inserts (`designation.manage`, [06](../06-onboarding-credentials.md)), not a code
  change + migration + redeploy across offline nodes. Closed, behaviour-bearing sets
  (e.g. `direction ∈ {DEBIT, CREDIT}`) stay as `CHECK` enums; only open,
  school-defined lists live here.
- Retiring an option sets `active = false` so historical references stay resolvable;
  options are referenced by `value`, never deleted out from under existing rows.

## `room`

Physical rooms — referenced by academic sections as their home room and (T2) by the
timetable. **Defined here in tenant setup but consumed by academics**
([17](../17-academics-model.md): `section.room_id → room`).

```sql
name      TEXT NOT NULL,            -- "Lab 2", "10-A"
building  TEXT?,
capacity  INT?,
type      TEXT NOT NULL            -- ∈ {CLASSROOM, LAB, ...}
-- UNIQUE (tenant_id, name)
```

## `document_template`

Templates + **gapless number formats** for the documents the school issues: fee
receipts, transfer/bonafide certificates, ID cards. Backs the receipt-numbering rule
in [10](../10-finance-payments.md) and document generation ([09](../09-feature-catalog.md)).

```sql
kind            TEXT NOT NULL,      -- ∈ {RECEIPT, TC, BONAFIDE, ID_CARD, ...}
name            TEXT NOT NULL,
body            TEXT?,              -- layout template (HTML/markup) for render
layout          JSONB?,            -- ID-card / page layout config
number_format   TEXT?,             -- e.g. "RCP-{YYYY}-{SEQ:00000}"
next_sequence   BIGINT NOT NULL DEFAULT 1,  -- per-template counter
active          BOOLEAN NOT NULL DEFAULT true
-- UNIQUE (tenant_id, kind, name)
```

- `number_format` + `next_sequence` produce **gapless, sequential per-tenant** numbers
  — a missing number is itself an audit flag ([10](../10-finance-payments.md)). The
  counter is allocated under a row lock (or a node-assigned block on a local node so
  two nodes never reuse a number).
- `next_sequence` is the one **deliberately mutable counter** in an otherwise
  derive-don't-store design ([21](../21-database-architecture.md)) — it allocates an
  identifier, it does not store a balance. The issued document itself (the `payment`
  with its `receipt_no`) remains append-only.

## `holiday_calendar` *(T2)*

The academic / holiday calendar — dates that drive working-day and attendance logic.

```sql
date   DATE NOT NULL,
label  TEXT NOT NULL,               -- "Independence Day"
type   TEXT NOT NULL               -- ∈ {HOLIDAY, EXAM, EVENT, VACATION}
-- index (tenant_id, date)
```

## Relationships at a glance

```
tenant_profile  (one per tenant; slug → login handles [06])
academic_year   1 ──< term
academic_year   ──< section / fee_structure / invoice / exam   ([10],[17])
room            ──< section.room_id                            ([17])
dropdown_option (referenced by value: designation, category … [06])
document_template (number_format → gapless receipt_no          [10])
```
