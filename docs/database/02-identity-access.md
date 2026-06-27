# Database — Identity & Access

Who can log in, which tenant(s) they belong to, and what they're allowed to do. This
slice realises the user/membership split from [03](../03-multi-tenancy.md) and the
4-concept RBAC model from [05](../05-rbac.md). Credential generation is covered in
[06](../06-onboarding-credentials.md).

The defining nuance here: **identity is global, access is tenant-scoped.** `users` and
`permissions` are *global* tables — they are **not** tenant-scoped, carry no `tenant_id`,
and get **no RLS policy**. Everything else (`memberships`, `roles`, `role_permissions`,
`membership_roles`, `designations`) is tenant-scoped and carries the base columns + RLS
block from [00-conventions.md](./00-conventions.md).

Legend (see [00-conventions.md](./00-conventions.md)): `col?` nullable · `col ∈ {A,B}`
TEXT+CHECK enum · `→ table` foreign key.

---

## Global identity (NOT tenant-scoped, no RLS)

One person = one `users` row, regardless of how many schools they belong to. This is
what lets a single admin own multiple schools without a rewrite ([03](../03-multi-tenancy.md)).
The `login_identifier` is the generated handle (`john.teacher@stmarys.com`) or a real
email; it is **globally unique by construction** ([06](../06-onboarding-credentials.md)).

```sql
users                                    -- GLOBAL: no tenant_id, no RLS policy
  id                  UUID PRIMARY KEY
  login_identifier    TEXT NOT NULL       -- generated handle OR real email; UNIQUE (global)
  password_hash       TEXT NOT NULL       -- argon2id; never the plaintext temp password
  must_reset_password BOOLEAN NOT NULL DEFAULT true   -- forced reset on first login ([06])
  real_contact_email? TEXT                -- optional real inbox for reset/notices
  phone?              TEXT                -- optional real channel (SMS); young students have none
  status              ∈ {ACTIVE, SUSPENDED, LOCKED}
  created_at, updated_at, ...             -- sync columns apply; tenant_id does NOT

UNIQUE (login_identifier)                 -- global uniqueness, not (tenant_id, …)
```

> `users` is the only table in this slice without `tenant_id`. The per-tenant unique
> rule from [00-conventions.md](./00-conventions.md) (`UNIQUE (tenant_id, …)`) does
> **not** apply — uniqueness is global, because one handle must resolve to one person
> across every tenant.

`password_hash`, `real_contact_email`, and `phone` are sensitive and candidates for
app-layer envelope encryption ([21](../21-database-architecture.md)).

### `activation_token` — magic login link (M11, tenant-scoped + RLS)

The one-time "click to activate" token issued at provisioning so a new admin can sign in
without typing the temp password ([24 §5](../24-login-and-registration.md)). Only the
**SHA-256 hash** is stored; the raw value travels solely in the emailed link.

```sql
activation_token                          -- tenant-scoped + RLS + sync columns
  id           UUID PRIMARY KEY
  tenant_id    UUID NOT NULL
  user_id      UUID NOT NULL              -- the user the link signs in
  token_hash   TEXT NOT NULL UNIQUE       -- sha256(raw); raw is never persisted
  expires_at   TIMESTAMPTZ NOT NULL       -- 72h at provisioning
  consumed_at? TIMESTAMPTZ                -- set on use → single-use
```

- The node's **public** `POST /auth/activate` has no tenant context, so it resolves a live
  token via a narrow `auth_activation(token_hash)` `SECURITY DEFINER` read — the same
  controlled-bypass pattern as `auth_memberships` at login — then `SET app.tenant_id` and
  consumes it (row + outbox + audit, golden rule). A re-clicked link 404s.
- The signed-in admin still carries `must_reset_password`, so they are routed into setting a
  real password; the temp password remains a fallback.

---

## Membership — user × tenant (tenant-scoped)

A membership is the join between a global `users` row and one tenant. A student/teacher
has exactly one; a multi-school admin has several (one per tenant). Roles and designation
hang off the *membership*, never the user — the same person can be Admin in School A and
Teacher in School B.

```sql
memberships                              -- tenant-scoped: base columns + RLS apply
  user_id             → users            -- the global identity
  tenant_id           UUID NOT NULL      -- RLS scope
  user_type           ∈ {STUDENT, TEACHER, EMPLOYEE, GUARDIAN}  -- fixed enum ([05])
  designation_id?     → designations     -- HR/display job title, never authorization
  status              ∈ {PENDING, ACTIVE, INACTIVE, SUSPENDED}
  joined_at           TIMESTAMPTZ NOT NULL

UNIQUE (tenant_id, user_id)              -- one membership per person per tenant
```

`user_type` is fixed: it drives the login-email suffix, the onboarding flow, and which
profile table holds the person (`student`/`teacher`/`employee`/`guardian` —
[00-conventions.md](./00-conventions.md)). It is **not** a permission.

---

## Permission catalog (GLOBAL, seeded from code)

