# Execution Plan

A granular, execution-optimized version of the [07 — Roadmap](../07-roadmap.md).
Same phases, broken into milestones an engineer follows step by step. The strategy:
**build one thin vertical slice end-to-end first** so every seam (auth, tenant
context, RBAC, outbox/events, audit, codegen) exists *once* — then every later slice
reuses the same rails and ships fast.

Four operating rules:

1. **Walking skeleton first.** M0–M3 wire ONE slice through the full stack
   (DB → sqlc repo → service → handler → OpenAPI → generated TS client → React screen).
   Every bridge is established here. See the request/write path in [20](../20-dataflow.md).
2. **Bridges-first, then replicate.** Once the seams exist, slices are near-mechanical.
   The exact seam contracts (middleware signatures, outbox envelope, codegen commands)
   live in [bridges.md](./bridges.md) — reference it, don't re-spec.
3. **Cloud-first, sync-ready.** Build cloud-only, but every table carries sync columns
   (`hlc`/`version`/`origin_node_id`/`deleted_at`, UUIDv7 PK) and every write routes
   through `outbox` from migration #1. Phase 6 sync becomes wiring, not a rewrite
   ([08](../08-offline-sync.md), [21](../21-database-architecture.md)).
4. **Parallel tracks.** The OpenAPI contract is the fence: freeze it for a slice, then
   backend and frontend proceed in parallel against the generated client.

Milestones map to roadmap phases. M0 is pure plumbing; M3 is the first *real* slice.

---

## M0 — Foundations & Walking Skeleton  → [Roadmap Phase 0]

**Goal:** a repo that builds, migrates, runs, and serves one trivial authenticated
endpoint through to a React screen — proving every seam end-to-end.

- [ ] Go monorepo: `cmd/node`, `cmd/controlplane`, `internal/platform/`, `internal/features/`
      ([04](../04-vertical-slicing.md) layout).
- [ ] Postgres up; goose + sqlc wired; generation runs in CI.
- [ ] Lock [database/00-conventions.md](../database/00-conventions.md): base columns,
      UUIDv7 PK, sync columns, RLS policy template, naming. **Decided once.**
- [ ] Migration #1 seeds cross-cutting tables ([database/08-cross-cutting.md](../database/08-cross-cutting.md)):
      `outbox`, `inbox`, `sync_cursor`, `audit_log` — with RLS.
- [ ] Shared kernel skeleton in `platform/`: db pool, tenancy ctx, authz helper stub,
      `events` (outbox writer + relay), `audit` writer, `storage` (MinIO) stub.
- [ ] Middleware chain stubs in order: auth → tenant-context (`SET app.tenant_id`) →
      rbac. One dummy `GET /healthz` walks the full chain.
- [ ] OpenAPI spec file + generator → emits TS client into FE `shared/api`.
- [ ] React + Vite app shell with login screen + tenant context provider; Tauri
      desktop build produces a binary.
- [ ] **Design system** ([23](../23-design-system.md)): tokens + `shared/ui` kit +
      thin-line icons. Established once in the shell + `PlannedPage` so every
      manifest page renders in the Premium SaaS Minimalism style from day one.

**Bridges established:** repo layout · migration+RLS pipeline · sqlc codegen ·
outbox+audit kernel · the three middleware seams · OpenAPI→TS codegen · FE shell.
**Now FAST:** adding a table, a query, an endpoint, regenerating the client.
**Parallel:** FE shell + codegen wiring can run alongside BE kernel once the middleware
signatures in [bridges.md](./bridges.md) are agreed.

---

## M1 — Identity & Tenancy  → [Roadmap Phase 1]

**Goal:** real login that resolves memberships and arms RLS. This is the first slice
to actually exercise the auth and tenant seams from M0.

- [ ] Migrate `users`, `memberships` ([database/02-identity-access.md](../database/02-identity-access.md)).
- [ ] sqlc queries: lookup user by handle, list memberships, password update.
- [ ] `identity` service: login (verify), issue access + refresh JWT,
      force-reset-on-first-login, refresh rotation. Writes route through outbox+audit.
- [ ] Auth middleware: validate JWT → `user_id` + memberships (replace M0 stub).
- [ ] Tenant-context middleware: resolve active tenant from membership →
      `SET app.tenant_id` (replace M0 stub); verify RLS actually filters.
- [ ] OpenAPI: `/auth/login`, `/auth/refresh`, `/auth/reset-password`, `/me/memberships`.
- [ ] React: login → tenant picker (when multiple memberships) → forced reset flow.

**Bridges established:** the auth + tenant seams are now *production*, not stubs.
**Now FAST:** any later endpoint inherits a real authenticated, tenant-scoped request.
**Parallel:** once `/auth/*` OpenAPI is frozen, FE auth screens + BE JWT logic split.

---

## M2 — RBAC (`access` slice)  → [Roadmap Phase 2]

**Goal:** the `requirePermission(...)` gate is real and backed by data.

- [ ] Migrate `roles`, `permissions`, `role_permissions`, `membership_roles`,
      `designations` ([database/02-identity-access.md](../database/02-identity-access.md)).
