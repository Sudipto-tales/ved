# VED — Build Tracker

The single place that records **how far the build has progressed** against the plan
([docs/plan/README.md](./docs/plan/README.md)). Update the status marks as work lands.

**Legend:** ✅ done · 🟡 scaffolded / partial · ⬜ not started

> **YOU ARE HERE:** M8 (LMS) **complete and verified** — the final roadmap milestone, so
> the whole phased build M0→M8 is now done. The new `learning` slice delivers the
> content→submit→grade loop: teachers publish **assignments** (+ materials) anchored on a
> `teaching_assignment`; students **submit** (self-service — resolved from their membership,
> no staff perm; LATE derived from `due_at`); teachers **grade**. `submission` and `grade`
> are **append-only** (a resubmission/re-grade is a NEW row, latest wins; DB triggers block
> UPDATE/DELETE). The marquee **integration point**: grading an assignment with `max_marks`
> writes an append-only `mark_entry` into academics **in the same tx** — so an assignment
> counts toward assessment from the ONE marks ledger, not a parallel one (`mark_entry`
> gained a nullable `exam_id` + `assignment_id`). Files carry only a MinIO `storage_key`.
> Verified live: assignment published; student submit SUBMITTED → resubmit RESUBMITTED (2
> rows kept, teacher sees latest-per-student); grade 72 → mark_entry 72; re-grade 85 → 2
> grades + 2 mark_entries kept, effective 85; `UPDATE grade`/`DELETE submission` rejected
> by trigger; student can't create/grade (403), non-student can't submit (403). FE: teacher
> Assignments + grading screens, `tsc`/build clean. **The roadmap is complete (M0–M8).**
> _Carried-forward (post-roadmap polish): LMS T3c (quizzes/discussion), lesson plans,
> MinIO blob upload, student/guardian LMS FE; plus the standing items — platform SPA,
> academics setup FE, OpenAPI specs, DB-integration tests, M6 hardening (HLC-merge/mTLS/DR)._

> **(prev) M7 (Guardian Portal) — complete and verified** — child-scoped read
> access on top of RLS. Per docs/18 the guardian is *an actor + a portal, not a slice*:
> the only schema change is a nullable `guardian.membership_id` (links a login to a
> contact record). A staff **promote** flow (`POST /students/guardians/{id}/promote`,
> `student.update`) gives a contact-only guardian a GUARDIAN login + the seeded
> **Guardian** role (auto guardian.* perms) via the shared onboarding engine. The new
> **`guardian` feature** owns no tables — it's a child-scoped projection: it resolves the
> caller's `guardian_id` from their membership, then restricts every read to the
> `guardian_student` set (query layer) **on top of** RLS (defence-in-depth), reusing the
> academics + finance *services* (not their tables). Verified live: promoted guardian
> logs in with 4 guardian.* perms (not tenant.admin); sees only their **one** linked child;
> reads that child's fees (outstanding 3000) + attendance (200); **a foreign child →
> 403** (both fees & attendance); a non-guardian (admin) → 403; the guardian can't touch a
> staff endpoint (`/students` → 403). FE: guardian dashboard (multi-child switcher) + child
> attendance + child fees, `tsc -b` + `vite build` clean. Next: **M8 (LMS)**, Tier-2
> guarded writes (online pay, leave requests), the Expo mobile app, or finishing
> M6 hardening. _DoD carried forward as before (OpenAPI specs, DB-integration tests,
> platform SPA, academics FE, HLC-merge/mTLS/DR)._

> **(prev) M6 (Sync & Offline) — core complete and verified** — the system is now
> local-first. Because every mutation already wrote an `outbox` row in its transaction
> (the golden rule, since M0), this was **wiring, not a rewrite**. A **relay** worker on the
> node publishes unsent outbox rows to **NATS JetStream** (`tenant.<id>.<aggregate>.<op>`,
> dedup MsgId = event id) and marks them sent; the cloud **sync hub** (`cmd/controlplane`)
> runs a **durable** JetStream consumer that idempotently records every tenant's events in
> the durable history `control_plane.sync_event` (PK on event_id = the inbox dedupe).
> Verified live on real JetStream: the relay drained the **54-event backlog** (M1–M5) into
> the cloud history and marked the outbox sent; a fresh onboard flowed end-to-end (+1);
> **idempotency** — re-arming an event republished it with **no duplicate** in the cloud
> (JetStream MsgId + PK); and the **offline-replay drill** — hub killed, node kept
> producing (events buffered in JetStream), hub restarted → its durable cursor **resumed**
> and applied the buffered event. Pillars 1–4 (outbox · UUIDv7 · JetStream · idempotent
> inbox + resumable cursor) are live; the append-only ledgers (M5) already cover
> "lossless where it matters". _Deferred/carried-forward: per-field HLC LWW merge for
> mutable rows + tombstone apply (pillar 5); mTLS + per-tenant NATS accounts; cloud→node
> config push-down; snapshot/replay bootstrap + DR drill; local WAL archiving; offline
> license grace. Plus the platform SPA, academics FE, OpenAPI specs, DB-integration tests._

> **(prev) M5 — complete and verified** — all four replication slices done
> (teachers, staff, **academics**, **finance**). The design care point — **append-only
> ledgers** — is proven end to end. Academics adds the structure (program → stage →
> subject → section → enrollment + exam) plus the two append-only ledgers
> **attendance_event** and **mark_entry**; finance adds the **append-only, event-sourced
> ledger** (fee_head → invoice/DEBIT → payment/CREDIT with **gapless receipts** →
> **derived outstanding** Σ DEBIT−Σ CREDIT → **reversal** void). **DB triggers** block
> UPDATE/DELETE on every append-only table (defence at the database). A minimal
> `academic_year` (tenant-setup subset) is seeded for dev. Verified live: attendance
> re-mark keeps all 3 rows, latest-by-hlc wins, summary summed (PRESENT 2/2); mark
> re-grade → effective 45; invoice 5000 → outstanding 5000 → pay 5000 → 0 → void 2000 →
> 2000 (payment row preserved); receipts RCT-00001/00002 gapless; `UPDATE ledger_entry`
> and `DELETE attendance_event` rejected by trigger; no-token 401; RLS foreign-tenant 0.
> FE: finance **student-ledger** screens (issue charge / record payment / void / derived
> outstanding), `tsc -b` + `vite build` clean (academics setup/attendance UI deferred).
> Next: the platform SPA (M4), or **M6 (sync)** — the outbox is already populated by every
> slice, so sync is wiring. _DoD carried forward: OpenAPI specs; automated DB-integration
> tests; fee structures/schedules/concessions/fines, COURSE_BASED mode, timetable; full
> tenant-setup slice; academics FE._

