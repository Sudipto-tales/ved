# 08 — Local Nodes, Offline Operation & Sync

## Goal

Each school runs a **local node** that fully works on its LAN with **no internet**.
When connectivity returns, the node **automatically syncs** with the central cloud,
**bi-directionally**, with **no data loss** and **end-to-end security**.

## Topology

```
                ┌─────────────────────────────────────────┐
                │            CENTRAL CLOUD                  │
                │  Control plane + SYNC HUB                 │
                │  - durable per-tenant event history       │
                │    (system-of-record BACKUP)              │
                │  - cross-school reporting                 │
                │  - license / config push-down             │
                └───────────────▲──────────────▲───────────┘
                   mTLS + NATS JetStream (durable, replayable)
              ┌──────────────────┘              └──────────────────┐
   ┌──────────┴───────────┐              ┌──────────────────┴──────┐
   │   SCHOOL A NODE       │              │   SCHOOL B NODE          │
   │  Go binary + Postgres │              │  Go binary + Postgres    │
   │  = operational source │              │  = operational source    │
   │    of truth for A     │              │    of truth for B        │
   │  serves LAN offline   │              │  serves LAN offline      │
   └──────────▲────────────┘              └──────────────────────────┘
   web / desktop (Tauri) / mobile (Expo) on the school LAN
```

**System-of-record split:**
- The **node** is the operational source of truth for *its own* school's data — all
  reads/writes happen locally, internet or not.
- The **cloud** holds the **full event history** per tenant: a durable backup, the
  sync relay between sites, and the aggregation point for cross-school reporting.

## Two scopes of "offline" (set expectations)

1. **Node ↔ Cloud offline** (primary requirement): the school's internet is down,
   but the LAN node keeps serving every client. ✅ Fully designed here.
2. **Client ↔ Node offline** (secondary, later phase): a teacher's phone has no
   Wi-Fi even to the node. Handled by an on-device cache + outbox on mobile;
   out of scope for v1. Most schools' clients are always on the LAN with the node.

---

## The five pillars of no-data-loss sync

### 1. Transactional Outbox — events can't be lost

Every mutation writes the domain row **and** an event row to an `outbox` table in
the **same DB transaction**:

```sql
BEGIN;
  INSERT INTO students (...) VALUES (...);
  INSERT INTO outbox (id, tenant_id, aggregate, op, payload, hlc, origin_node_id)
         VALUES (...);
COMMIT;
```

Either both commit or neither does. There is no window where a change exists without
its sync event. A separate **relay worker** reads unsent outbox rows and publishes
them — at-least-once — then marks them sent.

### 2. UUIDv7 primary keys — offline-safe identity

All PKs are **UUIDv7** generated **at the node** (time-ordered UUIDs).

- Two nodes creating records while offline **never collide** (no shared sequence).
- Time-ordering keeps indexes healthy and gives natural causal hints.
- **Never use auto-increment integers** for synced tables — they collide across nodes.

### 3. NATS JetStream — durable, replayable transport

- The relay publishes events to **JetStream** subjects, scoped per tenant.
- JetStream **persists** messages and tracks per-consumer **cursors**, so a node
  that was offline for days **replays from where it left off** on reconnect — no
  manual reconciliation.
- At-least-once delivery + the inbox (below) = effectively-once application.

### 4. Inbox + idempotent apply — replays are safe

The receiving side records each consumed event ID in an `inbox` table and applies
inside a transaction:

```
on event e:
  if inbox.contains(e.id): ack & skip        # dedupe (idempotent)
  else:
    BEGIN
      apply(e); inbox.insert(e.id); advance cursor
    COMMIT
  ack
```

Duplicate deliveries and replays are no-ops. The cursor makes sync **resumable**
after a crash.

### 5. Conflict resolution — deterministic, and lossless where it matters

Most school records are **single-writer** (a school owns its own students), so true
conflicts are rare. For the cases that exist:

- Every row carries `hlc` (Hybrid Logical Clock), `version`, and `origin_node_id`.
- **HLC** orders events consistently across machines **without synchronized clocks**
  (wall clock + logical counter; tolerant of skew). Plain `updated_at` is not enough.
