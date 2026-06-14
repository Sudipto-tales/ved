# 03 — Multi-Tenancy & Identity

## Goal

Each school is **abstract from every other school**. A school admin sees the system
as if their school is its only user. No query ever returns another tenant's data.

## Isolation Strategy: Shared DB + `tenant_id` + Row-Level Security

| Approach | Isolation | When |
|----------|-----------|------|
| **Shared DB + `tenant_id` + Postgres RLS** ✅ | Good | **Default — start here.** RLS enforces isolation at the DB layer; an app bug can't leak across tenants. |
| Schema-per-tenant | Strong | A few large schools demanding harder separation |
| DB-per-tenant | Strongest | Regulated boards; in the local-first model each node *is* effectively this for its own tenant |

### How RLS works here

- Every tenant-scoped table has `tenant_id UUID NOT NULL`.
- Request middleware sets a session variable: `SET app.tenant_id = '<uuid>'`.
- Each table has a policy:
  `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
- Now even a forgotten `WHERE tenant_id = ?` is safe — Postgres filters it.

On the **local-first node**, isolation is also *physical*: that node only holds its
own tenant. RLS still protects the **central cloud** where all tenants coexist.

## Identity Model — Users vs Memberships

> **One identity can belong to many tenants.** This is what enables the future
> "single admin owns multiple schools" feature without a rewrite.

```
users (global)
  id, login_identifier (the generated email/handle), password_hash,
  must_reset_password, real_contact_email?, phone?, status

memberships (user × tenant)          ← many-to-many
  id, user_id, tenant_id, user_type (STUDENT|TEACHER|EMPLOYEE),
  designation_id?, status, joined_at

membership_roles (membership × role) ← a membership can hold many roles
  membership_id, role_id
```

- A **student/teacher/staff** = one `users` row with **one** membership in one tenant.
- A **school admin who owns multiple schools** = one `users` row with **multiple**
  memberships. On login they pick (or default to) an active tenant; the tenant
  context middleware scopes everything from there.
- Roles are attached to the **membership**, not the user — because the same person
  can be an Admin in School A and a Teacher in School B.

## Login Identifier Uniqueness

The generated login handle embeds the tenant slug
(`john.teacher@stmarys.com`), so it is **globally unique by construction**. School
admins / owners may instead log in with their **real email**. Both live in
`users.login_identifier`. See [06](./06-onboarding-credentials.md).

## Tenant Provisioning (bootstrap)

When the control plane activates a school, it seeds the tenant with:
1. The **permission catalog** (fixed, code-defined — see [05](./05-rbac.md)).
2. A set of **default roles** (School Admin, Admission Officer, Class Teacher,
   Accountant, Student…).
3. The **first admin user**, assigned the **School Admin** role (tenant-wide
   wildcard). This resolves the "roles exist before users" bootstrap.
