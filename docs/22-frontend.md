# 22 — Frontend Architecture & Page Plan

How the UI is organised: the app topology (which portals exist), the folder
architecture, the routing/guard model, and the full page inventory per persona. The
frontend **mirrors the backend slices 1:1** ([04](./04-vertical-slicing.md)) and talks
to the backend only through the generated OpenAPI client ([02](./02-architecture.md),
[plan/bridges.md](./plan/bridges.md)).

## Stack (from [02](./02-architecture.md))

- **React + Vite + TypeScript**, wrapped in **Tauri** for desktop — one codebase for
  browser and desktop.
- **React Native (Expo)** for mobile — reuses the same hooks, types, validation, and
  API client; mirrors the feature folders.
- **TanStack Query** over the generated client for server state; **react-hook-form +
  Zod** for forms (Zod shapes shared with backend validation).
- **OpenAPI → generated TS client** is the only way the UI calls the backend.
- **Design language: Premium SaaS Minimalism** — see [23 — Design System](./23-design-system.md).
  All pages compose from the `shared/ui` kit; visuals are centralized in design tokens.

## App topology — two builds, many personas

```
┌─────────────────────────────┐     ┌──────────────────────────────────────────┐
│  CONTROL-PLANE APP          │     │  TENANT APP  (one build, role-driven UI)  │
│  (platform superadmin only) │     │  School Admin · Staff · Teacher ·          │
│  separate build + route     │     │  Student · Guardian                        │
│  guard ([02], [04])         │     │  permission-gated routes & widgets         │
└─────────────────────────────┘     └──────────────────────────────────────────┘
```

- The **control-plane app** is a *separate build* (superadmin spans all tenants — must
  never share a bundle or route guard with tenant code). Lives in `/platform`.
- The **tenant app** is a *single build* serving every in-school persona. Personas are
  **not** separate apps — they are **role-based dashboards + permission-gated routes**
  inside one app, because a person may hold several roles ([05](./05-rbac.md)). What a
  user sees is decided by their effective permissions, not by a different binary.

## Folder architecture

Mirrors the backend slices; each feature owns its full vertical (pages, components,
api hooks, routes) so a feature is end-to-end discoverable.

```
/web                                  # tenant app (Vite + React + Tauri)
  /src
    /app
      router.tsx                      # route tree + guards
      providers.tsx                   # QueryClient, auth, tenant, theme
      /layouts                        # AppShell, AuthLayout, PortalShell (sidebar per role)
    /shared                           # the kernel every feature reuses
      /ui                             # design-system kit (Button, Table, Form, Modal, DataGrid…)
      /api
        client.ts                     # generated OpenAPI client (do not hand-edit)
        queryKeys.ts
      /auth                           # useAuth, token storage, force-reset flow
      /tenant                         # active-tenant context, tenant switcher
      /authz                          # <Can permission>, usePermission() — gates UI
      /hooks  /lib  /types  /config
    /features                         # ⇄ backend slices 1:1
      /auth                           # login, reset, recover
      /onboarding                     # the configurable wizard engine (shared by people)
      /students        /teachers      /staff          /guardians
      /academics       /finance       /access         /admin   # tenant settings
      /communication   /reports       /learning       # learning = LMS (T3)
        /<feature>
          /pages                      # route-level screens
          /components                 # feature-local components
          /api                        # typed query/mutation hooks over shared/api
          routes.tsx
    main.tsx
  /platform                           # SEPARATE control-plane app (own entry/build)
    /src/features/{registrations,payments,tenants,subscriptions,licenses,analytics}

/mobile                               # Expo app — mirrors /web/src/features, reuses shared logic
/packages/shared                      # (optional) extracted types/zod/client shared web↔mobile
```

> **Rule:** a feature never imports another feature's internals. Cross-feature needs
> go through `/shared` or a typed API hook — the frontend mirror of the backend's
> "slices talk via events/services, never reach into each other's tables"
> ([04](./04-vertical-slicing.md)).

## Routing & guards

Route guards compose, evaluated outermost-first:

```
<AuthGuard>                 logged in? else → /login
  <ForceResetGuard>         must_reset_password? else → /reset ([06])
    <TenantGuard>           active tenant resolved? else → /select-tenant
      <RoleHome>            redirect "/" to the right dashboard per primary role
        <PermissionGuard permission="fee.manage">   route-level RBAC ([05])
          <Page/>
```

