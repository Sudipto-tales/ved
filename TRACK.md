# VED — Build Tracker

The single place that records **how far the build has progressed** against the plan
([docs/plan/README.md](./docs/plan/README.md)). Update the status marks as work lands.

**Legend:** ✅ done · 🟡 scaffolded / partial · ⬜ not started

> **YOU ARE HERE:** M2 (RBAC) **complete and verified**. The `requirePermission` gate is
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
| **M3** Onboarding + Students | credential gen, onboarding engine, first real domain slice | ⬜ |
| **M4** Control Plane | registration state machine, payment-proof, licensing | ⬜ |
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
| Demo slice (golden rule) | `internal/features/notes` (row+outbox+audit in 1 tx) | ✅ written |
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
| notes (demo) | ADMIN | 1 | ✅ |
| students | ADMIN/STAFF/STUDENT | roster, onboard, portal | ⬜ |
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
| platform | SUPERADMIN | registrations, tenants, … | ⬜ (separate build) |

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
7. **Begin M3 (Onboarding + Students):** credential/email generator + config-driven
   onboarding engine in the kernel, `student`/`guardian` tables, `student.onboard` in one
   tx (users + memberships + profile + guardian links + outbox + audit), gated by
   `requirePermission("student.onboard")`. The `notes` demo slice retires here.
8. **DoD backfill:** frozen OpenAPI spec files (`/auth/*`, `/access/*`) + automated DB
   integration tests (RLS isolation, golden-rule atomicity); Redis cache for effective
   permissions.

## Definition of done per slice

See the checklist in [docs/plan/README.md](./docs/plan/README.md) (migration+RLS →
sqlc → service+outbox+audit → handler+rbac → OpenAPI → TS client → React → tests).
