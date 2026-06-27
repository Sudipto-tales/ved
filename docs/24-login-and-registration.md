# 24 — Login Points & School Registration (the full flow)

Who logs in **where**, how each person **gets credentials**, and the **end-to-end flow**
to bring a brand-new school onto VED. Ports below are the local dev defaults
(`docker-compose.yml` / `.env`).

---

## 1. The three planes & their login points

VED has **two backends** and **three frontends**. There are exactly **two login
endpoints** — one per plane.

| Who | Frontend (browser) | Login endpoint (API) | Login field |
|---|---|---|---|
| **Platform superadmin** (VED operator) | **Platform SPA** — `http://localhost:5174` | `:8080/api/v1/platform/login` | `email` |
| **Everyone in a school** — admin · staff · **teacher** · **student** · **guardian** | **Tenant app** — `http://localhost:5173` | `:8091/auth/login` | `login_identifier` |

> **Key point:** students, teachers, guardians (and admins/staff) **all sign in at the
> same place** — the tenant app at `:5173`, one `/login` screen. They do **not** have
> separate login URLs. After sign-in, the app routes each person to *their* experience
> based on their membership `user_type` (see §3).

The superadmin is a **separate namespace** (`control_plane.platform_admin`), so a
superadmin account cannot log into the tenant app, and a school user cannot log into the
platform SPA. (This is why logging `super@ved.platform` into `:8091/auth/login` fails —
wrong plane.)

---

## 2. How each person gets their login

> **The registration rule (one line):** the **only** thing that self-registers is a
> **school**, and only at the **platform** (`/signup` on the control plane, §4). *Inside* a
> school **nobody self-registers** — every member (admin, staff, teacher, student, guardian)
> is **created by someone already in the school** who holds the matching permission. There is
> no public "create your account" inside a tenant.

So there are exactly two ways an account comes into being:
1. **A school** registers itself on the platform → on approval, VED provisions the tenant
   and its **first admin** (§4). This is the single self-service entry point.
2. **Everyone else** is **onboarded** from within the school by a permission-holder — by
   default the admin, who may delegate the `*.onboard` permissions to staff:

| Action | Permission | Who has it by default |
|---|---|---|
| Onboard a student | `student.onboard` | Admin (delegable to admission staff) |
| Onboard a teacher | `teacher.onboard` | Admin (delegable to HR) |
| Onboard staff | `staff.onboard` | Admin (delegable to HR) |
| Promote a guardian to a login | `student.update` | Admin |

The login identifier is a **generated handle**, not a real mailbox:

```
{name-slug}.{type}@{school-slug}.com        +  a one-time temporary password
type ∈ student | teacher | employee | guardian      (must be reset on first login)
```

| Person | How the account is created | Example handle |
|---|---|---|
| **School admin** | Created automatically when the **superadmin approves** the school (§4). | `lauralincoln.employee@lincoln.com` |
| **Teacher** | Admin/HR onboards them: *Teachers → Onboard* (`POST /api/v1/teachers/onboard`). | `iristeacher.teacher@lincoln.com` |
| **Staff** | Admin/HR onboards them: *Staff → Onboard*. | `gracehopper.employee@lincoln.com` |
| **Student** | Admission staff onboards them: *Students → Onboard* (`POST /api/v1/students/onboard`). A guardian contact is captured at the same time. | `johndoe.student@lincoln.com` |
| **Guardian** | A guardian starts as a *contact-only* record on a student. To give them portal access, an admin **promotes** them: *Students → Guardians → Promote to portal* (`POST /api/v1/students/guardians/{id}/promote`). | `maryroy.guardian@lincoln.com` |

In every case the generated **login + temporary password are shown once** to the staff
member, who hands them over. On first sign-in the user is forced to reset the password
(`must_reset_password`).

---

## 3. What each persona sees after login (one app, persona-scoped)

The tenant app resolves the signed-in user's `user_type` for the active school and routes
them to their home (`PersonaHome`); the sidebar shows only that persona's pages:

