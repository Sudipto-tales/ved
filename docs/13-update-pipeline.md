# 13 — Software Update Pipeline & Auto-Update

## Goal

Ship updates safely to every surface — the **school node binary**, **desktop
(Tauri)**, **mobile (Expo)**, **web** — with a **tenant opt-in**: auto-update runs
silently in the background; otherwise a dismissable popup offers it (but new features
require updating). **An update must never corrupt data or break a running task**, and
nodes that were offline must update cleanly when they reconnect.

## What gets updated, and how

| Surface | Mechanism |
|---|---|
| **School node** (Go binary + Postgres) | Self-updater: pulls signed artifact from cloud `updates` service, verifies, applies in a safe window, runs migrations, swaps binary, health-checks, auto-rolls-back |
| **Desktop** (Tauri) | **Tauri updater plugin** — signed delta updates, background download, apply on restart |
| **Mobile** (Expo) | **EAS Update** (OTA) for JS/asset changes; app-store update for native changes |
| **Web** | Always latest (served); client checks build version and prompts a soft reload |

## Release management (cloud `updates` service)

```
release        (id, channel ∈ {STABLE, BETA}, version (semver), artifact_url,
                signature, min_supported_version, requires_migration,
                feature_keys[], release_notes, published_at)
rollout        (id, release_id, strategy ∈ {CANARY, PERCENT, ALL},
                percent, cohort, status, started_at)
node_version   (tenant_id, node_id, current_version, target_version,
                last_check_at, last_update_at, status)
update_policy  (tenant_id, mode ∈ {AUTO, MANUAL}, window_start, window_end, channel)
```

- **Channels** — STABLE for schools, BETA for opt-in early adopters.
- **Signed artifacts** — every build is signed; node/desktop verify the signature
  before applying (supply-chain safety). Only **licensed** nodes are served updates.
- **Staged rollout** — CANARY cohort → monitor health/telemetry
  ([14](./14-maintenance-ops.md)) → expand by PERCENT → ALL. **Auto-rollback** if the
  canary's health regresses.
- **Per-tenant pinning** — hold a specific school on a version (support cases).

## Tenant opt-in model

`update_policy.mode` per tenant, set by the school admin:

- **AUTO** → node updates **silently in the background** during the configured
  low-usage **window** (e.g. 01:00–04:00). No human action.
- **MANUAL** → a **dismissable popup** announces the update; admin can **defer/skip**.
  They keep running the current version.

### Feature-gating (the "to use new features they must update")

The release manifest lists `feature_keys[]` it introduces. The server stamps each
feature with a `min_version`. When a client/node on an older version tries to use a
gated feature:

```
if feature.min_version > current_version:
    show "This feature needs update vX. Update now? [Update] [Later]"
```

So MANUAL users are never *forced*, but the moment they want a new feature, the update
is one click away. Old features keep working untouched.

## Node self-update flow (the safety-critical path)

```
1. CHECK     node polls updates service (or gets a NATS signal) → new target version
2. DOWNLOAD  fetch signed artifact (resumable; works around flaky school internet)
3. VERIFY    check signature + checksum; abort if invalid
4. WAIT      hold until a SAFE WINDOW (AUTO window, or user-confirmed for MANUAL)
             AND until QUIESCENCE — no critical transaction in flight (see below)
5. DRAIN     stop accepting new requests; let in-flight requests finish;
             pause the job queue (River jobs are checkpointed/resumable)
6. MIGRATE   run EXPAND-phase migrations (backward-compatible — see below)
7. SWAP      replace binary, restart
8. HEALTH    run health checks; resume job queue; reopen to traffic
9. ROLLBACK  if health fails → revert to previous binary + down-migrate / no-op,
             report to cloud. The school is never left broken.
```

## How an update can't conflict with a running task

| Risk | Guarantee |
|---|---|
| Schema change breaks in-flight code | **Expand/contract (parallel-change) migrations**: first only *add* (new columns/tables, nullable/defaulted) so **old and new code both work** against the schema; *remove* old columns only in a later release after everyone's upgraded. No migration ever drops/renames something the running version still uses. |
| Request killed mid-flight | **Graceful drain**: stop new, finish in-flight, then restart. |
| Background job interrupted | **Resumable jobs** (River, Postgres-backed): a job killed mid-run re-runs from its last checkpoint — idempotent by design (same rule as sync inbox, [08](./08-offline-sync.md)). |
| Client mid-session hits new server | **Versioned APIs**: server supports current **and** previous major (N and N-1) so an open client keeps working until it reloads. |
| Mixed node versions exchange sync events | **Versioned event envelope**: every event carries a `schema_version`; consumers tolerate older/newer (ignore unknown fields, default missing). Critical because offline nodes update at different times. |
| Update during a payment / marks submission | **Update lock**: the updater waits for *quiescence* on critical transactions (open `cash_session`, in-progress payment, exam submission) or defers to the next safe window. Money/marks are never mid-write during a swap. |

## Offline nodes

A node offline for days: **downloads** the update opportunistically whenever it has
connectivity, **stores** it, and **applies** it at the next safe window — independent
of being connected at apply time. Event-schema versioning (above) lets a freshly
updated node and a still-old node keep syncing without breakage.

## Security

- Artifacts **signed**; signature verified before apply (no tampered binaries).
- Updates served only to **licensed** nodes; license can gate channel access.
- All update actions written to the **billing/ops audit log** (who/what/when/version).

## Build order (new phase, after the modules exist)

1. `updates` service: releases, channels, signed artifacts, `node_version` tracking.
2. Node self-updater: check → download → verify → drain → swap → health → rollback.
3. Expand/contract migration discipline + versioned event envelope (adopt **from the
   first migration** — cheap now, impossible to retrofit cleanly).
4. `update_policy` (AUTO/MANUAL + window) + the MANUAL popup + feature-gating.
5. Staged rollout + canary + auto-rollback.
6. Tauri updater + Expo EAS Update wiring for the clients.
