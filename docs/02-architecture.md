# 02 — System Architecture

## Two Planes

| Plane | Lives | Owns |
|-------|-------|------|
| **Control Plane** | Central cloud | Platform superadmin, school registration, payment-proof verification, subscription/licensing, tenant provisioning, cross-school reporting, sync hub |
| **Tenant Plane** | Per-school node (and/or cloud) | Everything *inside* a school: identity, RBAC, students, teachers, staff, academics, finance |

Keep these in **separate permission namespaces and separate slices**. A platform
superadmin is not a tenant admin and vice versa.

## Tech Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Web + Desktop UI | **React + Vite**, wrapped in **Tauri** | One codebase for browser and desktop; Tauri ships a tiny native binary |
| Mobile | **React Native (Expo)** | Reuses React components, hooks, types, validation. (Tauri mobile is immature — desktop only.) |
| Backend | **Go** | Single static binary = ideal on-prem school node; great concurrency |
| HTTP router | **Chi** | Lightweight, idiomatic, stdlib-compatible middleware |
| DB access | **sqlc** + **pgx** | Type-safe Go generated from raw SQL; full SQL control, no ORM magic |
| Migrations | **goose** (or golang-migrate) | All tenants migrate in lockstep |
| Database | **PostgreSQL** | Row-Level Security for tenant isolation |
| Cache / sessions / locks | **Redis** | Hot reads (timetables, dashboards), session store, rate limiting |
| Messaging / sync | **NATS + JetStream** | Lightweight bus; durable, replayable streams so offline nodes catch up |
| Object storage | **MinIO** (S3-compatible) | Payment-proof screenshots, document uploads |
| Background jobs | **River** (Postgres-backed) | Emails, PDF report generation, subscription workflow |
| Auth tokens | **golang-jwt** (access + refresh) | Self-issued JWTs; force reset on first login |
| Validation | **Zod** (FE) + **go-playground/validator** (BE) | Shared-shape validation both ends |
| API contract | **OpenAPI** → generated TS client | Single source of truth across web/desktop/mobile |

## Request Path (tenant plane)

```
Client (web/desktop/mobile)
  → JWT auth middleware            (who are you)
  → tenant-context middleware      (resolve active tenant, SET app.tenant_id)
  → RBAC middleware                (does your role grant the required permission)
  → feature slice handler          (students / teachers / academics / finance…)
  → service (use case)
  → repository (sqlc) → Postgres   (RLS enforces tenant_id automatically)
  → emit domain event (NATS)       (for sync + side effects)
```

## Shared Kernel (cross-cutting, used by all slices)

- **Tenancy context** — resolves active tenant, sets the Postgres session var RLS reads.
- **Event bus** — publish/subscribe domain events (NATS) for sync and side effects.
- **Audit log** — who did what, when (non-negotiable for a school record system).
- **File storage** — MinIO wrapper.
- **Slug & credential generator** — see [06](./06-onboarding-credentials.md).
- **Authz** — permission-checking helpers.

## Data Safety

- **Soft deletes** everywhere (schools must recover data).
- **Per-tenant backups** (we are replacing Access — data loss is unforgivable).
- **Audit trail** on all mutations.