> **(prev) M5 (Teachers & Staff)** — the "bridges-first,
> then replicate" payoff. The shared people machinery is now a kernel **onboarding engine**
> (`internal/platform/onboarding`): handle generation + temp password + user + membership
> + roles in one tenant tx, plus the aggregate event/audit writer. `students` was
> **refactored** onto it (and re-verified), and `teachers` (TEACHER) + `staff` (EMPLOYEE)
> are near-copies that only add their profile table + domain event — each is
> onboard/roster/detail end-to-end (DB → engine → handler `requirePermission` → React).
> Verified live: `teacher.onboard`/`staff.onboard` golden rule (1 row ⇒ 1 outbox ⇒ 1
> audit); handles `alanturing.teacher@ved.com` / `gracehopper.employee@ved.com` (correct
> type suffixes); membership user_type TEACHER/EMPLOYEE; duplicate employee_code 409;
> rosters/detail 200; **students still pass post-refactor**; no-token 401; RLS on
> `teacher` as `ved_app` (own 1, foreign 0). FE: teachers + staff roster/onboard/detail
> screens, `tsc -b` + `vite build` clean. Next: **M5 cont.** (`academics`/`finance` —
> append-only ledgers/marks/attendance), the platform SPA, or **M6** (sync). _DoD carried
> forward: OpenAPI specs; automated DB-integration tests; person_document upload (MinIO);
> onboarding wizard/approval states._

> **(prev) M4 (Control Plane) — backend complete and verified** — the central
> cloud that registers schools and provisions tenants, a SEPARATE binary
> (`cmd/controlplane`), SEPARATE schema (`control_plane`), and SEPARATE permission
> namespace (`platform.*`). The full chain runs end to end: platform superadmin login →
> school self-registers (slug validated/unique) → uploads payment proof
> (`PENDING_PAYMENT_REVIEW`) → superadmin **approves** → in one control-plane tx the
> registration state machine advances (tenant ACTIVE + subscription ACTIVE + **gapless**
> invoice + payment-proof APPROVED + a **signed** offline license) → then the **cross-plane
> handoff** provisions the tenant plane: first admin (generated credential + temp
> password), the M2 RBAC bootstrap (default roles + School Admin), and the M3
> tenant_profile slug. Verified live: register/duplicate-slug 409, proof 202, approve →
> `INV-2026-00001/00002` gapless, license signed; **the provisioned admin logs into the
> tenant node and resolves 31 effective permissions (tenant.admin) and hits gated
> `/access/roles` 200**; platform endpoints 401 without a platform token. (Found & fixed a
> real bug: `BootstrapTenant`'s School-Admin lookup relied on RLS, which the
> superuser control plane bypasses — now filters `tenant_id` explicitly, defence-in-depth.)
> license sign/verify is unit-tested. **Deferred:** the platform **SPA** (`web/platform/`
> is a separate Vite build, still manifest-only) and MinIO payment-proof upload (metadata
> + storage_key wired; blob path is the next step). Next: build the platform SPA, and/or
> **M5** (replicate the M3 shape for teachers/staff/academics/finance). _DoD carried
> forward: OpenAPI specs; automated DB-integration tests; control-plane audit log._

> **(prev) M3 (Onboarding + Students) — complete and verified** — the first real
> domain slice, which completes the walking skeleton. `student.onboard` runs the whole
> admission in **one transaction** (flow A): global `users` (generated login handle +
> temp password, `must_reset_password`) + `memberships` (STUDENT) [+ optional roles] +
> `student` profile + `guardian`(s) + `guardian_student` links + `outbox[student.enrolled]`
> + audit. A kernel credential generator (`internal/platform/credential`) produces the
> `{name}.{type}@{slug}.com` handle with global-uniqueness increment + a one-time temp
> password (unit-tested). A minimal `tenant_profile` (just `slug`) is seeded for the dev
> tenant (full tenant-setup slice + control-plane provisioning come at M4). The `notes`
> demo slice is **retired** (BE + FE removed; index now redirects to `/students`).
> Verified end-to-end: onboard 201 with golden rule (1 student ⇒ 1 outbox ⇒ 1 audit, +1
> guardian_student); handle `johndoe.student@ved.com` then `johndoe2.student@ved.com` on
> collision; new student `must_reset_password=true` on first login; duplicate admission
> 409; roster/detail 200; no-token 401; RLS on `student` as `ved_app` (own 2, foreign 0).
> Frontend: roster + onboard wizard (shows credentials once) + detail screens, `tsc -b` +
> `vite build` clean. Next: **M4** (Control Plane) and/or **M5** (replicate the slice for
> teachers/staff/academics/finance). _DoD gaps carried forward: OpenAPI spec files;
> automated DB-integration tests (RLS/golden-rule proven live; credential/gate logic
> unit-tested); document upload (person_document table exists; MinIO path is M4); the
> multi-step onboarding wizard + approval states (skip/direct path shipped)._

