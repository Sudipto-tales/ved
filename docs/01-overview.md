# 01 — Overview & Deployment Topology

## Product Goal

Replace the patchwork of Excel, MS Word, and MS Access used by schools with one
lightweight system covering student records, admissions, attendance, academics,
exams, and fees — usable over the school's local network and across web, desktop,
and mobile.

The product targets **schools *and* colleges / higher-ed**. The academic structure
([17](./17-academics-model.md)) collapses to a simple school (grades + sections) and
expands to a multi-stage college (programs → semesters, credits, electives) from a
single model — the difference is one `enrollment_mode` flag, not a separate product.

## Actors

- **Platform Superadmin** — us. Operates the control plane: approves school
  registrations, verifies subscription payments, issues licenses, suspends
  tenants. Spans all tenants.
- **School Admin (Tenant Owner)** — registers a school, is a *superadmin within
  that one tenant*. May (future) own multiple schools.
- **Staff / Authority** — users with permissions to onboard and manage students,
  teachers, and other staff.
- **Teacher** — tenant-local user with academic permissions.
- **Student** — tenant-local user, read-mostly access to their own data.
- **Guardian / Parent** — tenant-local user with a read-mostly portal scoped to
  *their own children* (attendance, marks, fees), plus online fee payment.
  See [18](./18-guardian-portal.md).

## Deployment Topology — Decision

**Chosen model: Local-first per school + central control plane (hybrid).**

```
        ┌──────────────────────────────────────────┐
        │           CENTRAL CLOUD (us)             │
        │  Control Plane: registration, billing,    │
        │  payment verification, licensing,         │
        │  cross-school reporting, sync hub         │
        └───────────────▲───────────────▲──────────┘
                        │  NATS/JetStream │   (durable, replayable sync)
              ┌─────────┘                 └─────────┐
   ┌──────────┴───────────┐         ┌───────────────┴──────┐
   │  SCHOOL A (LAN node) │         │  SCHOOL B (LAN node) │
   │  Go binary + Postgres│         │  Go binary + Postgres│
   │  serves its LAN      │         │  serves its LAN      │
   └──────────────────────┘         └──────────────────────┘
        clients: web / desktop (Tauri) / mobile (Expo)
```

### Why hybrid

- Schools have unreliable internet; the office must keep working offline. We are
  replacing **offline** tools (Access/Excel), so offline capability is table stakes.
- "Lightweight, runs on the school network" maps naturally to a single Go binary +
  Postgres per school.
- Matches the mental model: many school networks connected to one superadmin network.

### Pragmatic path

Building offline-sync first will stall the project. **Build cloud-first for the
first module**, but route every write through a domain **event** so retrofitting
the sync layer (NATS/JetStream) is mechanical rather than a rewrite. See
[07 — Roadmap](./07-roadmap.md).

### Licensing in offline mode

On approval, the control plane issues a **signed license** (plan, seat limits,
expiry, enabled modules). The school node validates it offline and honors the last
valid license for a grace period (e.g. 7–14 days) before nagging/locking. This is
how subscriptions are enforced on a local-first product.