- [ ] **Code-defined permission catalog** seeded at startup; platform-superadmin and
      tenant-admin permissions in separate namespaces ([05](../05-rbac.md)).
- [ ] sqlc: effective permissions for a membership (roles → permissions).
- [ ] RBAC middleware: `requirePermission("...")` reads effective perms (cache in Redis).
- [ ] Tenant provisioning bootstrap: seed default roles + first admin membership.
- [ ] OpenAPI + React `access` screens: role CRUD, assign roles to memberships.

**Bridges established:** the rbac seam is production; provisioning bootstrap exists.
**Now FAST:** every future handler just declares its permission string — the gate works.
**Parallel:** catalog seeding (BE) and role-management UI (FE) split after contract freeze.

---

## M3 — Onboarding + Students (first real domain slice)  → [Roadmap Phase 3]

**Goal:** the first business slice end-to-end. This *completes the walking skeleton*:
a real feature flows DB → repo → service(tx: row + outbox + audit) → handler(rbac) →
OpenAPI → TS client → React. From here, slices are replication.

- [ ] Credential/email generator in kernel: slug + type suffix + uniqueness ([06](../06-onboarding-credentials.md)).
- [ ] Config-driven onboarding engine (wizard vs `onboarding.skip`) — reusable across people slices.
- [ ] Migrate `student`, `guardian`, `guardian_student`, `person_document`
      ([database/04-people.md](../database/04-people.md)).
- [ ] sqlc queries for student admission + listing.
- [ ] `students` service: `student.onboard` in ONE tx — users + memberships +
      student profile + guardian links + `outbox[student.enrolled]` + audit
      (worked flow A in [20](../20-dataflow.md)).
- [ ] Handler with `requirePermission("student.onboard")`; OpenAPI for onboard + list + detail.
- [ ] React: student onboarding wizard + roster list + profile screen.
- [ ] Tests: service tx (row+outbox+audit committed together), RLS isolation, handler authz.

**Bridges established:** onboarding engine · credential generator · the canonical
"mutation = row + outbox + audit in one tx" pattern proven on real data.
**Now FAST:** every remaining people/domain slice is this same shape with different tables.
**Parallel:** onboarding wizard (FE) builds against frozen OpenAPI while BE finishes the engine.

---

## M4 — Control Plane  → [Roadmap Phase 4]

**Goal:** the central cloud that registers schools and provisions tenants. Separate
binary (`cmd/controlplane`), separate slices, separate permission namespace.

- [ ] Migrate control-plane tables ([database/01-control-plane.md](../database/01-control-plane.md)):
      `school_registration`, `tenant`, `subscription`, `subscription_invoice`, `license`, `payment_proof`.
- [ ] Registration **state machine**:
      `ADMIN_REGISTERED → ONBOARDING → PENDING_PAYMENT_REVIEW → ACTIVE / REJECTED / SUSPENDED`.
- [ ] Payment-proof upload via MinIO (large-payload path [20](../20-dataflow.md) §4 — key only on bus).
- [ ] Superadmin review UI; license issuance (signed) → consumed by node provisioning.
- [ ] Tenant provisioning triggers the M2 seed (default roles + first admin).
- [ ] OpenAPI (platform namespace) + `platform/` React screens behind separate route guard.

**Bridges established:** control-plane ↔ tenant-plane handoff (provision + license).
**Now FAST:** new platform admin screens reuse the tenant-plane rails.
**Parallel:** the entire control plane can build **alongside** M5 — it shares the kernel
but not the slices, so a second engineer/track owns it independently.

---

## M5 — Teachers / Staff / Academics / Finance (replicate fast)  → [Roadmap Phase 5]

**Goal:** fill out the tenant plane. Each is the M3 shape; the only new work is tables,
queries, and screens. This is where bridges-first pays off.

- [ ] `teachers`, `staff`: reuse the onboarding engine; new profile tables only
      ([database/04-people.md](../database/04-people.md)). Near-copy of M3.
- [ ] `academics` ([database/05-academics.md](../database/05-academics.md), [17](../17-academics-model.md),
      `SECTION_BASED` for MVP): `program`, `program_stage`, `subject`, `curriculum`,
      `section`, `enrollment`, `teaching_assignment`, then `attendance_event`
      (**append-only**, flow D), `exam`/`mark_entry` (**append-only**), `timetable_slot`.
- [ ] `finance` ([database/06-finance.md](../database/06-finance.md), [10](../10-finance-payments.md)):
      `fee_head`, `fee_structure(_line)`, `fee_schedule`, `ledger_entry` (**append-only**),
      `invoice` (status **derived**, never stored), `payment` (gapless receipt no, flow B).
- [ ] Per slice: migration+RLS → sqlc → service(tx+outbox+audit) → handler(rbac) →
      OpenAPI → TS client → React.

**Now FAST:** these four slices run in **parallel across engineers** — independent
tables, independent contracts, one shared pattern. Append-only ledgers/attendance/marks
are the only design care points.
**Parallel:** maximum — each slice is an independent track once its contract is frozen.
**Sequential within a slice:** migration before queries before service before handler;
OpenAPI freeze before the FE screen starts.