> **(prev) M2 (RBAC) — complete and verified.** The `requirePermission` gate is
> real and backed by data: a code-defined permission catalog (31 keys) is seeded at
> startup into the global `permissions` table; tenant provisioning seeds default system
> roles (School Admin, Admission Officer, Class Teacher, Accountant, Student) + their
> `role_permissions` and attaches the first admin to **School Admin** (`tenant.admin`).
> The `access` slice ships roles CRUD, designations, and membership-role assignment —
> every mutation row + outbox + audit in one tx, behind `authz.Require(...)`.
> `tenant.admin` short-circuits to "all within this tenant". Verified end-to-end on the
> deployed stack: admin login 200 → `/me/permissions` = 31 (tenant.admin expansion);
> role create 201 with golden rule (1 row ⇒ 1 outbox ⇒ 1 audit, +1 role_permissions);
> system-role delete 409; **role-less member 403 with `missing permission: role.manage`
> and empty `/me/permissions`**; foreign-tenant 403, no-token 401; RLS on `roles` as
> `ved_app` (own tenant 6, foreign 0). Frontend: AuthProvider now loads **real**
> per-tenant permissions from `/me/permissions` (the M1 `['*']` wildcard is gone),
> `PermissionGuard` waits for them, and the `access/roles` + `access/user-roles` screens
> are built; `tsc -b` + `vite build` clean. Next: **M3** (Onboarding + Students — first
> real domain slice; the `notes` demo retires there). _DoD gaps carried forward: a
> formal OpenAPI spec file + automated DB integration tests (RLS/golden-rule proven live
> via curl+psql; gate logic has unit tests); Redis caching of effective permissions is a
> planned optimization (currently resolved per-request from the DB)._

---

## Frontend buildout (Minimal Tech) — ✅ all pages created

Re-skinned the shared `shared/ui` token/kit layer to **Minimal Tech** (emerald/cyan/coral
on a soft-gray canvas, 16px cards + faint border + soft shadow, sparklines + growth deltas
+ hero banners) — both apps inherit it. Added kit primitives (DataTable, EmptyState, Field,
Tabs, Toolbar, Sparkline, GrowthDelta, HeroBanner, Select, StatCard spark/delta). Fixed
persona-scoped nav/routing (`AppShell` + `PersonaHome`: EMPLOYEE→management, TEACHER/STUDENT/
GUARDIAN→own portal). Built **every planned page** across the three apps via parallel
feature agents: **96 tenant pages + 11 platform pages wired (0 "planned" left)** + a public
**signup site** (landing→register→proof→status). New read endpoints over existing tables
(academics lists, finance invoices/payments, students/guardians, access designations/profile/
years, guardian child-marks, learning materials, platform registration/proof detail) + public
`GET /plans`. Pages over not-yet-existing tables (fee structures, timetable, dropdowns,
notices, …) are polished **designed scaffolds**. Both apps `tsc -b` + `vite build` clean;
`go build`/`vet`/`gofmt` clean; new endpoints smoke-tested 200; node/controlplane/web images
rebuilt. Roadmap (P0–P6) in [docs/22](./docs/22-frontend.md); tokens in [docs/23](./docs/23-design-system.md).

## Milestone tracker (→ [plan](./docs/plan/README.md))

| Milestone | Scope | Status |
|---|---|---|
| **M0** Foundations & walking skeleton | repo layout, migration+RLS, middleware chain, one slice end-to-end, FE shell | ✅ verified (skeleton + RLS enforcing) |
| **M1** Identity & Tenancy | real `users`/`memberships`, JWT login, tenant resolve | ✅ verified (argon2id + JWT + memberships + RLS-authorised tenant) |
| **M2** RBAC | permission catalog, roles, `requirePermission`, provisioning bootstrap | ✅ verified (catalog seed + default roles + real `requirePermission` + FE real perms) |
| **M3** Onboarding + Students | credential gen, onboarding engine, first real domain slice | ✅ verified (student.onboard tx + credential gen + roster/detail; notes retired) |
| **M4** Control Plane | registration state machine, payment-proof, licensing | ✅ verified — backend + **platform SPA** (login, registrations review/approve, tenants, licenses) |
| **M5** Teachers/Staff/Academics/Finance | replicate the M3 shape across slices | ✅ verified (teachers, staff, academics, finance; append-only ledgers DB-enforced) |
| **M6** Sync & Offline | NATS relay + inbox + HLC; wiring, not rewrite | 🟡 core verified (relay → JetStream → idempotent durable hub + offline replay); HLC-merge/mTLS/DR deferred |
| **M7** Guardian Portal & Mobile | child-scoped read API; Expo read-heavy | 🟡 portal verified (child-scoped read API + promote + FE); Expo mobile + T2 writes ⬜ |
| **M8** LMS | content → assignments → submission/grading | ✅ verified (T3a+T3b: assignments/materials → submit → grade → marks; append-only; T3c deferred) |

---

## DoD backfill — OpenAPI contract + DB-integration tests — ✅ complete (all slices)