- **Role → default dashboard:** admin → admin dashboard, teacher → teacher dashboard,
  guardian → guardian dashboard, etc. One app, different landing per role.
- **Permission-gated rendering:** `<Can permission="payment.record">…</Can>` hides
  buttons/menu items the user can't use; the route guard is the hard gate, `<Can>` is
  the cosmetic one. Permissions come from the session ([plan/bridges.md](./plan/bridges.md)).
- **Guardian/Student scoping** is enforced server-side ([18](./18-guardian-portal.md));
  the UI just renders what the scoped API returns.

## Page inventory by persona

Tagged by tier (T1 MVP · T2 fast-follow · T3 later). All tenant-app pages are
permission-gated; "persona" = the role that typically sees them.

### Auth (unauthenticated, shared)

| Page | Tier |
|---|---|
| Login (handle or real email) · Force-reset-password · Forgot/recover · Setup-link landing · Select tenant (multi-tenant users) | T1 |

### School / College Admin

| Area | Pages | Tier |
|---|---|---|
| Dashboard | KPIs, alerts (unstaffed sections, overdue fees) | T1 |
| Tenant settings (`admin`) | Profile/slug/branding · Academic year & terms · Dynamic dropdowns · Rooms · Document/number templates · Holiday calendar | T1 (calendar T2) |
| Access (`access`) | Roles & permissions · Designations · Assign roles to users · Maker-checker config | T1 (maker-checker T2) |
| People | Students (list/detail/onboard) · Guardians · Teachers · Staff · **Bulk import** | T1 |
| Academics | Programs · Stages · Subjects · Curriculum · Sections (+room/class-teacher) · Enrollment · Teaching assignments · Attendance · Exams/marks · Timetable | T1 (exams/timetable T2) |
| Finance | Fee heads/structures/schedules · Invoices · Collection · Concessions/fines · Student ledger · Dues/aging reports · Audit trail · Daily cash close | T1 (cash close T2) |
| Communication | Notices/announcements · Notification center | T2 |
| Reports | Role-based dashboards · Exports · Per-tenant backup/restore | T1 |

### Staff / Authority

Same app, **permission-subset** — e.g. an Admission Officer sees People→Students +
onboarding; an Accountant sees Finance + collection counter. No separate build.

### Teacher

| Pages | Tier |
|---|---|
| Dashboard (my sections, today's timetable) · My sections/students · Mark attendance · Enter marks · My timetable | T1 (marks/timetable T2) |
| LMS: lesson plans, materials, assignments, grade submissions | T3 ([19](./19-lms.md)) |

### Student

| Pages | Tier |
|---|---|
| Dashboard · My profile · My attendance · My marks/report card · My timetable · My fees/dues · Notices | T1/T2 |
| LMS: assignments + submit work | T3 |

### Guardian / Parent ([18](./18-guardian-portal.md))

| Pages | Tier |
|---|---|
| Dashboard + **multi-child switcher** · Child attendance · Child marks/report card · Child timetable · Child fees · Notices | T1 |
| **Pay fees online** · Consent/ack notices · Update own contact (maker-checker) · Leave request | T2 |
| Teacher messaging · LMS visibility | T3 |

### Platform Superadmin (control-plane app, `/platform`)

| Pages | Tier |
|---|---|
| Dashboard · Registrations queue (approve/reject) · Payment-proof review · Tenants directory (provision/suspend/offboard) | T1 |
| Subscription plans & pricing · Licenses · Cross-school analytics · Support console | T2/T3 |

## Cross-platform (web/desktop/mobile)

- **Web + Desktop**: identical bundle; Tauri only adds native shell + offline file
  access. No forked components.
- **Mobile (Expo)**: reuses `/shared` (types, Zod, API client, auth/tenant logic) and
  mirrors `/features`; ships **read-heavy first** (guardians/teachers view
  attendance, marks, notices) before write features ([07](./07-roadmap.md) Phase 7).
- Keep view-agnostic logic (hooks, validation, API) in `/shared` or `/packages/shared`
  so only the presentational layer differs per platform.

## Build order (per [plan/](./plan/))

The app shell + auth + tenant context + one feature (Students) form the frontend
**walking skeleton** ([plan/README.md](./plan/README.md) M0–M3) — it establishes every
shared rail (router, guards, query client, generated client, UI kit). After that each
feature folder is near-mechanical: pages + api hooks + routes against a frozen OpenAPI
contract, so frontend and backend proceed in parallel per slice.
