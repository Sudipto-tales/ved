# Database — Conventions (the shared column template)

Every schema file in this folder assumes these conventions instead of repeating them.
They encode the principles in [../21-database-architecture.md](../21-database-architecture.md).

## The base columns every tenant-scoped table has

```sql
id            UUID        PRIMARY KEY DEFAULT uuidv7(),  -- generated at the node
tenant_id     UUID        NOT NULL,                       -- RLS scope
-- ... slice-specific columns ...
created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
created_by    UUID,                                       -- membership_id of the actor
updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at    TIMESTAMPTZ,                                -- soft-delete tombstone (NULL = live)
-- sync metadata (present from the first migration) --
hlc           TEXT        NOT NULL,                       -- Hybrid Logical Clock
version        BIGINT      NOT NULL DEFAULT 1,
origin_node_id UUID       NOT NULL
```

In the per-slice docs we **omit** these and show only the slice-specific columns, to
keep the tables readable. Assume every table below carries the block above unless it
is explicitly noted as append-only or control-plane.

## RLS — applied to every tenant-scoped table

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <t>
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Control-plane tables (cloud-only: registration, billing, licensing) are **not**
tenant-scoped and live in a separate schema/namespace — they are noted as such.

## Append-only tables (ledgers)

`ledger_entry`, `payment`, `attendance_event`, `mark_entry`, `submission`, `grade`,
`outbox`, `inbox`, `audit_log` are **never UPDATEd or DELETEd**. They have
`created_at`/`created_by` but no `updated_at`/`deleted_at`. Corrections insert a new
row (reversal / new version) that references the original. Derived values are summed
from these rows, never stored.

## Naming

- Tables: singular, snake_case (`teaching_assignment`, not `TeachingAssignments`).
- PK is always `id`; FKs are `<referenced_table>_id` (`section_id`, `student_id`).
- Enums modeled as Postgres `TEXT` + `CHECK (col IN (...))` (cheaper to evolve across
  offline nodes than native `ENUM` types), shown as `col ∈ {A, B, C}`.
- Join tables: `<a>_<b>` (`guardian_student`, `membership_roles`, `role_permissions`).
- Boolean columns read as predicates (`is_primary`, `can_pay`, `must_reset_password`).

## Keys & indexes

- Every index and FK leads with `tenant_id`.
- Unique constraints are scoped to the tenant: `UNIQUE (tenant_id, <natural_key>)`
  (e.g. `UNIQUE (tenant_id, slug)`, `UNIQUE (tenant_id, receipt_no)`).
- FKs reference within the same tenant; composite FKs where needed to prevent
  cross-tenant linkage.

## Identity vs profile

One generic `users` table for auth; **separate profile tables per user type**
(`student`, `teacher`, `employee`, `guardian`). A person's tenant membership and
roles live on `memberships` / `membership_roles`, never duplicated onto the profile
([03](../03-multi-tenancy.md), [05](../05-rbac.md)).

## Legend used in the schema docs

- `col?` — nullable.
- `col ∈ {A, B}` — `TEXT` + `CHECK` enum.
- `→ table` — foreign key.
- **(append-only)** — ledger table; see above.
- **(control-plane)** — cloud-only, not tenant-scoped.
