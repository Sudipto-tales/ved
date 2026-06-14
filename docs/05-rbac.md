# 05 — RBAC Model

## The 4-Concept Separation (read this first)

Most RBAC messes come from conflating these. Keep them separate:

| Concept | Fixed / Dynamic | Answers | Example |
|---------|-----------------|---------|---------|
| **User Type** | Fixed enum | *What kind of person?* Drives email suffix, onboarding flow, profile table | `STUDENT`, `TEACHER`, `EMPLOYEE`, `GUARDIAN` |
| **Designation** | Dynamic (staff-created per tenant) | *What's their job title?* (HR/display only) | "Vice Principal", "Senior Math Teacher", "Accountant" |
| **Role** | Dynamic (admin-created per tenant) | *What can they DO?* A named bundle of permissions | "Admission Officer", "Class Teacher" |
| **Permission** | Fixed catalog (defined in code) | *Which exact capability?* The thing the code checks | `student.create`, `teacher.onboard`, `onboarding.skip` |

Key rule: **Designation ≠ Role.** A "Vice Principal" (designation) may hold the
"School Admin" role; an "Office Clerk" may hold "Admission Officer". The code never
checks designation for authorization — only permissions (via roles).

## Why permissions are fixed but roles are dynamic

The application code contains lines like `requirePermission("student.create")`.
For that to be reliable, the **set of permissions is a closed catalog defined in
code**. Roles are just admin-assembled *bundles* of those permissions, so schools
can invent their own org structure ("Hostel Warden", "Exam Controller") without
touching code.

## Permission Catalog (examples — namespaced `resource.action`)

```
# People management
student.create        student.onboard        student.read      student.update
teacher.create        teacher.onboard        teacher.read      teacher.update
staff.create          staff.onboard          staff.read        staff.update

# Access control
role.manage           designation.manage     user.assign_roles

# Onboarding
onboarding.skip       # bypass the wizard, register a user directly
onboarding.approve    # approve a pending onboarding

# Academics / Finance
academics.manage      attendance.mark        exam.manage       marks.enter
fee.manage            payment.record         receipt.issue

# Tenant
tenant.settings       tenant.admin           # tenant-wide wildcard (School Admin)

# Guardian portal (always self-scoped to own children, see [18])
guardian.read_child   guardian.read_fees     guardian.pay_fees
guardian.update_own_contact                  guardian.request_leave
```

Note `student.create` (direct, immediate) is **separate** from `student.onboard`
(start the multi-step workflow). Splitting them lets you give an admission clerk the
ability to run onboarding **without** the ability to skip it. See
[06](./06-onboarding-credentials.md).

## Separation of Duties

Because each capability is its own permission, you can grant precisely:

- Admission clerk → `student.onboard`, `student.read` (no teacher rights at all).
- HR officer → `teacher.onboard`, `staff.onboard`.
- School Admin → `tenant.admin` (everything in this tenant).

This directly answers *"who can onboard a student vs who can onboard a teacher"* —
they are different permissions held by different roles.

## Data Model

```
permissions            (id, key, description)            -- seeded from code
roles                  (id, tenant_id, name, is_system)  -- dynamic per tenant
role_permissions       (role_id, permission_id)
designations           (id, tenant_id, name, applies_to_user_type?) -- dynamic
memberships            (id, user_id, tenant_id, user_type, designation_id, status)
membership_roles       (membership_id, role_id)          -- multi-role per user
```

- A user (membership) can hold **multiple roles** — your checkbox UI maps to rows
  in `membership_roles`.
- Effective permissions = union of permissions across all the membership's roles.
- `tenant.admin` short-circuits to "all permissions within this tenant".

## The Bootstrap

Roles must exist before users, but the first admin exists before any role. Resolved
at **tenant provisioning** (control plane): seed permission catalog + default roles
(School Admin, Admission Officer, Class Teacher, Accountant, Student…) + assign the
first admin the **School Admin** role. See [03](./03-multi-tenancy.md).

## Tenant-scoped Superadmin vs Platform Superadmin

- **School Admin** = `tenant.admin`: god **within one tenant**, sees nothing outside it.
- **Platform Superadmin** = control-plane role: spans tenants, but has **no** tenant
  business permissions by default. Different namespace, different slice. Never merge.