- Default merge = **per-field Last-Writer-Wins** by HLC.
- **Money / ledgers / attendance marks are append-only, event-sourced** — modeled as
  immutable events that are *summed*, never overwritten. You cannot "lose" a payment
  by a LWW overwrite because payments are never updated in place.
- **Deletes are tombstones** (soft delete + a delete event), so a delete propagates
  and a stale node can't resurrect the record.

---

## What flows which way

| Direction | Data | Mechanism |
|-----------|------|-----------|
| Node → Cloud | Business events: students, attendance, fees, exams, audit log | Outbox → JetStream → cloud inbox |
| Cloud → Node | License, tenant config, onboarding templates, permission catalog updates, software-update signals | Cloud outbox → JetStream → node inbox |

The node owns operational data; the cloud owns control/config and the durable history.

## Disaster recovery (the real no-data-loss guarantee)

Because the cloud retains the **full per-tenant event history**:

- **Node hardware dies** → provision a fresh node, pull a snapshot + **replay** the
  event stream → fully restored.
- **New site / second campus** → bootstrap by snapshot + tail the stream.
- Each node also runs **local WAL archiving + periodic backups** (e.g. pgBackRest)
  for fast local restore independent of the cloud.

Two independent copies (node + cloud), reconstructable from an append-only log =
durable by construction.

---

## Security

| Layer | Control |
|-------|---------|
| Transport | **mTLS** between every node and the cloud. Each node gets a unique client certificate at provisioning; the cloud authenticates the node by cert + `node_id`. |
| Tenant isolation on the wire | **Per-tenant NATS accounts / subject scoping** — a node can only publish/subscribe to its own tenant's subjects. No cross-tenant leakage even at the messaging layer. |
| At rest | Disk/volume encryption on the node + cloud; **pgcrypto** (or app-layer envelope encryption) for sensitive fields (e.g. guardian contact, payment proof). |
| Identity & license | Node identity is bound to a **signed license**; revocation disables sync + triggers the offline grace-period lock (see [01](./01-overview.md)). |
| Audit | The audit log is itself an event stream — **replicated to the cloud**, tamper-evident (append-only, hash-chained optional). |
| Secrets | Node holds the minimum (its cert + license key); rotate certs periodically; no shared global secret across nodes. |

---

## Build vs buy

We assemble this on the existing stack (**transactional outbox + UUIDv7 + JetStream
+ inbox + HLC**) because it fits the Go/Postgres/NATS choices and keeps the node a
single binary. Alternatives evaluated:

| Option | Verdict |
|--------|---------|
| **PowerSync / ElectricSQL** | Postgres↔local offline-sync engines. Powerful, but opinionated and oriented to SQLite-on-client; our node *is* Postgres-on-LAN. Revisit for the **client-offline** (mobile) phase, not node sync. |
| **Debezium + Kafka (CDC)** | Heavy operationally; overkill for one-binary school nodes. |
| **Litestream / LiteFS** | SQLite replication — wrong data engine for a multi-user LAN node. |
| **Logical replication (native Postgres)** | Good for cloud→node *read* mirrors, but doesn't model bidirectional offline writes or app-level conflict rules. Possible building block, not the whole answer. |

## Implementation order (slots into [07 — Roadmap](./07-roadmap.md) Phase 6)

1. Add `outbox`, `inbox`, `hlc`, `origin_node_id`, `version`, tombstone columns to the
   schema; switch synced PKs to UUIDv7. **Do this early** even while cloud-only — it's
   cheap now and a rewrite later.
2. Node provisioning: issue cert + license + `node_id`; mTLS handshake with cloud.
3. Relay worker (outbox → JetStream) + consumer (JetStream → inbox) both directions.
4. Conflict merge (HLC LWW) + event-sourced ledgers + tombstone handling.
5. Snapshot + replay bootstrap; DR drill (kill a node, rebuild from cloud).
6. Local WAL archiving / backups on the node.
