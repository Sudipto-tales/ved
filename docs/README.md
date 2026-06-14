# VED — School & College Management System

VED is a lightweight, multi-tenant management system for **schools and colleges /
higher-ed** that replaces the Excel / MS Word / MS Access tooling institutions use
today, unifying everything into a single product delivered as a **web app, desktop
app (Tauri), and mobile app (Expo)**. The academic structure
([17](./17-academics-model.md)) collapses to a simple school (grades + sections) and
expands to a multi-stage college (programs → semesters, credits, electives) from one
model.

Each institution is an isolated **tenant**. An institution admin is effectively a
*superadmin for their own institution* and sees the system as if they are its only
user. A separate **platform superadmin** (us) operates the control plane:
institution registration, subscription verification, and licensing.

## Architecture Docs Index

| Doc | What it covers |
|-----|----------------|
| [01 — Overview & Topology](./01-overview.md) | Product goals, deployment topology decision (local-first + central control plane) |
| [02 — System Architecture](./02-architecture.md) | Components, tech stack, data flow, control plane vs tenant plane |
| [03 — Multi-Tenancy & Identity](./03-multi-tenancy.md) | Tenant isolation (RLS), users vs memberships, multi-school future |
| [04 — Vertical Slicing](./04-vertical-slicing.md) | Slice catalog, folder layout (backend + frontend), slice anatomy |
| [05 — RBAC Model](./05-rbac.md) | User types, designations, roles, permissions, the 4-concept separation |
| [06 — Onboarding & Credentials](./06-onboarding-credentials.md) | Onboarding flows, the skip permission, email/credential generation |
| [08 — Offline & Sync](./08-offline-sync.md) | Local nodes, offline operation, no-data-loss sync, security |
| [09 — Feature Catalog](./09-feature-catalog.md) | Every feature across all slices, tiered (MVP / fast-follow / later) |
| [10 — Finance & Payments](./10-finance-payments.md) | Payment types, ledger model, audit system, finance permissions |
| [11 — Subscription & Billing](./11-subscription-billing.md) | Tenant subscription flow, license enforcement, billing features |
| [12 — Service Architecture](./12-service-architecture.md) | Modular monolith → extractable microservices, module catalog |
| [13 — Update Pipeline](./13-update-pipeline.md) | Auto/manual updates, safe self-update, no-conflict guarantees |
| [14 — Maintenance & Ops](./14-maintenance-ops.md) | Maintenance mode, health/heartbeat, diagnostics, remote ops |
| [15 — Notifications & Feedback](./15-notifications-feedback.md) | Realtime notifications, broadcasting, feedback — tech stack |
| [16 — OS Push Notifications](./16-push-notifications.md) | FCM/APNs, device tokens, web service worker, Expo, dispatcher |
| [17 — Academic Structure](./17-academics-model.md) | Programs, stages, sections, rooms, subjects, enrollment, teacher assignment (school + college) |
| [18 — Guardian / Parent Portal](./18-guardian-portal.md) | Guardian actor, login, child-scoped read portal, online fee payment |
| [19 — LMS (Learning Management)](./19-lms.md) | Academics T3 growth: content, assignments, submissions, grading; when to split a `learning` slice |
| [20 — Data Flow](./20-dataflow.md) | End-to-end write/read/sync/file flows; the outbox golden rule; worked flows |
| [21 — Database Architecture](./21-database-architecture.md) | Engine/topology, the five non-negotiables, indexing, migration strategy, data safety |
| [22 — Frontend Architecture](./22-frontend.md) | App topology (portals), folder layout, routing/guards, page inventory per persona |
| [23 — Design System](./23-design-system.md) | Premium SaaS Minimalism — tokens, the UI kit, rules for building a page |
| [07 — Roadmap](./07-roadmap.md) | Phased build order |

## Schema, Execution & Tooling

| Folder / File | What it covers |
|--------|----------------|
| [database/](./database/) | Per-slice table designs + the shared column conventions ([21](./21-database-architecture.md) is the principles, this is the tables) |
| [plan/](./plan/) | Step-by-step execution plan (walking skeleton → replicate per slice) + the [component bridges](./plan/bridges.md) |
| [commands.md](./commands.md) | The `ved.sh` Docker control script (single-command build/start/stop) + the compose stack |

## Core Principles

1. **Tenant isolation is sacred.** Every row is scoped to a tenant; Postgres
   Row-Level Security is the safety net so an app bug can't leak across institutions.
2. **Vertical slices, not horizontal layers.** Code is organized by capability
   (students, teachers, academics, finance…), each slice owning its full stack.
3. **Identity is generic; profiles are domain-specific.** One `users` table for
   auth/roles; separate profile tables per user type.
4. **Permissions are a fixed code-enforced catalog; roles & designations are
   dynamic.** See [05 — RBAC](./05-rbac.md).
5. **Local-first.** An institution keeps working when the internet is down; data
   syncs to the central cloud when connectivity returns.
