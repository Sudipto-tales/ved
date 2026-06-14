# 21 — Database Architecture

The principles every table obeys. This is the *architecture*; the concrete per-slice
table designs live in [database/](./database/), and the column-level template all
tables share is [database/00-conventions.md](./database/00-conventions.md).

## Engine & topology

- **PostgreSQL** everywhere — one engine on the node *and* in the cloud, so the same
  migrations and the same RLS run in both places ([03](./03-multi-tenancy.md)).
- **Two deployments of the same schema:**
  - **Node** (per school) — the operational system of record; holds *one* tenant.
  - **Cloud sync hub** — holds *all* tenants' event history (durable backup +
    reporting). RLS matters most here, where tenants coexist.
- **Control-plane tables** (registration, billing, licensing) live **only** in the
  cloud and are *not* tenant-scoped — a separate schema/namespace ([02](./02-architecture.md)).
- Access via **sqlc + pgx** (type-safe, raw SQL, no ORM); migrations via **goose**,
  applied to all tenants in lockstep.

## The five non-negotiables

1. **`tenant_id UUID NOT NULL` on every tenant-scoped table** + an RLS policy
   `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. Isolation is enforced
   by the database, not by remembering a `WHERE` clause ([03](./03-multi-tenancy.md)).
2. **UUIDv7 primary keys**, generated at the node. No auto-increment on synced tables
   — sequences collide across offline nodes ([08](./08-offline-sync.md)).
3. **Sync columns on every synced table**: `hlc`, `version`, `origin_node_id`, plus a
   soft-delete tombstone (`deleted_at`). Add these *from the first migration* even
   while cloud-only — retrofitting later is a rewrite.
4. **Money, attendance, and marks are append-only event ledgers** — never updated in
   place; corrections are reversal/version rows that are *summed*. This is what makes
   them sync-safe and audit-safe ([10](./10-finance-payments.md), [08](./08-offline-sync.md)).
5. **Transactional outbox**: every mutation writes its domain row *and* an `outbox`
   row in the same transaction ([20](./20-dataflow.md)). Plus an `audit_log` row.

## Indexing & performance

- Every table: index on `(tenant_id, …)` leading with `tenant_id` (matches RLS + all
  queries). UUIDv7's time-ordering keeps these indexes healthy (near-append inserts).
- Foreign keys always carry `tenant_id` too, and FKs are composite where it prevents
  cross-tenant references.
- Hot read-models (timetable, dashboards) are cached in **Redis** ([02](./02-architecture.md)),
  derived from the tables — never a second source of truth.
- High-churn append tables (attendance, ledger, outbox, audit) are candidates for
  **monthly/term range partitioning** by created time once volume warrants it.

## Migration strategy (expand / contract)

From [13 — Update Pipeline](./13-update-pipeline.md): use **parallel-change**
migrations so old and new code both work during a rollout.

1. **Expand** — only *add* (new tables, nullable/defaulted columns). Never drop or
   rename something the running version still reads.
2. Deploy code that writes both shapes / reads the new one.
3. **Contract** — remove the old column in a *later* release, after every node has
   upgraded. Critical because offline nodes upgrade on their own schedule.

## Derive, don't store

Outstanding fees, invoice status, attendance %, present-counts, credit totals — all
**derived by summing immutable rows**, never stored as a mutable field a write could
clobber. A stored balance is a sync hazard; a summed ledger is not.

## Data safety

- **Soft deletes** (`deleted_at` tombstone) everywhere — and they propagate as delete
  events so a stale node can't resurrect a row ([08](./08-offline-sync.md)).
- **Per-tenant backups** + local WAL archiving (pgBackRest) on each node; the cloud
  event history is the second independent copy.
- **Encryption at rest** + `pgcrypto`/app-layer envelope encryption for sensitive
  fields (guardian contact, payment proof) ([08](./08-offline-sync.md)).

## How to read the schema docs

Each file in [database/](./database/) covers one slice: its tables, keys,
relationships, and which are append-only. All of them assume the shared column
template in [00-conventions.md](./database/00-conventions.md) rather than repeating it.
