# 07 — Roadmap (Phased Build Order)

Build cloud-first for the first module; route every write through a domain **event**
so the offline-sync layer can be added without a rewrite. Ship one slice fully
before starting the next.

## Phase 0 — Foundations
- Go monorepo with `cmd/node` + `cmd/controlplane`; shared kernel (`platform/`).
- Postgres + **RLS from the very first table**; `tenant_id` everywhere.
- sqlc + goose migrations wired up.
- React + Vite app shell with auth; Tauri desktop build working.
- OpenAPI spec → generated TS client.

## Phase 1 — Identity & Tenancy
- `users` + `memberships` + JWT (access + refresh), force-reset-on-first-login.
- Tenant context middleware (sets `app.tenant_id` for RLS).
- Login resolves memberships → active tenant selection.

## Phase 2 — RBAC (`access` slice)
- Seed permission catalog (code-defined).
- Roles, designations, role/permission assignment, multi-role memberships.
- `requirePermission(...)` middleware.
- Tenant provisioning seeds default roles + first admin (bootstrap).

## Phase 3 — Onboarding & Credentials
- Credential/email generator (slug + type suffix + uniqueness).
- Onboarding engine (config-driven, two paths: wizard vs `onboarding.skip`).
- First people slice end-to-end: **Students** (highest-pain Excel replacement).

## Phase 4 — Control Plane
- Admin signup + school registration **state machine**:
  `ADMIN_REGISTERED → ONBOARDING → PENDING_PAYMENT_REVIEW → ACTIVE / REJECTED / SUSPENDED`.
- Payment-proof upload (MinIO) + superadmin review UI.
- License issuance (signed) consumed by the school node.

## Phase 5 — Remaining Core Modules
- `teachers`, `staff` (reuse onboarding engine).
- `academics`: programs, stages, subjects, curriculum, sections, rooms, enrollment,
  teaching assignment, attendance, exams/marks, timetable. See
  **[17 — Academic Structure](./17-academics-model.md)** (`SECTION_BASED` mode for MVP).
- `finance`: fee structure, invoices, payments, receipts.

## Phase 6 — Sync & Offline (local-first)
See **[08 — Offline & Sync](./08-offline-sync.md)** for the full design.
- Schema prep (do early): `outbox`/`inbox`/`hlc`/`origin_node_id`/`version`/tombstones; UUIDv7 PKs.
- Node provisioning: cert + license + `node_id`; mTLS to cloud.
- Relay + consumer over **NATS JetStream** (both directions); idempotent inbox + cursor.
- Conflict resolution: HLC per-field LWW; **append-only event-sourced ledgers**; tombstone deletes.
- Snapshot + replay bootstrap; DR drill; local WAL archiving/backups.
- Offline license grace period.

## Phase 7 — Guardian Portal & Mobile (Expo)
- **Guardian portal** ([18](./18-guardian-portal.md)): `GUARDIAN` user type,
  `guardian`/`guardian_student` tables, child-scoped read API (attendance, marks,
  fees, notices). T2 adds online fee payment (needs the payment gateway) + guarded
  writes (consent, contact update, leave requests).
- **Mobile** (Expo): reuse React core. Start read-heavy (guardians/teachers view
  attendance, marks, notices) before write features.

## Phase 8 — LMS (Academics T3)
See **[19 — LMS](./19-lms.md)**.
- T3a — content & assignments (publish): `lesson_plan`, `material`, `assignment`
  inside the `academics` slice.
- T3b — submission & grading loop → grades flow into append-only marks; **split the
  `learning` slice** here.
- T3c — quizzes, discussion, completion tracking.

## Build sequence & schemas
- The granular, bridge-by-bridge execution plan lives in **[plan/](./plan/)**.
- The per-slice table designs live in **[database/](./database/)**; the
  cross-cutting principles in **[21 — Database Architecture](./21-database-architecture.md)**
  and the end-to-end flows in **[20 — Data Flow](./20-dataflow.md)**.

## Cross-cutting (every phase)
- Audit log on all mutations.
- Soft deletes + per-tenant backups.
- Keep platform-superadmin and tenant-admin permissions in separate namespaces.