| `user_type` | Lands on | Sees |
|---|---|---|
| `EMPLOYEE` + `tenant.admin` (**Admin**) | Dashboard | Full management: People, Academics, Finance, Access, Setup, Reports… |
| `EMPLOYEE` (**Staff**) | Dashboard | Onboarding, fee collection, ledger — whatever their roles permit |
| `TEACHER` | `/teacher` | My sections, mark attendance, enter marks, assignments |
| `STUDENT` | `/student` | My profile, attendance, marks, timetable, fees, assignments |
| `GUARDIAN` | `/guardian` | Each child's attendance, marks, fees, notices (own children only) |

Cross-persona pages are additionally gated by **permission** (RBAC), and every read is
**tenant-isolated by RLS**; guardians are further restricted to their own children.

---

## 4. Full flow — registering a brand-new school

The genuinely new thing a registration produces is a **tenant + its first admin**; from
there the admin builds out everything else.

```
PROSPECT ──► Signup site (:5174/signup) ──► pick plan ──► Register ──► Upload payment proof
   │                                                                          │
   │                                                          PENDING_PAYMENT_REVIEW
   ▼                                                                          ▼
SUPERADMIN (:5174) ──► Registrations queue ──► Approve  ──► provisions tenant + license
                                                          + creates first ADMIN (login + temp pw)
   │
   ▼
SCHOOL ADMIN (:5173) ──► sign in ──► reset password ──► set up school
   │
   ├─ onboard Teachers / Staff / Students   (generates THEIR logins)
   └─ promote Guardians to portal users     (generates THEIR logins)
```

### Step by step

1. **Self-register** — the prospective school admin goes to the **signup site**
   (`http://localhost:5174/signup`), picks a plan (`GET /api/v1/plans`), and submits the
   school name, a unique **slug**, and their contact details
   (`POST /api/v1/register`). The slug becomes the school's permanent login domain
   (`…@{slug}.com`) and must be globally unique. → state `ONBOARDING`.

2. **Submit payment proof** — they upload payment details (amount, method, txn id)
   (`POST /api/v1/registrations/{id}/payment-proof`). → state `PENDING_PAYMENT_REVIEW`.
   They can watch progress on the status page (`GET /api/v1/registrations/{id}`).

3. **Superadmin reviews & approves** — in the **Platform SPA** (`:5174` → *Registrations*),
   the operator reviews the request — including its **KYC** (business reg / GST / status),
   auto-computed **risk score** (LOW/MEDIUM/HIGH with reasons), and **source** (M11, §6) —
   and approves (`POST /api/v1/platform/registrations/{id}/approve`). In one
   transaction this:
   - provisions the **tenant** (`ACTIVE`) + an `ACTIVE` subscription (pinned to the plan's
     latest **version** for grandfathered pricing, §5) + a gapless invoice,
   - issues a **signed license**,
   - **provisions the tenant plane**: the first **admin user** (generated login + one-time
     temp password **+ a one-time magic-login token**), the default **RBAC roles**
     (School Admin = `tenant.admin`, etc.), and a current **academic year**.
   The response returns the admin's `login` + `temp_password` **and a `magic_token`** to
   hand over (§5 "Magic login link"). (Or **Reject** with a reason.)

4. **School admin signs in** — at the **tenant app** (`http://localhost:5173`) with that
   login + temp password, is forced to **reset the password**, and now holds
   `tenant.admin`. They can configure the school and onboard everyone else (§2) — each
   onboarding generates that person's login, which they hand over so teachers/students/
   guardians can sign in at the same `:5173`.

### The registration state machine
```
ADMIN_REGISTERED → ONBOARDING → PENDING_PAYMENT_REVIEW → ACTIVE
                                                       ↘ REJECTED   (↘ SUSPENDED later)
```

---

## 5. Platform support & onboarding extras (M11)

Five super-admin/onboarding refinements layer onto the flow above (spec: `docs/promts.md`).
None change the planes or the login points — they make approval, sign-in, and support
smoother and safer.

### Magic login link (one-click activation)

