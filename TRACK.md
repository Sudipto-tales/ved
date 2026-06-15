# VED — Build Tracker

The single place that records **how far the build has progressed** against the plan
([docs/plan/README.md](./docs/plan/README.md)). Update the status marks as work lands.

**Legend:** ✅ done · 🟡 scaffolded / partial · ⬜ not started

> **YOU ARE HERE:** M4 (Control Plane) **backend complete and verified** — the central
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

## Milestone tracker (→ [plan](./docs/plan/README.md))

| Milestone | Scope | Status |
|---|---|---|
| **M0** Foundations & walking skeleton | repo layout, migration+RLS, middleware chain, one slice end-to-end, FE shell | ✅ verified (skeleton + RLS enforcing) |
| **M1** Identity & Tenancy | real `users`/`memberships`, JWT login, tenant resolve | ✅ verified (argon2id + JWT + memberships + RLS-authorised tenant) |
| **M2** RBAC | permission catalog, roles, `requirePermission`, provisioning bootstrap | ✅ verified (catalog seed + default roles + real `requirePermission` + FE real perms) |
| **M3** Onboarding + Students | credential gen, onboarding engine, first real domain slice | ✅ verified (student.onboard tx + credential gen + roster/detail; notes retired) |
| **M4** Control Plane | registration state machine, payment-proof, licensing | ✅ backend verified (register→approve→provision→license + cross-plane handoff); platform SPA deferred |
| **M5** Teachers/Staff/Academics/Finance | replicate the M3 shape across slices | ⬜ |
| **M6** Sync & Offline | NATS relay + inbox + HLC; wiring, not rewrite | ⬜ |
| **M7** Guardian Portal & Mobile | child-scoped read API; Expo read-heavy | ⬜ |
| **M8** LMS | content → assignments → submission/grading | ⬜ |

---

## Documentation — ✅ complete

`docs/` (01–22 + `database/` + `plan/` + `commands.md`). Architecture, slices, RBAC,
sync, finance, academics, guardian, LMS, dataflow, DB architecture, frontend, the
per-slice schema plan, the execution plan, the component bridges, and the tooling
reference are all written and cross-linked.

## Tooling — ✅ complete

| Item | Status |
|---|---|
| `ved.sh` (build/start/stop + helpers) | ✅ runs, syntax-checked |
| `docker-compose.yml` (infra + `app` profile) | ✅ `docker compose config` validates |
| `.env.example` | ✅ |
| `docs/commands.md` | ✅ |

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
**Deferred / carried-forward:** the platform **SPA** (`web/platform/`, separate build);
MinIO payment-proof blob upload (metadata + storage_key wired); a control-plane audit log;
OpenAPI specs; automated DB-integration tests.

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
| teachers | ADMIN/STAFF/TEACHER | mgmt + teacher portal | ⬜ |
| staff | ADMIN/STAFF | mgmt | ⬜ |
| onboarding | STAFF/ADMIN | wizard, approvals | ⬜ |
| guardians | GUARDIAN | portal (multi-child, fees, …) | ⬜ |
| academics | ADMIN | programs…timetable | ⬜ |
| finance | ADMIN/STAFF | fees, ledger, audit | ⬜ |
| access | ADMIN | roles, user-roles built; designations/maker-checker planned | 🟡 (roles + user-roles done) |
| admin | ADMIN | tenant settings | ⬜ |
| communication | ADMIN | notices, notifications | ⬜ |
| reports | ADMIN | dashboards, exports, backup | ⬜ |
| learning (LMS) | TEACHER/STUDENT/GUARDIAN | T3 | ⬜ |
| platform | SUPERADMIN | registrations, tenants, … | ⬜ SPA (separate build) — **M4 backend live** |

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
8b. **M5 (replicate):** clone the M3 shape for `teachers`/`staff` (reuse the credential
   generator + onboarding engine), then `academics`/`finance` (append-only ledgers/marks/
   attendance). Independent tracks now the spine (M0→M3) + control plane exist.
9. **DoD backfill:** frozen OpenAPI spec files (`/auth/*`, `/access/*`, `/students/*`) +
   automated DB integration tests (RLS isolation, golden-rule atomicity); Redis cache for
   effective permissions; document upload (MinIO) + onboarding wizard/approval states.

## Definition of done per slice

See the checklist in [docs/plan/README.md](./docs/plan/README.md) (migration+RLS →
sqlc → service+outbox+audit → handler+rbac → OpenAPI → TS client → React → tests).
