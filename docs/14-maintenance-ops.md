# 14 — Maintenance, Health & Operations

How VED stays healthy in production across many self-hosted school nodes plus the
cloud — without an ops team at each school.

## Maintenance mode

| Scope | Behavior |
|---|---|
| **Per-tenant** | A school can be put into maintenance (e.g. during a big import, year-end rollover) — banner + read-only or locked, with a message and ETA. |
| **Global** | Platform-wide notice for cloud maintenance (sync hub, billing) — nodes keep serving their LAN locally regardless ([08](./08-offline-sync.md)). |

- **Scheduled windows** — set a future window; users get advance notice
  ([15](./15-notifications-feedback.md) broadcast) and a live countdown banner.
- **Read-only mode** reuses the same graceful-drain path as updates
  ([13](./13-update-pipeline.md)) — never an abrupt cutoff.

```
maintenance_window (id, scope ∈ {GLOBAL, tenant_id}, mode ∈ {READ_ONLY, LOCKED},
                    message, starts_at, ends_at, created_by)
```

## Health & heartbeat

Each node sends a periodic **heartbeat** to the cloud `telemetry/health` service (and
buffers it when offline, sending the backlog on reconnect):

```
heartbeat (node_id, tenant_id, version, uptime, last_sync_at, pending_outbox,
           db_size, disk_free, license_status, error_count, sent_at)
```

This powers the superadmin's fleet view: who's online, who's behind on updates, who's
low on disk, whose sync is lagging, whose license is expiring.

## Observability

| Concern | Tooling |
|---|---|
| Metrics | **OpenTelemetry** → **Prometheus** (cloud) + node-level counters in heartbeats |
| Tracing | OpenTelemetry traces across services (cloud) |
| Logs | Structured logs (`slog`); ship to a central store; node buffers + forwards |
| Error reporting | **Sentry** (or self-hosted **GlitchTip**) for crashes/exceptions |
| Dashboards/alerts | **Grafana** + alert rules (disk, sync lag, error spikes, expiring licenses) |

## Self-diagnostics & integrity checks (scheduled jobs on each node)

| Check | What it verifies |
|---|---|
| **Audit-chain verification** | The hash-chained finance/billing audit log is unbroken ([10](./10-finance-payments.md), [11](./11-subscription-billing.md)) — detects tampering. |
| **Ledger reconciliation** | Σ debits/credits consistent; receipt numbers gapless. |
| **Backup verification** | Last backup exists, restores, and is recent (a backup never tested is not a backup). |
| **Sync health** | Outbox not backing up; inbox cursor advancing. |
| **License/cert validity** | License not near expiry; mTLS cert not near expiry → auto-rotate. |

Failures raise an alert and surface in the superadmin fleet view + a tenant-admin
health card.

## Backup & restore

- **Per-node**: WAL archiving + scheduled full backups (e.g. **pgBackRest**), retained
  locally and pushed to cloud object storage (MinIO/S3).
- **Cloud as DR backbone**: the full per-tenant event history reconstructs a node by
  replay ([08](./08-offline-sync.md)).
- **One-click restore** from the superadmin/tenant console; restores are **tested**
  automatically by the backup-verification job.

## Remote operations (superadmin console)

From the cloud, the platform superadmin can (all gated + audited):

- View node health/fleet status.
- **Push config** down (NATS) — e.g. reminder policy, feature flags.
- **Trigger backup** / **force update** / **pin version** for a node.
- **Rotate** license / mTLS cert.
- Put a tenant/global into **maintenance mode**.
- Pull diagnostics (recent logs, health snapshot) for a support case.

```
ops_command (id, target_node_id, kind, payload, issued_by, issued_at,
             status, acked_at)   -- delivered over NATS, acknowledged by the node
```

All ops commands flow over the same secure NATS channel (mTLS, per-tenant scoped) and
are recorded in the **ops audit log** (append-only, who/what/when/where).

## Alerting (who gets told)

- **Platform superadmin**: node offline > N hours, sync lag, disk low, error spike,
  failed update/rollback, integrity-check failure, licenses expiring.
- **Tenant admin**: their node's health card — backup status, disk, update available,
  license expiry.

## Build order

1. Heartbeat + fleet view (cheap, immediately useful operationally).
2. Structured logs + error reporting (Sentry/GlitchTip).
3. Self-diagnostic jobs (audit chain, ledger, backup verify, sync health).
4. Maintenance mode (reuses update drain path).
5. Remote ops commands over NATS + ops audit.
6. Metrics/tracing (OpenTelemetry → Prometheus/Grafana) + alert rules.
