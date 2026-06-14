# Features Layer

Each feature is an end-to-end vertical that **mirrors a backend slice 1:1**
([../../../docs/04-vertical-slicing.md](../../../docs/04-vertical-slicing.md)). A
feature owns its screens, its local components, its typed API access, and its route
manifest — so the whole slice is discoverable in one folder. See
[../../../docs/22-frontend.md](../../../docs/22-frontend.md) for the app topology and
guard model.

## Per-feature folder convention

```
/features/<feature>
  /pages          # route-level screens (the things a PageDef points at)
  /components     # feature-local components (not shared outside this feature)
  /api            # typed TanStack Query hooks over shared/api (generated client)
  routes.tsx      # the PageDef manifest — exports `<feature>Pages: PageDef[]`
```

## Feature → personas → scope

| Feature | Personas | Scope |
|---|---|---|
| `auth` | PUBLIC | login, force-reset, recover, setup-link landing, select-tenant |
| `onboarding` | ADMIN, STAFF | configurable wizard engine reused to onboard people |
| `students` | ADMIN, STAFF | student records — list, detail, onboard, bulk import |
| `teachers` | ADMIN, STAFF | teacher records and teaching assignments |
| `staff` | ADMIN | staff/authority records and designations |
| `guardians` | ADMIN, STAFF, GUARDIAN | guardian records + the child-scoped parent portal |
| `academics` | ADMIN, STAFF, TEACHER | programs, sections, enrollment, attendance, exams, timetable |
| `finance` | ADMIN, STAFF | fee structures, invoices, collection, ledgers, dues, cash close |
| `access` | ADMIN | roles, permissions, designations, maker-checker config |
| `admin` | ADMIN | tenant settings — branding, academic year, dropdowns, rooms, templates |
| `communication` | ADMIN, STAFF | notices/announcements + notification center |
| `reports` | ADMIN, STAFF | role-based dashboards, exports, per-tenant backup/restore |
| `learning` | TEACHER, STUDENT | LMS (T3) — lesson plans, materials, assignments, submissions |
| `notes` | STUDENT | demo/reference slice (the walking-skeleton example) |

> Student / Guardian read scoping is enforced server-side
> ([../../../docs/18-guardian-portal.md](../../../docs/18-guardian-portal.md)); the UI
> just renders what the scoped API returns.

## Wiring rule

Each feature exports a `*Pages: PageDef[]` manifest from its `routes.tsx`.
`app/router.tsx` **aggregates every manifest** and mounts the pages behind the guard
chain — `AuthGuard → TenantGuard → PermissionGuard` — using each page's `permission`
as the route-level RBAC gate. Routing, RBAC, persona, tier, and build status are all
declared once per page in the PageDef. See
[../../../docs/22-frontend.md](../../../docs/22-frontend.md) and
[../../../docs/plan/bridges.md](../../../docs/plan/bridges.md).

## Isolation rule

A feature **never** imports another feature's internals (`pages/`, `components/`,
`api/`). Cross-feature needs go through `shared/` or a typed API hook — the frontend
mirror of the backend's "slices talk via events/services, never reach into each
other's tables" ([../../../docs/04-vertical-slicing.md](../../../docs/04-vertical-slicing.md)).