Instead of typing the generated handle + temp password, the new admin can click a link:

```
https://{slug}.{domain}/activate?token=XYZ…
```

At approval, provisioning mints a **one-time activation token** (72 h) alongside the temp
password — only its SHA-256 **hash** is stored (tenant-plane `activation_token`), the raw
value travels only in the link. The tenant app's public **`/activate`** page exchanges it:

```
POST :8091/auth/activate   { "token": "XYZ…" }   → access + refresh tokens (still must_reset)
```

The node resolves the live token via a narrow `auth_activation` `SECURITY DEFINER` read
(same controlled-bypass pattern as login), **consumes it single-use** (a re-clicked link
404s), and signs the admin in — who is still forced to set a password. The temp password
remains a fallback.

### Login As Tenant (superadmin impersonation)

For support, a superadmin can enter a school **without ever seeing a password** (the
Salesforce/Shopify model). It is **tenant-consented** and **audited**:

1. **Consent is tenant-owned.** A school admin toggles *Settings → Super-Admin Access*
   (`PUT /api/v1/access/superadmin-access {allow_superadmin_access}`), which flips
   `tenant_profile.allow_superadmin_access` (golden rule: row + outbox + audit). Default
   **off**.
2. **Enter the tenant.** From *Tenants → Login As*
   (`POST /api/v1/platform/tenants/{id}/login-as`, gated `platform.tenant.manage`): if the
   tenant consented, the control plane mints a **short-lived (30-min)** access token for the
   tenant's School Admin — a real **node token** (signed with the shared `JWT_SECRET`)
   carrying an `imp` (impersonator) claim — and records the action in `cp_audit_log`. No
   consent → `403`.
3. The platform opens the tenant app carrying that token; the node accepts it like any
   login, and the session simply expires in 30 minutes.

### Registration KYC · risk · source

The review queue (§4 step 3) now carries triage signals captured at registration:
- **KYC** — business-registration no., GST, notes, and a `PENDING/VERIFIED/REJECTED` status
  the superadmin sets (`POST …/registrations/{id}/kyc`).
- **Risk score** — `LOW/MEDIUM/HIGH`, auto-computed from cheap heuristics (free-email
  domain, sign-up velocity, duplicate phone) with the reasons listed.
- **Source** — `WEBSITE/REFERRAL/CAMPAIGN/DIRECT` (+ free-text detail).

### Plan versioning (grandfathered pricing) · AutoPay

- **Plan versions** — a price change adds a new `plan_version`; existing subscriptions stay
  **pinned** to the version they bought (grandfathered) while new subscriptions bind to the
  latest. The Plans page shows each version's price, effective date, and subscriber count.
- **AutoPay** — a per-subscription toggle with adoption / failure / renewal-success
  analytics on the Subscriptions page.

---

## 6. Quick reference — dev credentials & URLs

| Thing | Value |
|---|---|
| Tenant app | `http://localhost:5173` |
| Platform SPA + signup | `http://localhost:5174` (signup at `/signup`) |
| Dev tenant admin | `admin@ved.local` / `admin1234` (tenant “VED Demo School”) |
| Platform superadmin | `super@ved.platform` / `super1234` |
| Seeded demo schools | run `./ved.sh seed-demo`; admin logins in `scripts/demo-seed-record.json` |
| Clean demo data | `./ved.sh clean-demo` |

> Ports reflect the current dev config (node on `:8091`, control plane `:8080`); the
> frontends call them via `VITE_API_URL` / the platform API base. Adjust if you remap.

---

## Cross-references
- Platform super-admin spec (M9–M11: KYC, Login-As, magic-link, plan versioning, AutoPay) — [promts.md](./promts.md)
- Credential generation & onboarding — [06](./06-onboarding-credentials.md)
- RBAC & permissions — [05](./05-rbac.md) · multi-tenancy / RLS — [03](./03-multi-tenancy.md)
- Control-plane registration tables & state machine — [database/01](./database/01-control-plane.md)
- Frontend apps, personas & routing — [22](./22-frontend.md)
