# 12 — Service Architecture (Modulith → Extractable Services)

## The tension, and the honest answer

You want microservices: independent, individually optimizable, each able to act as
standalone software, less duplicated code. **But** the local node must be a
**single lightweight binary** that runs **offline** on a school's PC
([08](./08-offline-sync.md)). You cannot ship 15 separately-deployed services to a
school.

**Answer: a *modular monolith* (modulith) that is *service-ready*.**

- Every feature ([04](./04-vertical-slicing.md)) is an **independent module** with its
  own API contract, its own event interface, and its own data — built as if it were a
  service, but *packaged* together.
- The **local node** runs all modules as **one binary** (offline, lightweight).
- The **cloud control plane** runs the modules that benefit from independent scaling
  as **true microservices** (billing, registration, sync hub, reporting,
  notifications, updates).
- Because each module already has a clean contract, **any module can be extracted
  into a standalone service** later with no rewrite — and several are viable as
  **standalone products** (e.g. finance as a school fee-management app).

This gives you everything microservices promise (independence, optimization, reuse)
without sacrificing the offline single-binary node. You start simple and split only
where you measure a reason to.

## Two runtimes

| | **Node runtime** (per school) | **Cloud runtime** (control plane) |
|---|---|---|
| Packaging | One binary (all modules) | Independent services |
| Why | Offline, lightweight, one install | Scale/iterate parts independently |
| Data | One Postgres, **schema-per-module** | **Database-per-service** |
| Comms | In-process calls + NATS events | gRPC/Connect + NATS events |

## Module / service catalog

> "Standalone?" = could run as its own deployable service / sellable product.

| Module | Owns | Standalone? |
|---|---|---|
| `identity` | Auth, sessions, credentials | ✅ (auth provider) |
| `access` (RBAC) | Roles, permissions, designations | merge with identity, or ✅ |
| `tenant` | School setup, config, dynamic dropdowns | ✅ |
| `students` | Admission, profiles, guardians | ✅ |
| `teachers` | Teacher profiles, subjects | with academics |
| `staff` | Staff/authority, departments | with people |
| `academics` | Classes, attendance, exams, marks | ✅ (LMS-lite) |
| `learning` (LMS) | Content, assignments, submissions, grading | split from academics at T3b ([19](./19-lms.md)) |
| `finance` | Fees, ledger, audit, reports | ✅ **strong standalone product** |
| `communication` | Notices, notifications fan-out | ✅ |
| `documents` | TC, ID cards, certificates, PDFs | ✅ (doc service) |
| `reporting` | Dashboards, exports, analytics | ✅ (cloud, cross-school) |
| **Cloud-only** | | |
| `registration` | Admin signup, school onboarding approval | ✅ |
| `subscription` | Plans, billing, licenses ([11](./11-subscription-billing.md)) | ✅ |
| `sync-hub` | Durable event relay between nodes ([08](./08-offline-sync.md)) | ✅ |
| `notifications` | Realtime + push fan-out ([15](./15-notifications-feedback.md)) | ✅ |
| `updates` | Release mgmt, rollout ([13](./13-update-pipeline.md)) | ✅ |
| `feedback` | Feedback intake, surveys ([15](./15-notifications-feedback.md)) | ✅ |
| `telemetry/health` | Node heartbeats, monitoring ([14](./14-maintenance-ops.md)) | ✅ |

## How modules communicate

| Need | Mechanism |
|---|---|
| Async / decoupled (something happened) | **NATS events** — `student.enrolled`, `payment.recorded`. The publisher doesn't know consumers. Same bus as sync. |
| Sync / request-response (need an answer now) | **Connect (gRPC-compatible)** between cloud services; **in-process interface call** inside the node binary |
| Public/client API | **REST + OpenAPI** → generated typed clients (web/desktop/mobile) |

A module **never** reads another module's tables. It calls the contract or listens to
events. This is what makes extraction mechanical later.

## How this *reduces* code (your goal)

- **Shared kernel** — tenancy, authz, events, audit, storage, ids, errors written
  once, used by every module ([02](./02-architecture.md)).
- **Contract-first codegen** — OpenAPI → TS + Go clients; **sqlc** → typed Go from
  SQL; protobuf → service stubs. Interfaces are generated, not hand-written in each
  service.
- **One schema source** — module owns its tables; clients are generated, so no
  duplicated DTOs drift across services.
- **One module, one responsibility** — no copy-pasted "user logic" in five places;
  everyone calls `identity`.

## Per-module data ownership

- **Cloud:** database-per-service (true isolation, independent scaling/backup).
- **Node:** one Postgres, **one schema per module** (`identity.*`, `finance.*`…). Same
  ownership rule (no cross-schema table reads), but one DB to install and back up.
  When a module is extracted to the cloud, its schema lifts out cleanly.

## Extraction path (monolith module → standalone service)

A module is promoted only when there's a measured reason (scale, independent release
cadence, sold as a separate product):

```
1. Module already has: own schema, own API contract, own events.  ← done by design
2. Point it at its own database (copy its schema out).
3. Replace in-process calls to it with Connect/REST calls.
4. Replace direct calls from it with the same.
5. Deploy as its own service; NATS events already decouple the rest.
```

No business-logic rewrite — only wiring. That is the payoff of "service-ready
modulith": **build as a monolith, split on evidence, never on speculation.**
