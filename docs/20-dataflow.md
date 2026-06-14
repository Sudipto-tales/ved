# 20 — Data Flow

How data moves through VED — from a client request, through the slice and the
shared kernel, into Postgres, onto the event bus, and out to the cloud / other
clients. This doc ties together the request path ([02](./02-architecture.md)) and
the sync pillars ([08](./08-offline-sync.md)) into one picture, then traces the
flows that matter.

## The golden rule

> **Every mutation does two things in one DB transaction: it writes the domain row
> *and* an `outbox` event.** Reads never touch the bus. This single rule makes the
> system sync-safe, auditable, and reactive at once.

## 1. Write path (any mutation, any slice)

```
Client (web / desktop / mobile)
  │  HTTPS + JWT
  ▼
[auth mw] who are you?            → user_id, memberships
[tenant mw] which tenant?         → SET app.tenant_id = <uuid>   (RLS armed)
[rbac mw] may you?                → requirePermission("fee.record")
  ▼
slice handler  →  service (use case)  →  repository (sqlc)
  ▼
┌─ BEGIN ─────────────────────────────────────────────┐
│  INSERT/UPDATE domain row    (tenant_id, UUIDv7 PK,  │
│                               hlc, version, node_id) │
│  INSERT outbox  (aggregate, op, payload, hlc, …)     │
│  INSERT audit_log (who, what, when, where)           │
└─ COMMIT ────────────────────────────────────────────┘
  ▼
relay worker (async)  reads unsent outbox  → NATS JetStream
  ▼
side-effect consumers (notifications, reporting)  +  cloud sync hub
```

The handler returns to the client the moment the transaction commits. Everything
after the commit (publish, notify, sync) is **asynchronous and at-least-once** — it
cannot lose data because the event is already durably in `outbox`.

## 2. Read path

```
Client → auth mw → tenant mw → rbac mw → handler → repository → Postgres (RLS filters)
                                              │
                                   hot reads (timetable, dashboards) ← Redis cache
```

Reads are local and cheap. On a school node they never leave the LAN. RLS guarantees
a query can only ever see the active tenant's rows, even if a `WHERE tenant_id`
clause is forgotten ([03](./03-multi-tenancy.md)).

## 3. Sync path (node ↔ cloud, bi-directional)

```
NODE                                   CLOUD (sync hub + backup)
 outbox ─relay→ JetStream(tenant.*) ───────────────→ inbox ─apply→ event history
   ▲                                                              (durable backup)
 inbox ←apply─ JetStream ←─── cloud outbox (license, config, catalog push-down)
```

- **Node → Cloud:** business events (students, attendance, fees, marks, audit).
- **Cloud → Node:** license, tenant config, onboarding templates, permission-catalog
  updates, software-update signals.
- The **inbox + UUIDv7 event IDs** make replays idempotent; the **JetStream cursor**
  makes a days-offline node resumable. Conflicts resolve by **HLC per-field LWW**,
  except ledgers/marks/attendance which are **append-only and summed**, never
  overwritten. See [08](./08-offline-sync.md).

## 4. Large-payload path (files — never on the bus)

```
upload → MinIO (object store)  →  returns storage_key
domain row stores storage_key only;  outbox event carries the key, not the bytes
cloud replicates the blob out-of-band; the event just references it
```

Materials, submissions ([19](./19-lms.md)), documents, and payment proofs flow this
way. **File bytes never travel through NATS.**

## Worked flows

### A. Onboard a student ([06](./06-onboarding-credentials.md))

```
staff submits → student.onboard (rbac) → service:
  tx: users(login_handle, must_reset) + memberships(GUARDIAN/STUDENT type)
      + student profile + guardian + guardian_student
      + outbox[student.enrolled] + audit
→ event student.enrolled → notifications (welcome), reporting (cloud count)
```

### B. Record a fee payment ([10](./10-finance-payments.md))

```
clerk submits → payment.record (rbac) → service:
  tx: payment(receipt_no gapless) + ledger_entry(CREDIT)
      + outbox[payment.recorded] + audit
→ invoice status re-derived from ledger (never stored)
→ event payment.recorded → notification to guardian, daily-cash reporting
```

### C. Guardian views a child's dues ([18](./18-guardian-portal.md))

```
guardian login → tenant mw → rbac guardian.read_fees → handler:
  resolve guardian_id → restrict to guardian_student.student_id set (+ RLS)
  → read-only ledger/invoice projection for own children only
```

### D. Mark attendance (append-only, [08](./08-offline-sync.md))

```
teacher submits → attendance.mark → service:
  tx: attendance_event(append-only row) + outbox + audit
→ "present count" is summed from events, never an overwritten field
```

## What each layer owns

| Layer | Responsibility |
|---|---|
| Client | UI, optimistic display; talks only to the generated OpenAPI client ([02](./02-architecture.md)) |
| Auth / tenant / rbac mw | Identity, `app.tenant_id`, permission gate — *before* any slice code |
| Slice service | Business rules; opens the transaction |
| Repository (sqlc) | Type-safe SQL; the only thing that touches tables |
| Shared kernel | Tenancy, events, audit, storage, authz, credential gen |
| Relay / consumers | Async fan-out + sync; never in the request's critical path |

## Cross-references
- Request path & stack — [02](./02-architecture.md)
- Tenant isolation / RLS — [03](./03-multi-tenancy.md)
- Sync pillars (outbox/inbox/HLC/UUIDv7) — [08](./08-offline-sync.md)
- Table designs — [database/](./database/) · principles — [21](./21-database-architecture.md)
