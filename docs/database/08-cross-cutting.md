# Database — Cross-Cutting (Sync, Audit, Notifications)

The shared-kernel tables used by **every** slice — the plumbing behind the golden
rule "domain row + outbox in one transaction" ([20](../20-dataflow.md)), the
no-data-loss sync pillars ([08](../08-offline-sync.md)), the audit trail
([02](../02-architecture.md)), and notifications ([15](../15-notifications-feedback.md),
[16](../16-push-notifications.md)). They follow [00-conventions.md](./00-conventions.md)
except where marked **(append-only)** — those have no `updated_at`/`deleted_at` and
are never modified.

## Sync plumbing

### `outbox` **(append-only)**

Written in the **same transaction** as every mutation. A relay worker reads unsent
rows and publishes them to JetStream, then stamps `sent_at`.

```
outbox  (id UUIDv7 PK,             -- IS the event id (used for inbox dedupe)
         tenant_id,
         aggregate,                -- e.g. "student", "payment", "attendance_event"
         aggregate_id,             -- the row that changed
         op ∈ {CREATE, UPDATE, DELETE},
         payload jsonb,            -- the event body (versioned, see [20])
         schema_version INT,       -- payload contract version
         hlc, origin_node_id,      -- sync metadata ([08])
         created_at,
         sent_at?)                 -- NULL until the relay publishes it
```

Index `(sent_at, created_at)` for the relay's "unsent, oldest first" scan.

### `inbox` **(append-only)**

The receiving side records every consumed event id before applying, making replays
and duplicate deliveries no-ops (idempotent / effectively-once).

```
inbox  (event_id UUIDv7 PK,        -- = the producer's outbox.id
        tenant_id,
        applied_at)
```

`apply` is: `if inbox has event_id → ack & skip; else BEGIN apply(); insert inbox;
advance cursor; COMMIT`.

### `sync_cursor`

Per-consumer JetStream position, so a node offline for days resumes exactly where it
left off.

```
sync_cursor  (id, stream, consumer, last_seq BIGINT, updated_at)
```

> **outbox + inbox + sync_cursor** together = at-least-once delivery (outbox/relay) +
> idempotent apply (inbox) + resumable replay (cursor) = **effectively-once** sync
> with no data loss ([08](../08-offline-sync.md)).

## Audit

### `audit_log` **(append-only, tamper-evident)**

Every mutation writes one audit row in its transaction — who/what/when/where. The
log is itself replicated to the cloud as an event stream and is optionally
hash-chained so tampering is detectable.

```
audit_log  (id UUIDv7 PK,
            tenant_id,
            actor_membership_id?,       -- who (NULL for system actions)
            action,                     -- "fee.record", "student.update"
            resource_type, resource_id, -- what
            before jsonb?, after jsonb?, -- the change
            at TIMESTAMPTZ,             -- when
            ip?, origin_node_id,        -- where
            prev_hash?, hash?)          -- optional hash chain (tamper-evident)
```

Never `UPDATE`d or `DELETE`d — corrections are new events, exactly like the finance
ledger ([06](./06-finance.md)).

## Notifications

### `notification`

In-app / inbox notifications; the realtime copy is pushed over NATS to connected
clients ([15](../15-notifications-feedback.md)).

```
notification  (id UUIDv7 PK,
               tenant_id,
               recipient_membership_id →,
               kind,                    -- "fee.overdue", "result.published"
               title, body,
               payload jsonb?,          -- deep-link context
               read_at?,
               created_at)
```

### `device_token`

OS push targets for a membership across devices ([16](../16-push-notifications.md)).

```
device_token  (id UUIDv7 PK,
               tenant_id,
               membership_id →,
               platform ∈ {FCM, APNS, WEB},
               token,
               last_seen, active)
```

`UNIQUE (tenant_id, token)`; deactivate on unregister/expiry rather than deleting.

## Node registry (control-plane-adjacent)

Tracks each school node's identity, license binding, and liveness — used by sync
auth ([08](../08-offline-sync.md)) and ops heartbeats ([14](../14-maintenance-ops.md)).
Lives in the cloud alongside the control plane, keyed by tenant.

```
node  (node_id UUID PK,
       tenant_id →,
       cert_fingerprint,           -- mTLS client identity
       license_id →,               -- ([01](./01-control-plane.md))
       last_heartbeat,
       status ∈ {ACTIVE, SUSPENDED, REVOKED})
```

## Cross-references
- Sync pillars (outbox/inbox/HLC/UUIDv7) — [08](../08-offline-sync.md)
- The write path & event envelope — [20](../20-dataflow.md)
- Notifications transport — [15](../15-notifications-feedback.md), [16](../16-push-notifications.md)
- Audit principle — [02](../02-architecture.md), [21](../21-database-architecture.md)
