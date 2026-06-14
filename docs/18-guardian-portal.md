# 18 — Guardian / Parent Portal

A guardian is **an actor and a portal, not a new bounded context.** Guardian data
already lives in the [`students`](./04-vertical-slicing.md) slice; what this doc adds
is a **login** and a **read-mostly portal** that consumes data the system already
produces — attendance, marks, fees, notices. There is no new business domain, so
there is no top-level `guardian` slice.

> Design stance: the guardian portal is a *thin reader* over existing slices, plus a
> few guarded writes. It mirrors the "read-heavy mobile app first" plan in
> [07 — Roadmap](./07-roadmap.md) and reuses the [finance](./10-finance-payments.md)
> and [notifications](./15-notifications-feedback.md) machinery as-is.

## The two things that are genuinely new

Everything a guardian *sees* already exists. Two things do not, and they are the
whole job:

1. **Guardian identity** — guardians need real login credentials and a real contact
   channel. [06 — Onboarding & Credentials](./06-onboarding-credentials.md) is built
   around staff/students; guardians get a new `GUARDIAN` user type
   ([05 — RBAC](./05-rbac.md)) and a lighter credential path (often phone/OTP rather
   than a generated email).
2. **Guardian ↔ student scoping** — a guardian must see *only their own children*,
   and a child may have several guardians. This is the security boundary the whole
   portal hangs on (see *Scoping* below).

## Data model

The relationship is **many-to-many** — one guardian can have several children
(possibly in different classes), one student can have several guardians.

```
guardian          (id UUIDv7, tenant_id, name, relation_default,
                   phone, email?, ...)          -- lives in the students slice
guardian_student  (id, tenant_id, guardian_id, student_id,
                   relation ∈ {FATHER, MOTHER, GUARDIAN, ...},
                   is_primary,                  -- primary contact for this child
                   can_pay)                     -- may this guardian transact fees?
```

A guardian gets portal access via the standard identity path — a `membership` with
`user_type = GUARDIAN` linked to a `users` row ([05](./05-rbac.md)). A guardian
record can exist **without** a login (contact-only, as today); promoting them to a
portal user just creates the membership. The set of students a logged-in guardian
can act on = the `guardian_student` rows for *their* guardian record. Nothing else.

## Scoping — the security boundary

> A guardian portal request resolves the caller's `guardian_id`, then restricts every
> read/write to students reachable through `guardian_student`. A guardian can never
> address a `student_id` they are not linked to.

- Enforced at the query layer **and** backed by Postgres RLS ([03](./03-multi-tenancy.md))
  so an app bug cannot leak another family's child — the same defence-in-depth as
  tenant isolation.
- Fee actions additionally require `can_pay` on the link row (a non-paying relative
  can view dues but not transact).

## What we offer guardians (tiered)

Almost all of Tier 1 is **reads of data we already collect**, so it is cheap to ship.

### Tier 1 — read-only portal

| Feature | Reuses |
|---|---|
| Multi-child switcher (one login → all linked children) | `guardian_student` |
| Child's attendance | [academics](./17-academics-model.md) |
| Marks / report cards / exam results | academics (exams/marks) |
| Timetable | academics (T2 dependency) |
| Fee dues, invoices, receipts, payment history | [finance](./10-finance-payments.md) |
| Notices / announcements addressed to the family | [notifications](./15-notifications-feedback.md) |
| Push notifications (fee due, absence, result published) | [16](./16-push-notifications.md) |

### Tier 2 — guarded writes

| Feature | Notes |
|---|---|
| **Online fee payment** | The highest-value guardian feature — flips finance from *view dues* to *pay dues*. Needs the real payment gateway ([10](./10-finance-payments.md) / [11](./11-subscription-billing.md), T2) and `can_pay`. |
| Notice acknowledgement / consent | Read receipts, permission slips |
| Update own contact info | Via **maker-checker** ([05](./05-rbac.md)) — school approves the change |
| Leave / absence request for a child | Routes to the class teacher for approval |

### Tier 3 — engagement

| Feature | Notes |
|---|---|
| Two-way messaging with the class teacher | |
| LMS visibility — homework / assignment status | The guardian × academics intersection; tracks the LMS growth path |

## Permissions (RBAC)

Guardian capabilities are a small, fixed set in the catalog ([05](./05-rbac.md)),
always self-scoped via `guardian_student`:

```
guardian.read_child        # attendance, marks, timetable, profile of own children
guardian.read_fees         # dues, invoices, receipts of own children
guardian.pay_fees          # transact (also gated by guardian_student.can_pay)
guardian.update_own_contact # subject to maker-checker
guardian.request_leave     # raise an absence request
```

These are held by a default **Guardian** role seeded at tenant provisioning
([03](./03-multi-tenancy.md)), assigned automatically when a guardian is promoted to
a portal user. A guardian never holds staff/academic permissions.

## Why not a guardian slice

The guardian portal owns **no domain data of its own** — every screen is a scoped
projection of `students`, `academics`, `finance`, or `notifications`. Making it a
slice would mean a slice with no tables, only cross-slice reads, which is exactly the
horizontal-layer anti-pattern [04](./04-vertical-slicing.md) warns against. The
guardian lives as a **frontend feature** (`/features/guardian`) over a thin
read-API, plus the `GUARDIAN` user type and the `guardian` / `guardian_student`
tables in the `students` slice.
