# 04 — Vertical Slicing

## Principle

Organize code by **capability (bounded context)**, not by technical layer. A change
to "student admission" touches **one folder**, not five horizontal layers
(controllers → services → repos → models → routes scattered across the tree).

> Horizontal layering optimizes for "all controllers look alike."
> Vertical slicing optimizes for "all the code for *this feature* lives together" —
> which is what you actually edit, test, and ship as a unit.

## Slice Catalog

### Control Plane slices (central cloud)

| Slice | Owns |
|-------|------|
| `platform/registration` | Admin signup, school registration request, approval workflow, state machine |
| `platform/billing` | Subscription plans, payment-proof upload + verification, license issuance |
| `platform/tenants` | Tenant directory, provisioning, suspension, seeding |

### Tenant Plane slices (per school)

| Slice | Owns |
|-------|------|
| `identity` | Login, sessions, password reset, credential generation |
| `access` (RBAC) | Permission catalog, roles, designations, assignments |
| `tenant` | School profile, slug, academic-year config, onboarding templates |
| `students` | Admission/onboarding, student profile, guardians |
| `teachers` | Teacher onboarding, teacher profile |
| `staff` | Staff & authority onboarding, employee profile |
| `academics` | Classes, sections, subjects, timetable, attendance, exams/marks |
| `finance` | Fee structure, invoices, payments, receipts |

> **Future slice:** `learning` (LMS) — content, assignments, submissions, grading —
> grows *inside* `academics` and splits out only at T3b. See [19](./19-lms.md).

### Shared Kernel (not a slice — used by all)

`tenancy` · `events` · `audit` · `storage` · `authz` · `slug/credential generator`

## The "people" slices share a pattern

`students`, `teachers`, and `staff` all follow the same shape:
**Identity (user + membership) + a domain Profile + an onboarding workflow.**

- Keep the generic parts (user creation, role assignment, credential generation) in
  `identity` + `access`.
- Keep the domain-specific parts (a student's guardians/admission number, a
  teacher's subjects, an employee's department) in each people slice.
- Reuse one **onboarding engine** (a configurable multi-step workflow) across all
  three rather than writing three wizards. See [06](./06-onboarding-credentials.md).

## Backend folder layout (Go)

```
/server
  /cmd
    /node            # the per-school binary
    /controlplane    # the central cloud binary
  /internal
    /platform        # shared kernel: db, tenancy, authz, events, audit, storage
    /features
      /identity
        handler.go        # HTTP endpoints
        service.go        # use cases / business logic
        repository.go     # data access (sqlc-generated queries wrapped)
        models.go         # domain types
        events.go         # events published/consumed
        routes.go
      /access
      /tenant
      /students
      /teachers
      /staff
      /academics
      /finance
    /controlplane
      /registration
      /billing
      /tenants
  /db
    /migrations
    /queries           # raw SQL → sqlc
```

A slice exposes a small interface to others; slices talk via **events** or explicit
service calls, never by reaching into each other's tables.

## Frontend folder layout (React — shared by web/desktop, mirrored in Expo)

```
/src
  /shared            # ui kit, api client, auth, tenant context, hooks
  /features
    /auth
    /onboarding
    /students
    /teachers
    /staff
    /academics
    /finance
    /access          # role & permission management UI
    /admin           # tenant settings
  /platform          # superadmin-only screens (separate build/route guard)
```

Frontend slices mirror backend slices 1:1 so a feature is end-to-end discoverable.
