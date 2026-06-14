# 09 — Feature Catalog

Master list of everything VED provides, grouped by slice ([04](./04-vertical-slicing.md)),
tagged by tier so we ship value early without boxing ourselves in.

- **T1 = MVP** (first releasable product) · **T2 = Fast-follow** · **T3 = Later**

## A. Control Plane (central cloud — platform superadmin)

| Feature | Tier | Notes |
|---|---|---|
| Admin signup & school registration request | T1 | State machine, [01](./01-overview.md) |
| Payment-proof upload + manual subscription verification | T1 | Screenshot → MinIO; superadmin approves |
| Tenant provisioning & seeding (roles, permissions, defaults) | T1 | [03](./03-multi-tenancy.md) bootstrap |
| License issuance (signed, plan/seats/expiry/modules) | T1 | Enforced offline, [08](./08-offline-sync.md) |
| Subscription plans & pricing management | T2 | Plan catalog |
| Real payment gateway for subscriptions | T2 | Replaces manual proof |
| Tenant lifecycle (suspend / reactivate / offboard) | T2 | |
| Cross-school analytics & support console | T3 | Aggregated via sync hub |

## B. Tenant Setup

| Feature | Tier | Notes |
|---|---|---|
| School profile, slug, branding/logo | T1 | Slug drives email handles ([06](./06-onboarding-credentials.md)) |
| Academic year + terms/semesters | T1 | Anchors fees, exams, promotion |
| Dynamic dropdowns (designations, categories, etc.) | T1 | Config-driven, not hardcoded |
| Holiday / academic calendar | T2 | |
| Multi-campus / locations | T3 | One tenant, many sites |
| Receipt/document templates & number formats | T1 | Gapless receipt numbering ([10](./10-finance-payments.md)) |

## C. Identity & Access ([05](./05-rbac.md), [06](./06-onboarding-credentials.md))

| Feature | Tier | Notes |
|---|---|---|
| Login, JWT sessions, force-reset on first login | T1 | |
| Credential & login-email generation | T1 | slug + type suffix |
| Password reset / recovery | T1 | Via real contact channel or staff reset |
| Roles, permission catalog, designations | T1 | 4-concept model |
| Multi-role assignment (checkboxes) | T1 | `membership_roles` |
| Maker-checker / approval-threshold config | T2 | Powers finance approvals |
| Multi-tenant membership (one admin, many schools) | T2 | |
| MFA / 2FA for privileged users | T3 | |

## D. People

| Feature | Tier | Notes |
|---|---|---|
| **Student**: onboarding (wizard + skip), profile, guardians, documents | T1 | |
| Enrollment (class/section), categories, ID cards | T1 | |
| Promotion / transfer / withdrawal (TC) | T2 | |
| **Teacher**: onboarding, profile, subjects, qualifications | T1 | |
| **Staff/Authority**: onboarding, departments, designations | T1 | |
| Bulk import (migrate existing Excel/Access data) | T1 | Critical for adoption — they have years of data |

## E. Academics — see **[17](./17-academics-model.md)** for the full structure

| Feature | Tier | Notes |
|---|---|---|
| Programs, stages, sections, subjects, curriculum | T1 | Three-axis model, [17](./17-academics-model.md) |
| Rooms & section room assignment | T1 | Home room per section |
| Teacher assignment (teacher × subject × section) | T1 | Staffing-completeness rule, [17](./17-academics-model.md) |
| Section-based enrollment | T1 | MVP `enrollment_mode` |
| College mode: course-based enrollment, electives, credits | T2 | `COURSE_BASED`, [17](./17-academics-model.md) |
| Timetable | T2 | |
| Student attendance | T1 | **Append-only** (sync-safe, [08](./08-offline-sync.md)) |
| Staff attendance | T2 | |
| Exams, grading scheme, marks entry | T2 | Marks **append-only** |
| Report cards / mark sheets | T2 | PDF generation |
| LMS: homework, assignments, syllabus, materials (publish) | T3 | T3a seed, [19](./19-lms.md) |
| LMS: submissions + grading → marks, quizzes, discussion | T3 | Splits a `learning` slice, [19](./19-lms.md) |

## F. Finance & Payments — see **[10](./10-finance-payments.md)** for full design

| Feature | Tier | Notes |
|---|---|---|
| Fee heads, fee structures, installment schedules | T1 | |
| Invoice/demand generation per student/term | T1 | |
| Payment collection (cash/cheque/UPI/card/transfer/online) | T1 | Gapless receipts |
| Partial & advance payments, allocation | T1 | |
| Concessions/discounts/scholarships (maker-checker) | T1 | |
| Fines / late penalties (rule-based) | T1 | |
| Refunds & refundable deposits | T2 | |
| Student ledger & dues/aging reports | T1 | |
| Daily cash close & bank reconciliation | T2 | |
| Financial audit trail (immutable, hash-chained) | T1 | Core requirement |
| Expenses / vendor payments | T2 | Tier-2 finance scope |
| Payroll / salaries | T3 | |
| Double-entry general ledger & chart of accounts | T3 | Only if full bookkeeping needed |

## G. Communication

| Feature | Tier | Notes |
|---|---|---|
| Notices / announcements | T2 | |
| SMS / email / push to parents/staff | T2 | Needs real contact channel |
| Events calendar | T3 | |

## G2. Guardian / Parent Portal — see **[18](./18-guardian-portal.md)**

| Feature | Tier | Notes |
|---|---|---|
| Guardian login + multi-child switcher | T1 | `GUARDIAN` user type, child-scoped ([18](./18-guardian-portal.md)) |
| View child's attendance, marks, timetable | T1 | Read-only over [17](./17-academics-model.md) |
| View child's fee dues, invoices, receipts | T1 | Read-only over [10](./10-finance-payments.md) |
| **Online fee payment** | T2 | Highest-value; needs payment gateway + `can_pay` |
| Consent / notice acknowledgement, leave requests | T2 | Guarded writes |
| Contact-info self-update (maker-checker) | T2 | School approves |
| Teacher messaging, LMS visibility | T3 | |

## H. Operational Modules (each links to Finance for fees)

| Feature | Tier | Notes |
|---|---|---|
| Library (catalog, issue/return, fines) | T3 | Fines → finance |
| Transport (routes, vehicles, transport fee) | T3 | Fee → finance |
| Hostel (rooms, allocation, mess, hostel fee) | T3 | Fee → finance |
| Inventory / assets (uniforms, books, stock) | T3 | Sales → finance |

## I. Cross-cutting

| Feature | Tier | Notes |
|---|---|---|
| Global audit log (who/what/when/where) | T1 | Replicated to cloud |
| Role-based dashboards & reports | T1 | |
| Document generation (TC, bonafide, ID cards) | T2 | |
| Data export / per-tenant backup & restore | T1 | Replacing Access — non-negotiable |
| Offline local node + sync | T2 | [08](./08-offline-sync.md) |
| Mobile app (Expo) | T2 | Read-heavy first |

## MVP line (T1 only)

Tenant setup → identity/RBAC → student/teacher/staff onboarding (+ bulk import) →
classes/attendance → **fee structure + collection + concessions/fines + ledger +
financial audit** → backups. That is a complete product a school can pay for and
fully replace Excel/Word/Access with.
