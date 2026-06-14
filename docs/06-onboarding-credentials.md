# 06 — Onboarding & Credential Generation

## No self-registration

Students and teachers **cannot** register themselves. A staff member with the right
permission creates them and hands over credentials. (The only self-service signup is
a **School Admin** registering a new school — that's the control plane, see
[platform/registration](./04-vertical-slicing.md).)

## Two paths to create a user

The split is controlled by the `onboarding.skip` permission ([05](./05-rbac.md)).

### Path A — Full onboarding (requires `<type>.onboard`)

A configurable, multi-step workflow ("onboarding engine"). Used by admission/HR
staff. May collect documents, guardian info, prior records, and can require
**approval** (`onboarding.approve`) before the user becomes active.

```
DRAFT → IN_PROGRESS → PENDING_APPROVAL → ACTIVE
                                       ↘ REJECTED
```

### Path B — Direct registration (requires `<type>.create` + `onboarding.skip`)

A single form that creates a fully active user immediately. For privileged staff who
don't need the wizard.

> The **onboarding template** (which steps, which fields, which approvals) is
> configurable per tenant and seeded from a default the **platform superadmin**
> defines. Build it config-driven, not hardcoded.

## Credential generation flow

When a staff member adds a user:

1. Enter **name** + (optional) **username override**.
2. Pick **User Type** — `STUDENT | TEACHER | EMPLOYEE`.
3. Pick or **create a Designation** (dynamic).
4. **Check Roles** (multi-select — a user can hold several).
5. System **suggests an available login email** (see algorithm below).
6. System **generates a temporary password** (or a one-time setup link).
7. User is created with `must_reset_password = true`.
8. Staff **hands the credentials to the user** (print/export, or send if a real
   contact channel exists).

## Login email/handle algorithm

```
type_suffix:
  STUDENT  -> "student"
  TEACHER  -> "teacher"
  EMPLOYEE -> "employee"     # staff & authority

name_slug   = slugify(name)          # lowercase, strip accents, alnum + dots
school_slug = tenant.slug            # chosen at onboarding, unique, immutable

candidate = f"{name_slug}.{type_suffix}@{school_slug}.com"

# uniqueness within the tenant; on collision, append an incrementing number
# to the name part:
#   john.teacher@stmarys.com
#   john2.teacher@stmarys.com
#   john3.teacher@stmarys.com
```

Examples (school slug `stmarys`):
- Teacher "John Doe" → `johndoe.teacher@stmarys.com`
- Student "John Doe" → `johndoe.student@stmarys.com`
- Accountant "John Doe" → `johndoe.employee@stmarys.com`

## ⚠️ Two design decisions baked in

### 1. The generated email is a LOGIN HANDLE, not a real mailbox

`@stmarys.com` is not a real mail server. So:
- Treat it as the unique **login identifier** (stored in `users.login_identifier`).
- If you need to actually **message** users/parents (password reset, notices),
  capture a **real email and/or phone separately** (`users.real_contact_email`,
  `users.phone`) — optional, since young students often have none.

### 2. Password delivery without email

Because many users have no real inbox:
- Generate a **temporary password**, displayed once to the creating staff to hand over.
- Force **reset on first login** (`must_reset_password`).
- Consider a short **PIN** option for young students.
- Where a real contact channel exists, prefer a **one-time setup link** instead of a
  plaintext password.

## Who can onboard whom — summary

| Action | Permission(s) | Typical role |
|--------|---------------|--------------|
| Onboard a student (wizard) | `student.onboard` | Admission Officer |
| Onboard a teacher (wizard) | `teacher.onboard` | HR Officer |
| Onboard staff/authority | `staff.onboard` | HR / School Admin |
| Skip wizard, create directly | `<type>.create` + `onboarding.skip` | School Admin |
| Approve a pending onboarding | `onboarding.approve` | Principal / School Admin |
| Create roles & designations | `role.manage`, `designation.manage` | School Admin |