The closed set of capabilities the code checks via `requirePermission("student.create")`.
Because the catalog is **defined in code** ([05](../05-rbac.md)), this table is global and
seeded identically into every tenant at provisioning — it is a fixed reference, not
tenant data, so it carries **no `tenant_id` and no RLS**.

```sql
permissions                              -- GLOBAL: no tenant_id, no RLS; seeded from code
  id                  UUID PRIMARY KEY
  key                 TEXT NOT NULL       -- e.g. 'student.create', 'tenant.admin'; UNIQUE (global)
  description         TEXT NOT NULL

UNIQUE (key)
```

Examples (full list in [05](../05-rbac.md)): `student.create`, `student.onboard`,
`onboarding.skip`, `role.manage`, `payment.record`, `tenant.admin`.

---

## Roles & assignment (tenant-scoped)

Roles are admin-assembled *bundles* of permissions, dynamic per tenant, so a school can
invent "Hostel Warden" or "Exam Controller" without touching code.

```sql
roles                                    -- tenant-scoped: base columns + RLS apply
  tenant_id           UUID NOT NULL
  name                TEXT NOT NULL       -- 'School Admin', 'Admission Officer', 'Class Teacher'
  is_system           BOOLEAN NOT NULL DEFAULT false  -- seeded default role; protected from deletion

UNIQUE (tenant_id, name)
```

```sql
role_permissions                         -- tenant-scoped join: role × permission
  tenant_id           UUID NOT NULL
  role_id             → roles            -- same-tenant FK
  permission_id       → permissions      -- references the GLOBAL catalog

PRIMARY KEY (role_id, permission_id)
```

```sql
membership_roles                         -- tenant-scoped join: membership × role
  tenant_id           UUID NOT NULL
  membership_id       → memberships      -- same-tenant FK
  role_id             → roles            -- same-tenant FK

PRIMARY KEY (membership_id, role_id)     -- a membership can hold MANY roles
```

`role_permissions` and `membership_roles` are both tenant-scoped (they live entirely
within one tenant), even though `role_permissions.permission_id` points at the global
catalog. The membership↔role table is what the checkbox UI in
[06](../06-onboarding-credentials.md) maps to — multi-select, multiple rows.

---

## Designations (tenant-scoped)

A job title for HR/display only. **Designation ≠ Role**: the code never checks a
designation for authorization. A "Vice Principal" (designation) may hold the "School
Admin" role; an "Office Clerk" may hold "Admission Officer" ([05](../05-rbac.md)).

```sql
designations                             -- tenant-scoped: base columns + RLS apply
  tenant_id           UUID NOT NULL
  name                TEXT NOT NULL       -- 'Vice Principal', 'Senior Math Teacher', 'Accountant'
  applies_to_user_type? ∈ {STUDENT, TEACHER, EMPLOYEE, GUARDIAN}  -- optional restriction

UNIQUE (tenant_id, name)
```

---

## Effective permissions

For a given membership, the set of allowed permission keys is:

1. **`tenant.admin` short-circuits.** If any of the membership's roles holds the
   `tenant.admin` permission, it resolves to "**all** permissions within this tenant"
   (School Admin) — no further union needed. It never grants anything outside the tenant
   ([05](../05-rbac.md)).
2. Otherwise, **effective = the union of `permissions` across every role** the membership
   holds, resolved by:
   `membership_roles → roles → role_permissions → permissions`.

There is no deny rule and no role hierarchy — permissions are purely additive. This keeps
the check at `requirePermission(key)` a simple set-membership test, cacheable per
membership in Redis ([21](../21-database-architecture.md)).

> Platform Superadmin is a **control-plane** role, a different namespace and slice — it
> spans tenants but holds **no** tenant business permissions by default. Never merge it
> into `roles` ([05](../05-rbac.md)).

---

## The bootstrap (chicken-and-egg)

Roles must exist before users can be assigned them, but the first admin exists before any
role. Resolved at **tenant provisioning** by the control plane ([03](../03-multi-tenancy.md),
[05](../05-rbac.md)):

1. Seed the **permission catalog** — already global, so this is just ensuring the rows
   exist (a no-op after the first tenant; the catalog is shared).
2. Seed the tenant's **default `roles`** (School Admin, Admission Officer, Class Teacher,
   Accountant, Student…) with `is_system = true`, and their `role_permissions`.
3. Create the **first `users` row** + its **`memberships`** row in this tenant, then a
   **`membership_roles`** row attaching the **School Admin** role (`tenant.admin`).

After step 3 the tenant has a god-within-this-tenant admin who can create every other
role, designation, and user.

---

## Keys & indexes (per [00-conventions.md](./00-conventions.md))

- Tenant-scoped tables lead every index/FK with `tenant_id`; FKs are same-tenant.
- `users` and `permissions` are global — their uniqueness is `UNIQUE (login_identifier)`
  / `UNIQUE (key)`, **not** scoped by tenant.
- `memberships`: `UNIQUE (tenant_id, user_id)`; index `(tenant_id, user_type, status)`
  for staff/student listings.
- Cross-tenant linkage is structurally impossible on the tenant-scoped tables because
  every FK carries `tenant_id`; `users`/`permissions` are the only bridges out, and both
  are intentionally global.