---

## M6 — Sync & Offline (local-first)  → [Roadmap Phase 6]

**Goal:** turn the cloud-first system into local-first. Because outbox + sync columns
existed from M0, this is **wiring, not a rewrite** ([08](../08-offline-sync.md)).

- [ ] Confirm schema prep is complete (outbox/inbox/sync_cursor/hlc/version/origin_node_id/
      tombstone/UUIDv7) — should already be true from M0.
- [ ] Node provisioning: cert + license + `node_id`; mTLS to cloud.
- [ ] Relay worker (already writing outbox) → **NATS JetStream**, both directions.
- [ ] Idempotent inbox apply + JetStream cursor (resumable after days offline).
- [ ] Conflict resolution: HLC per-field LWW; append-only ledgers summed, never overwritten;
      tombstone deletes.
- [ ] Snapshot + replay bootstrap; DR drill; local WAL archiving; offline license grace.

**Bridges established:** the bi-directional sync hub (flow §3 in [20](../20-dataflow.md)).
**Now FAST:** every existing slice syncs with **zero slice code changes** — the seam was the outbox.
**Parallel:** node↔cloud relay and the inbox/conflict engine can be built by separate tracks.

---

## M7 — Guardian Portal & Mobile (Expo)  → [Roadmap Phase 7]

**Goal:** child-scoped read access for guardians; mobile reuse of the React core.

- [ ] `GUARDIAN` user type + `guardian`/`guardian_student` scoping (links from M3 exist).
- [ ] Child-scoped read API: attendance, marks, fees, notices — restricted to the
      guardian's `guardian_student` set **on top of** RLS (flow C in [20](../20-dataflow.md)).
- [ ] T2: online fee payment (needs gateway) + guarded writes (consent, contact, leave requests).
- [ ] Expo app: reuse React components/hooks/types; start **read-heavy**
      (guardians/teachers view), defer writes ([18](../18-guardian-portal.md)).

**Now FAST:** mobile screens reuse the same generated TS client + validation.
**Parallel:** guardian read API (BE) and Expo shell (FE) split after contract freeze.

---

## M8 — LMS (Academics T3)  → [Roadmap Phase 8]

**Goal:** content → assignments → submission/grading, growing inside `academics`
then splitting out ([19](../19-lms.md), [database/07-lms.md](../database/07-lms.md)).

- [ ] T3a — `lesson_plan`, `material`, `assignment` inside `academics` (files via MinIO).
- [ ] T3b — `submission`, `submission_file`, `grade`; grades flow into append-only marks.
      **Split the `learning` slice here.**
- [ ] T3c — quizzes, discussion, completion tracking.

**Parallel:** T3a/T3b/T3c are sequential by data dependency, but FE and BE split per tier.

---

## Critical path vs parallelizable

**Strictly sequential (the spine — do not parallelize):**
M0 → M1 → M2 → M3. Each adds a seam the next depends on (RLS → auth → tenant → rbac →
first real mutation). The walking skeleton must be complete before replication begins.

**Within any slice (always sequential):**
migration+RLS → sqlc queries → service(tx) → handler(rbac) → **freeze OpenAPI** → FE.

**Parallelizable after the spine (M3 done):**
- M4 (control plane) runs alongside M5 — different binary, different slices.
- M5's four slices (teachers/staff/academics/finance) run as independent tracks.
- Inside every slice, **FE and BE split the moment OpenAPI is frozen** — the contract
  is the fence.
- M6's relay vs inbox/conflict engine; M7's read API vs Expo shell.

---

## Definition of done per slice

A slice is not done until **all** of these are true:

- [ ] **Migration + RLS** — one goose migration, expand-only, base + sync columns,
      RLS policy on every table ([database/00-conventions.md](../database/00-conventions.md)).
- [ ] **sqlc queries** — raw SQL in `db/queries`, typed Go generated, no ORM.
- [ ] **Service + outbox + audit** — every mutation writes domain row + `outbox` +
      `audit_log` in **one transaction** (the golden rule, [20](../20-dataflow.md)).
- [ ] **Handler + RBAC** — endpoints behind `requirePermission(...)`; correct namespace.
- [ ] **OpenAPI** — contract added and **frozen** before FE starts.
- [ ] **TS client** — regenerated; FE consumes only the generated client.
- [ ] **React screen** — feature screen wired to the client + Zod validation.
- [ ] **Tests** — service tx atomicity (row+outbox+audit together), RLS isolation,
      handler authz, and append-only invariants where applicable.

---

## Cross-references
- Phased build order — [07](../07-roadmap.md)
- Seam contracts (middleware, outbox envelope, codegen) — [bridges.md](./bridges.md)
- Stack & request path — [02](../02-architecture.md) · slice anatomy — [04](../04-vertical-slicing.md)
- Write path & golden rule — [20](../20-dataflow.md) · sync — [08](../08-offline-sync.md)
- Table designs — [database/](../database/) · DB principles — [21](../21-database-architecture.md)