The two cross-cutting DoD gaps carried forward since M1 ("OpenAPI specs" + "automated
DB-integration tests") are now closed across **every** slice. The `students` slice proved
the shape; the rest replicate it. **OpenAPI is the frozen fence:** Orval generates the TS
client + Zod from the spec, and each FE feature **consumes the generated client** (the
hand-written contract types are deleted — the spec is the single source).

**Tooling (shared):**
- Tenant-plane spec: `server/api/openapi/openapi.yaml` (root) + `components/common.yaml` + `paths/<slice>.yaml` — **9 slices, ~50 operations**, redocly-lint clean.
- Control-plane spec (separate plane, platform JWT): `server/api/openapi/controlplane.yaml` — 11 operations, redocly-lint clean.
- Codegen: `web/orval.config.ts` (tenant app + platform app targets), mutators `web/src/shared/api/mutator.ts` + `web/platform/src/shared/mutator.ts`, `npm run gen:api`. Generated dirs gitignored.
- Test harness: `server/internal/platform/testdb/testdb.go` — `Pool` (ved_app, RLS-enforcing) + `ControlPlanePool` (owner) + throwaway tenants, behind the `integration` build tag. `./ved.sh test` ensures infra and runs `-tags=integration`; default `go test ./...` stays DB-free.

**Per-slice (spec ✅ · FE consumes generated ✅ · integration tests ✅ pass on live PG):**

| Slice | Ops | Integration tests (what they prove) |
|---|---|---|
| students | 6 | RLS isolation · golden-rule atomicity · rollback (no orphan outbox/audit) |
| teachers | 3 | RLS · golden rule · dup employee_code rollback |
| staff | 3 | RLS · golden rule · dup rollback |
| access (RBAC) | 12 | RLS on roles · role-create golden rule · dup-name rollback |
| finance | 7 | RLS · derived outstanding (Σ DEBIT−Σ CREDIT) · append-only void preserves payment · gapless receipts |
| academics | 14 | RLS · **append-only attendance** (correction = new row, latest-by-hlc wins) |
| learning (LMS) | 6 | RLS · **append-only** submit/grade · grade → mark_entry in the ONE marks ledger |
| identity | 4 | login with generated temp credential (must-reset) · wrong-password rejected |
| guardian | 5 | child-scoping boundary — sees only linked child, **foreign child rejected** |
| registration (CP) | 11 | golden chain: register → proof → approve → tenant ACTIVE + **gapless invoice** + license + provisioned admin |

**Live verification:** `./ved.sh test ./...` → **all 10 slices pass** on the live Postgres
(28 integration tests). `go build`/`go vet`/`gofmt` clean; both web apps `tsc -b` +
`vite build` + `build:platform` clean.
**Carried-forward (minor):** Go-side request validation (`go-playground/validator`) and
wiring the generated **Zod** schemas into the FE forms (schemas are generated, not yet
imported by forms) — both incremental, neither blocks the contract or the tests.

## Documentation — ✅ complete

`docs/` (01–22 + `database/` + `plan/` + `commands.md`). Architecture, slices, RBAC,
sync, finance, academics, guardian, LMS, dataflow, DB architecture, frontend, the
per-slice schema plan, the execution plan, the component bridges, and the tooling
reference are all written and cross-linked.

## Tooling — ✅ complete

| Item | Status |
|---|---|
| `ved.sh` (build/start/stop + helpers + `test`) | ✅ runs, syntax-checked |
| `docker-compose.yml` (infra + `app` profile) | ✅ `docker compose config` validates |
| `.env.example` | ✅ |
| `docs/commands.md` | ✅ |
| OpenAPI → TS client codegen (`web/ npm run gen:api`, Orval; tenant + platform apps) | ✅ all slices |
| DB-integration tests (`./ved.sh test`, `-tags=integration`) | ✅ all 10 slices (28 tests) |

`./ved.sh up infra` works today. `./ved.sh up` (full) works once the steps below pass.

---

## Backend — `server/` (M0) — 🟡 scaffolded

| Component | File(s) | Status |
|---|---|---|
| Go module | `go.mod`, `go.sum` | ✅ tidied, `go.sum` generated |
| Binaries | `cmd/node`, `cmd/controlplane` | ✅ written |
| Config / DB pool | `internal/platform/config`, `internal/platform/db` | ✅ written |
| HTTP kernel + middleware | `internal/platform/httpx/{httpx,tenant}.go` | ✅ written (auth/rbac seams are stubs → M1/M2) |
| Migrations (embedded, goose) | `db/migrations/{embed.go,00001_cross_cutting.sql}` | ✅ written |
| Cross-cutting tables + RLS | migration 00001: `outbox`,`inbox`,`sync_cursor`,`audit_log` | ✅ written |
| Non-superuser app role (RLS enforcement) | migration 00002 `ved_app` + pool `SET ROLE` | ✅ verified isolating |
| Demo slice (golden rule) | `internal/features/notes` (row+outbox+audit in 1 tx) | ✅ proved the seam, then **retired at M3** (replaced by `students`) |
| Health/readiness | `internal/features/health` | ✅ written |
| **Compile + run verified** | — | ✅ `go build` 0; ✅ `./ved.sh up` round-trip (notes POST/GET, golden rule, 400 on no tenant) |

**RLS — fixed & verified.** Migration 00002 creates the `ved_app`
(NOSUPERUSER/NOBYPASSRLS) role; the node's pool runs `SET ROLE ved_app` on every
connection (`db.Connect`), while migrations keep running as the owner. Verified:
tenant-1 reads return only tenant-1 rows, tenant-2 only tenant-2's, and inserts pass
the RLS `WITH CHECK`. (Production: have the app's login role be a member of `ved_app`
rather than relying on a superuser's `SET ROLE`.)

## Backend — `server/` (M1 Identity) — ✅ verified

| Component | File(s) | Status |
|---|---|---|
| Migration `users` (global, no RLS) + `memberships` (tenant-scoped, RLS) | `db/migrations/00003_identity.sql` | ✅ applied |
| Cross-tenant login read (controlled bypass) | `auth_memberships(uuid)` `SECURITY DEFINER` fn | ✅ |
| Password hashing (argon2id, PHC-encoded) | `internal/platform/crypto` | ✅ + unit tests |
| JWT kernel (access+refresh, HS256) | `internal/platform/auth` | ✅ + unit tests |
| Auth middleware (Bearer JWT → identity) | `internal/platform/httpx/auth.go` | ✅ (replaces M0 stub) |
| Tenant-context **authorised** (tenant ∈ memberships → else 403) | `internal/platform/httpx/tenant.go` | ✅ |
| Identity slice (login/refresh/reset/me + dev seed) | `internal/features/identity/` | ✅ golden rule on seed |
| Node wiring (public / authed / authed+tenant groups) | `cmd/node/main.go` | ✅ |

**Dev seed:** `DEV_SEED=true` idempotently creates a demo tenant + admin
(`admin@ved.local` / `admin1234`, tenant `0189…0001`) via row+outbox+audit in one tx.
**Carried-forward DoD:** formal OpenAPI spec file + automated DB-integration tests
(RLS/golden-rule proven live via curl+psql for now).

## Backend — `server/` (M2 RBAC) — ✅ verified

| Component | File(s) | Status |
|---|---|---|
| Migration `permissions`(global) + `designations`/`roles`/`role_permissions`/`membership_roles` (tenant-scoped + RLS) + `memberships.designation_id` FK | `db/migrations/00004_rbac.sql` | ✅ applied |
| Code-defined permission catalog (31 keys) + default-role template | `internal/platform/authz/catalog.go` | ✅ |
| Effective-permission resolver (roles → permissions, RLS) | `internal/platform/authz/resolver.go` | ✅ |
| `requirePermission` gate (`authz.Require`, tenant.admin short-circuit) | `internal/platform/authz/middleware.go` | ✅ + unit tests |
| `access` slice: roles CRUD, designations, member-role assignment, `/me/permissions` | `internal/features/access/access.go` | ✅ golden rule per mutation |
| Read-only tenant-setup GETs (`/access/profile`, `/access/academic-years`, gated `tenant.settings`) powering the admin setup screens | `internal/features/access/access.go` | ✅ read-only (full tenant-setup write slice later) |
| Catalog seed + tenant provisioning bootstrap (default roles + attach admin) | `internal/features/access/provisioning.go` | ✅ idempotent |
| Node wiring (seed catalog, bootstrap dev tenant, mount gated slice) | `cmd/node/main.go` | ✅ |

**Live verification:** admin `/me/permissions` = 31 (tenant.admin → full catalog); role
create 201 with 1 row ⇒ 1 outbox ⇒ 1 audit (+1 role_permissions); system-role delete
409; role-less member → 403 `missing permission: role.manage` + empty `/me/permissions`;
foreign-tenant 403; no-token 401; RLS on `roles` as `ved_app` (own 6, foreign 0).
**Carried-forward:** Redis cache of effective perms (currently per-request DB resolve);
OpenAPI spec file; automated DB-integration tests.

## Backend — `server/` (M3 Onboarding + Students) — ✅ verified

| Component | File(s) | Status |
|---|---|---|
| Migration `tenant_profile`(minimal slug subset) + `student`/`guardian`/`guardian_student`/`person_document` (tenant-scoped + RLS) | `db/migrations/00005_people.sql` | ✅ applied |
| Kernel credential generator (slugify, type suffix, global-unique handle, temp password) | `internal/platform/credential/` | ✅ + unit tests |
| `students` slice: `student.onboard` (one-tx flow A), roster, detail | `internal/features/students/students.go` | ✅ golden rule |
| Dev tenant_profile seed (slug `ved`) | `internal/features/students/provisioning.go` | ✅ idempotent |
| Node wiring (mount students, seed profile) + **notes demo retired** | `cmd/node/main.go` | ✅ |

**Live verification:** onboard 201 → 1 student ⇒ 1 outbox[student.enrolled] ⇒ 1 audit
(+1 guardian_student); handle `johndoe.student@ved.com` then `…johndoe2…` on collision;
new student `must_reset_password=true`; duplicate admission 409; roster/detail 200;
no-token 401; RLS on `student` as `ved_app` (own 2, foreign 0).
**Carried-forward:** OpenAPI spec; DB-integration tests; document upload (MinIO, M4);
onboarding wizard/approval states (direct/skip path shipped).

## Backend — `server/` (M4 Control Plane) — ✅ verified (FE deferred)

Separate binary (`cmd/controlplane`), separate schema (`control_plane`), separate
permission namespace (`platform.*`). Control-plane tables carry **no** tenant_id/RLS/sync
(docs/database/01), so control-plane writes are plain transactional; the golden rule
applies only to the tenant-plane rows that provisioning creates in `public`.

| Component | File(s) | Status |
|---|---|---|
| Control-plane migration (own schema + own goose table): registration, tenant, plan_catalog, subscription, invoice, payment_proof, license, platform_admin, gapless counter | `db/cpmigrations/00001_control_plane.sql` | ✅ applied |
| Migrate plumbing (`UpControlPlane`, separate FS + version table) | `internal/platform/migrate/migrate.go` | ✅ |
| Signed offline license kernel (HMAC sign/verify) | `internal/platform/license/` | ✅ + unit tests |
| Platform auth slice (admin login → platform JWT, `RequirePermission`, dev superadmin seed) — separate namespace | `internal/features/platform/` | ✅ |
| Registration slice: public register + payment-proof; platform list/approve/reject/tenants | `internal/features/registration/registration.go` | ✅ |
| Approve = state machine (tenant+subscription+gapless invoice+proof+signed license) **+ cross-plane provisioning** (tenant admin via credential gen + M2 RBAC bootstrap + M3 tenant_profile) | same | ✅ |
| Control-plane wiring (migrate cp, seed superadmin+plans, public+platform routes) | `cmd/controlplane/main.go` | ✅ |

**Dev seed:** platform superadmin `super@ved.platform` / `super1234`; plans Starter/
Standard/Premium. **Live verification:** full chain register→proof→approve→provision→
license; gapless `INV-2026-00001/00002`; the provisioned tenant admin logs into the node
and resolves **31** perms (tenant.admin) + gated `/access/roles` 200; platform routes 401
without a platform token; duplicate slug 409.
**Fixed:** `BootstrapTenant` School-Admin lookup now filters `tenant_id` explicitly (the
superuser control plane bypasses RLS — relying on it cross-attached the wrong tenant's
role; caught in live verification).
**Platform SPA (`web/platform/`) — ✅ built & verified.** A SEPARATE Vite build (own
`index.html`/`vite.config.ts`/entry, `npm run build:platform`) that reuses the tenant
design system (`@/shared/ui`) but has its own platform-scoped auth + API client (control
plane :8080, separate token namespace). Pages: superadmin login, dashboard (counts),
**Registrations** (review queue + approve→provision→license with one-time admin creds
shown, + reject), **Tenants**, **Licenses** (new `GET /platform/licenses` endpoint added).
`tsc -b` typechecks both apps; `vite build --config platform/vite.config.ts` builds the
separate bundle. Verified: every SPA endpoint live (login, queue, approve→`INV-2026-00003`
+ provisioned admin, tenants, licenses, 401 without token).
**Deferred / carried-forward:** MinIO payment-proof blob upload (metadata + storage_key
wired); platform subscriptions/analytics/support screens; a control-plane audit log;
OpenAPI specs; automated DB-integration tests.

## Backend — `server/` (M5 Teachers & Staff) — ✅ verified

The replication milestone: the shared people machinery is extracted once, then teachers
and staff are near-copies. (academics/finance — the other M5 slices — are not yet built.)

| Component | File(s) | Status |
|---|---|---|
| Shared onboarding engine (WithTenant, SchoolSlug, CreateMember = handle+temp pw+user+membership+roles, event/audit writer, SQL helpers) | `internal/platform/onboarding/` | ✅ |
| `students` refactored onto the engine (DRY; re-verified) | `internal/features/students/students.go` | ✅ |
| Migration `teacher` + `employee` profile tables (RLS + base/sync, partial-unique employee_code) | `db/migrations/00006_people_staff.sql` | ✅ applied |
| `teachers` slice (TEACHER): onboard/roster/detail, gated teacher.* | `internal/features/teachers/teachers.go` | ✅ golden rule |
| `staff` slice (EMPLOYEE): onboard/roster/detail, gated staff.* | `internal/features/staff/staff.go` | ✅ golden rule |
| Node wiring (mount teachers + staff) | `cmd/node/main.go` | ✅ |

**Live verification:** teacher/staff onboard 201 with golden rule (1 row ⇒ 1 outbox ⇒ 1
audit); handles `alanturing.teacher@ved.com` / `gracehopper.employee@ved.com` (correct
suffixes); membership user_type TEACHER/EMPLOYEE; duplicate employee_code 409; rosters +
detail 200; **students still pass after the refactor**; no-token 401; RLS on `teacher` as
`ved_app` (own 1, foreign 0).
**Carried-forward:** person_document upload (MinIO); onboarding wizard/approval states;
OpenAPI specs; DB-integration tests.

## Backend — `server/` (M5 Academics & Finance) — ✅ verified

The append-only ledgers — the milestone's one new design care point. Corrections insert
NEW rows (latest by hlc wins); counts/balances are SUMMED on read, never stored; **DB
triggers** (`forbid_mutation()`) reject UPDATE/DELETE so immutability holds at the
database, not just the repo.

| Component | File(s) | Status |
|---|---|---|
| Academics migration (+ minimal `academic_year`): program/stage/subject/curriculum/section/enrollment/teaching_assignment/exam + **attendance_event** & **mark_entry** (append-only) + `forbid_mutation()` triggers | `db/migrations/00007_academics.sql` | ✅ applied |
| Finance migration: fee_head + **invoice/invoice_line** + **payment** (gapless) + **ledger_entry** (append-only) + counter + immutability triggers | `db/migrations/00008_finance.sql` | ✅ applied |
| `academics` slice: structure setup; `attendance.mark` + `marks.enter` (append-only, golden rule); derived reads (latest-by-hlc, summed summary) | `internal/features/academics/` | ✅ |
| `finance` slice: fee-heads; invoice (DEBIT); payment (CREDIT, gapless, flow B); void (REVERSAL); **derived** outstanding (Σ DEBIT−Σ CREDIT) | `internal/features/finance/finance.go` | ✅ |
| Shared `onboarding.Engine` reused for tenant tx + outbox/audit by both | `internal/platform/onboarding/` | ✅ |
| Dev `academic_year` seed; node wiring | `internal/features/academics/provisioning.go`, `cmd/node/main.go` | ✅ |
| Frontend: finance student-ledger (issue/pay/void/derived outstanding) | `web/src/features/finance/` | ✅ |

**Live verification:** attendance re-mark keeps all 3 rows, latest-by-hlc effective,
summary summed (PRESENT 2/2); mark re-grade → effective 45; invoice 5000 → outstanding
5000 → pay 5000 → 0 → void → 2000 (payment preserved); receipts RCT-00001/00002 gapless;
`UPDATE ledger_entry` + `DELETE attendance_event` rejected by trigger; no-token 401; RLS
foreign-tenant 0.
**Carried-forward:** academics setup/attendance FE; fee structures/schedules/concessions/
fines; COURSE_BASED mode; timetable; full tenant-setup slice (terms, rooms, dropdowns).

## Backend — `server/` (M6 Sync & Offline) — 🟡 core verified

Local-first by WIRING the existing outbox to JetStream — no rewrite (every write has
routed through the outbox since M0).

| Component | File(s) | Status |
|---|---|---|
| NATS JetStream transport kernel (connect, ensure stream, publish w/ MsgId, durable subscribe) | `internal/platform/bus/bus.go` | ✅ |
| Sync envelope + subject scheme `tenant.<id>.<aggregate>.<op>` | `internal/platform/sync/sync.go` | ✅ |
| Relay worker: unsent outbox → JetStream → mark sent (owner conn, spans tenants; at-least-once) | `internal/platform/sync/sync.go` | ✅ |
| Cloud durable history store + idempotent inbox (PK on event_id) | `db/cpmigrations/00002_sync.sql` (`control_plane.sync_event`) | ✅ applied |
| Sync hub: durable consumer `tenant.>` → idempotent apply | `internal/features/synchub/synchub.go` | ✅ |
| Wiring: relay in `cmd/node`, hub in `cmd/controlplane` (both NATS-down tolerant) | `cmd/*/main.go` | ✅ |

**Live verification (real JetStream):** relay drained the 54-event M1–M5 backlog into the
cloud history + marked outbox sent; fresh onboard flowed end-to-end (+1); re-armed event
republished with **no duplicate** (MsgId + PK dedup); **offline replay** — hub down → node
kept producing (buffered in JetStream) → hub restart resumed its durable cursor and applied
the buffered event. Pillars 1–4 live.
**Carried-forward:** pillar 5 (per-field HLC LWW merge for mutable rows + tombstone apply);
mTLS + per-tenant NATS accounts; cloud→node config push-down; snapshot/replay bootstrap +
DR drill; local WAL archiving; offline license-grace lock.

## Backend — `server/` (M7 Guardian Portal) — ✅ verified

A guardian is an actor + a portal, not a slice (docs/18). The portal owns no tables — it
is a child-scoped projection over students/academics/finance, the security boundary
enforced at the query layer (guardian_student) AND by RLS.

| Component | File(s) | Status |
|---|---|---|
| Migration: nullable `guardian.membership_id` (login → contact link) + partial unique | `db/migrations/00009_guardian_portal.sql` | ✅ applied |
| Seeded **Guardian** default role (guardian.* perms), auto-attached on promotion | `internal/platform/authz/catalog.go` | ✅ |
| Promote-guardian (`POST /students/guardians/{id}/promote`, `student.update`) → GUARDIAN login + Guardian role via the engine | `internal/features/students/students.go` | ✅ golden rule |
| `guardian` feature (no tables): resolve guardian_id → children, child attendance (reuses academics svc), child fees (reuses finance svc) | `internal/features/guardian/guardian.go` | ✅ |
| Node wiring | `cmd/node/main.go` | ✅ |
| Frontend: guardian dashboard (multi-child switcher) + child attendance + child fees | `web/src/features/guardians/` | ✅ |

**Live verification:** promoted guardian logs in with 4 guardian.* perms (not tenant.admin);
sees only their 1 linked child; own child fees (outstanding 3000) + attendance 200;
**foreign child → 403** (fees & attendance); non-guardian admin → 403; guardian → staff
`/students` 403.
**Carried-forward:** Tier-2 guarded writes (online fee pay via gateway, leave requests,
contact update via maker-checker); child marks/timetable reads; the Expo mobile app
(read-heavy, reuses this API + generated client).

## Backend — `server/` (M8 LMS / learning) — ✅ verified — ROADMAP COMPLETE

The LMS is academics' growth (docs/19, docs/database/07-lms.md): content → submit → grade,
with grades feeding the ONE append-only marks ledger.

| Component | File(s) | Status |
|---|---|---|
| Migration: `assignment` + `material` (T3a); `submission`/`submission_file`/`grade` (append-only, T3b) + triggers; `mark_entry` gains nullable `exam_id` + `assignment_id` | `db/migrations/00010_lms.sql` | ✅ applied |
| academics: `teaching_assignment` create (anchor for LMS content) | `internal/features/academics/academics.go` | ✅ |
| `learning` slice: assignment/material authoring (academics.manage); student submit (self-service, LATE detection, append-only); grade (marks.enter, append-only) + assignment-sourced `mark_entry` in same tx; list submissions (latest per student + grade) | `internal/features/learning/learning.go` | ✅ |
| Node wiring | `cmd/node/main.go` | ✅ |
| Frontend: teacher Assignments (list/create) + Assignment detail (submissions + grading) | `web/src/features/learning/` | ✅ |

**Live verification:** assignment published; submit SUBMITTED → resubmit RESUBMITTED (2
rows kept, teacher sees latest-per-student); grade 72 → assignment-sourced mark_entry 72;
re-grade 85 → 2 grades + 2 mark_entries kept, effective 85; `UPDATE grade` / `DELETE
submission` rejected by trigger; student can't create/grade (403), non-student can't
submit (403).
**Carried-forward:** T3c (quizzes/discussion/completion), lesson plans, MinIO blob upload,
student + guardian LMS screens.

## Frontend — `web/` (M0) — 🟡 architecture scaffolded

| Component | File(s) | Status |
|---|---|---|
| Toolchain | `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` | ✅ written |
| Entry + providers | `src/main.tsx`, `src/app/providers.tsx` | ✅ |
| Page-manifest contract | `src/shared/types/page.ts` | ✅ |
| Data-driven router + guards | `src/app/router.tsx`, `pages.ts`, `app/guards/*` | ✅ |
| Layouts | `app/layouts/{AppShell,AuthLayout}.tsx` | ✅ |
| Shared kernel | `shared/{api,auth,tenant,authz,ui,config,lib}` | ✅ |
| Design system (Premium SaaS Minimalism) | `shared/ui` tokens + kit + icons ([23](./docs/23-design-system.md)) | ✅ applied app-wide, typecheck clean |
| Auth (login) | `features/auth` | ✅ built (dev sign-in) |
| Notes demo (FE↔BE proof) | `features/notes` | ✅ built |
| Feature manifests (page plans) | 13 features + `platform` | ✅ written (103 pages planned) |
| Feature pages | all except auth/notes | ⬜ planned (render `PlannedPage`) |
| Control-plane app build | `web/platform` | 🟡 manifest only |
| Mobile (Expo) | `mobile/` | ⬜ placeholder dir |
| **Typecheck verified** | — | ✅ `npm install` + `tsc -b` clean. Run in browser (`./ved.sh up`) ⬜ |

### Frontend pages — build status by feature

All pages are scaffolded as `PageDef` manifests and browsable via `PlannedPage`.
Only `auth/login` and `notes` are built. Page inventory: [docs/22-frontend.md](./docs/22-frontend.md).

| Feature | Personas | Pages | Built |
|---|---|---|---|
| auth | PUBLIC | login, select-tenant, reset-password, no-access (+forgot planned) | ✅ (real JWT) |
| help | ALL | index + per-topic (`/help`, `/help/:slug`) + contextual `?` icons | ✅ |
| notes (demo) | ADMIN | retired at M3 | — (removed) |
| students | ADMIN/STAFF/STUDENT | roster, onboard, detail built; import/portal planned | 🟡 (roster + onboard + detail done) |
| teachers | ADMIN/STAFF/TEACHER | mgmt (roster/onboard/detail) done; portal planned | 🟡 (mgmt done) |
| staff | ADMIN/STAFF | mgmt (roster/onboard/detail) | ✅ (mgmt done) |
| onboarding | STAFF/ADMIN | wizard hub + approvals | ✅ (hub stepper links to students/teachers/staff onboard; approvals queue scaffold) |
| guardians | GUARDIAN | portal (dashboard + child attendance + fees done; marks/timetable/T2 planned) | 🟡 (T1 reads done) |
| academics | ADMIN | programs…timetable | 🟡 backend done (structure + append-only attendance/marks); FE planned |
| finance | ADMIN/STAFF | fees, ledger, audit | 🟡 backend done (append-only ledger); FE student-ledger done |
| access | ADMIN | roles, user-roles, designations, maker-checker | ✅ (roles + user-roles + designations WIRED; maker-checker designed scaffold) |
| admin | ADMIN | profile, academic-year, dropdowns, rooms, templates, holiday-calendar | ✅ (profile + academic-year READ live tenant_profile/academic_year; rest polished scaffolds) |
| communication | ADMIN | notices, notifications | ✅ (designed scaffolds, no backend) |
| reports | ADMIN | dashboards, exports, backup-restore | ✅ (dashboards KPI StatCards/sparklines; exports + backup-restore scaffolds, backup danger zone) |
| learning (LMS) | TEACHER/STUDENT/GUARDIAN | teacher assignments + grading done; student/guardian planned | 🟡 (teacher T3a/T3b done) |
| platform | SUPERADMIN | login + dashboard + registrations(approve/reject) + tenants + licenses built; subscriptions/analytics/support planned | 🟡 SPA core done (separate `web/platform` build) |

---

## Next steps (to finish M0 → start M1)

1. ~~**Backend build:** `go mod tidy && go build ./...`~~ ✅ done (`go.sum` generated).
2. ~~**Frontend install/typecheck:** `npm install && npm run typecheck`~~ ✅ done (tsc clean).
3. ~~**Run it:** `./ved.sh up`~~ ✅ API round-trip verified via curl. Browser smoke at
   http://localhost:5173 (sign in with a tenant id → Notes demo) still worth a look.
4. ~~**Harden RLS:** non-superuser `ved_app` role + pool `SET ROLE`~~ ✅ done & verified.
5. ~~**Begin M1:** replace the auth + tenant stubs with real `users`/`memberships` + JWT~~
   ✅ done & verified (argon2id login, JWT, memberships, RLS-authorised tenant, dev seed,
   FE login/tenant-picker/forced-reset).
6. ~~**Begin M2 (RBAC):** `roles`/`permissions`/`role_permissions`/`membership_roles`,
   code-defined permission catalog seeded at provisioning, real `requirePermission(...)`
   (the dev wildcard `['*']` in the FE auth provider flips to real perms here).~~ ✅ done
   & verified (catalog seed, default roles, `authz.Require`, FE real perms via
   `/me/permissions`).
7. ~~**Begin M3 (Onboarding + Students):** credential/email generator + onboarding,
   `student`/`guardian` tables, `student.onboard` in one tx, gated by
   `requirePermission("student.onboard")`. The `notes` demo slice retires here.~~ ✅ done
   & verified (credential generator, one-tx onboard, roster/onboard/detail screens, notes
   retired).
8. ~~**Begin M4 (Control Plane):** `cmd/controlplane` slices for school registration
   state machine, payment-proof, licensing, tenant provisioning (which calls the M2 RBAC
   bootstrap + M3 tenant_profile seed for real tenants).~~ ✅ backend done & verified
   (register→approve→provision→license + cross-plane handoff). **Remaining:** the platform
   SPA (`web/platform/`) + MinIO payment-proof upload + control-plane audit log.
8b. ~~**M5 (replicate):** clone the M3 shape for `teachers`/`staff`.~~ ✅ done & verified
   via a shared kernel **onboarding engine** (students refactored onto it too).
9b. ~~**Next:** `academics`/`finance` (append-only ledgers/marks/attendance).~~ ✅ done &
   verified — M5 complete (all four slices; DB-enforced append-only immutability).
10b. ~~**M6 (sync):** wire the outbox to NATS/JetStream.~~ ✅ core done & verified (relay →
   JetStream → idempotent durable hub + offline replay).
11b. ~~**M7** (Guardian Portal — child-scoped read API).~~ ✅ portal done & verified
   (promote + scoped reads + FE). Remaining M7: Expo mobile app + Tier-2 guarded writes.
12b. ~~**M8** (LMS — content → assignments → submission/grading).~~ ✅ done & verified.
   **The phased roadmap M0→M8 is COMPLETE.**
13b. **Post-roadmap polish (no roadmap milestone left):** ~~platform SPA~~ ✅ done;
   remaining — academics setup + student/guardian FE; LMS T3c (quizzes/discussion) + MinIO
   blob upload; Tier-2 guardian writes; M6 hardening (HLC-merge for mutable rows, mTLS,
   cloud→node push-down, DR drill); OpenAPI spec files + automated DB-integration tests.
9. **DoD backfill:** frozen OpenAPI spec files (`/auth/*`, `/access/*`, `/students/*`) +
   automated DB integration tests (RLS isolation, golden-rule atomicity); Redis cache for
   effective permissions; document upload (MinIO) + onboarding wizard/approval states.

## Definition of done per slice

See the checklist in [docs/plan/README.md](./docs/plan/README.md) (migration+RLS →
sqlc → service+outbox+audit → handler+rbac → OpenAPI → TS client → React → tests).
