# VED — Build Tracker

The single place that records **how far the build has progressed** against the plan
([docs/plan/README.md](./docs/plan/README.md)). Update the status marks as work lands.

**Legend:** ✅ done · 🟡 scaffolded / partial · ⬜ not started

> **YOU ARE HERE:** **BUGFIX — subdomain tenant context never set, so admins on
> `{slug}.ved.test` could not create students (or do any permission-gated action).** Root
> cause (frontend, found by driving the whole platform→school flow over HTTP): on a
> `{slug}.ved.*` subdomain the post-login flow (`useAuthFlow`) navigates to `/` but never
> calls `setTenant`, and `TenantProvider.activeTenantId` was sourced ONLY from the
> localhost picker's `localStorage`. So on every real school subdomain `activeTenantId`
> stayed `null` → `useSyncPermissions` (gated on `activeTenantId`) never fetched
> `/me/permissions` → permissions stayed `[]` → every `<Can>`/`PermissionGuard` failed
> closed → the **"Onboard student"** button (and all admin actions) vanished, plus persona
> + sidebar-brand fell back wrongly. The localhost/dev path worked only because
> `tenantSlug` is null there, so it fell through to `setTenant(memberships[0].tenant_id)`.
> **Fix:** `TenantProvider` now derives `activeTenantId` on a subdomain from the membership
> whose `slug` matches the host (or the sole membership for older sessions without the slug
> field), so the bare-host picker path is unchanged but the subdomain path resolves the
> tenant id — fixing permission-sync, persona routing, and the brand in one place; covers
> fresh login, refresh, and pre-existing sessions (memberships are read synchronously from
> localStorage, and `AuthProvider` wraps `TenantProvider` so `useAuth()` is available).
> **Verified:** the ENTIRE backend flow is healthy end-to-end (live HTTP on the running
> stack) — platform login → register → payment-proof → approve+provision → new-admin login
> (via nginx + `X-Tenant-Slug`) → onboarding-template/dropdowns/roles all seeded →
> **`POST /students/onboard` returns 201** (direct, nginx, and slug paths) → student in
> roster; `/me/permissions` for the provisioned admin includes `student.onboard`. So the
> bug was purely the FE tenant-context seam. `tsc -b` + `vite build` clean; fix rebuilt
> into the running `web` container and confirmed served. _Also surfaced (environment, not
> code): `*.ved.test` has no wildcard DNS here — `/etc/hosts` lists only a few slugs and
> dnsmasq (`deploy/dnsmasq/ved-test.conf`, docs/25 §6) isn't active, so a freshly-registered
> school's subdomain won't resolve in the browser until added. Carried-forward: not yet
> browser-smoked (the sandbox can't hold a headless-Chrome debug session); recommend a
> click-through on a resolvable school subdomain to confirm the Onboard button now appears._
>
> **(prev) Post-login identity in the tenant shell — school name + welcome +
> account chip (backend + frontend), live-verified.** Two fixes shipped together. (1)
> **Removed the dead `{slug}-admin` subdomain structure** — the tenant admin uses the SAME
> `{slug}.ved.test` door as every other role (the login identifier, not the address, picks
> the experience; docs/24, docs/25). Dropped the `admin` arg from `platformApi.tenantUrl`,
> deleted the redundant "Open admin" button on the platform Tenant detail page, and fixed
> the misleading nginx comments. (2) **The shell now shows which school you're in and who
> you are.** Previously the sidebar was a hardcoded "VED" + a truncated tenant UUID, the
> dashboard said a generic "Welcome back", and the topbar had no profile. Sourced from the
> **login payload** (so EVERY persona gets it with no extra, admin-gated call): new
> migration **`00017_membership_tenant_name`** widens the `auth_memberships(uuid)` SECURITY
> DEFINER fn to also return `tenant_name`+`tenant_slug` via a LEFT JOIN on `tenant_profile`;
> identity's `MembershipDTO` gains `tenant_name`/`slug`, `LoginResult` gains the user's
> `login` handle, and `/me/memberships` re-resolves from the DB so a refresh carries the
> same fields. OpenAPI spec updated + TS client regenerated (the fence). FE: `AuthProvider`
> carries the handle + a new `useActiveMembership()` helper; the **sidebar brand** shows the
> school name + slug, the **dashboard hero** reads "Welcome to {School} 👋", and a **topbar
> account chip** (avatar + handle + role label + sign-out menu, reusing the `.menu` pattern)
> fills the empty topbar. Added `user`/`chevron-down`/`log-out` thin-line icons.
> **Verified:** `go build`/`vet`/`gofmt` clean (identity); both web apps `tsc -b` + `vite
> build` + `build:platform` clean (EXIT 0); identity integration test extended + green;
> **live HTTP smoke on the rebuilt node** — `POST /auth/login` (admin@ved.local) returns
> `login`="admin@ved.local", `memberships[0].tenant_name`="VED Demo School", `slug`="ved";
> `/me/memberships` carries the same; migration #17 applied. _Carried-forward: impersonation
> / magic-link logins have no typed handle so the chip falls back to the role label only;
> a teacher/student live login wasn't re-smoked but the DB fn returns the name for every
> persona._
>
> **(prev) Guided school-setup journey + tenant sidebar redesign (frontend) —
> complete, typechecks + builds clean.** New **`docs/26-school-setup-journey.md`** specs the
> dependency-ordered setup chain (academic year → programs → sections/subjects → teachers →
> teaching assignments → students → fees) with the rule "you can't reference a thing that
> doesn't exist yet" (the worked example: create a teacher before assigning classes). FE: a
> single-source **`useSetupProgress`** hook derives each step's done/blocked status from the
> existing per-tenant list endpoints; a **`SetupChecklist`** on the admin dashboard (gated
> `tenant.settings`, hides when complete) shows ordered steps with progress %, NEXT/locked
> states and CTAs; a **`SetupGate`** soft-warning banner on the dependent pages (Teaching
> assignments → needs teachers/sections/subjects; Sections → programs; Enrollment → sections)
> names the missing prerequisite and links to it without hard-blocking. The **tenant sidebar**
> is regrouped from one flat "ADMIN" list into functional, journey-ordered sections (Setup ·
> People · Academics · Finance · Communication · Access & Roles · Reports · Support) derived
> from each page's path in `AppShell`; the teacher/student/guardian portals keep their focused
> single-group nav. **Verified:** tenant `tsc -b` + `vite build` clean (1056 modules); platform
> unaffected. _Not yet browser-smoked. Carried-forward: finance SetupGate (Invoices/Collection
> needs a fee-structure presence check beyond the fee-heads count)._
>
> **(prev) Dynamic School-Registration Form (control plane) — backend + frontend
> complete & live-verified.** The platform superadmin can now curate the public `/signup`
> form without a code change — the control-plane sibling of M10's dynamic onboarding template
> (docs/06, docs/24). New cp migration **`cpmigrations/00011_registration_form`** adds a SINGLE
> GLOBAL **`registration_field_config`** table (no tenant_id/RLS/sync — control-plane
> convention) + an **`extra_fields` JSONB** on `school_registration`, and seeds the built-ins
> (`school_name/slug/admin_name/admin_email/plan_id` LOCKED — relabel/reorder only, never
> hide/un-require; `admin_phone` toggleable; `business_reg/gst` hidden-by-default toggleable
> built-ins that map to the existing KYC columns). Backend **`registration_form.go`**:
> `GetRegistrationForm(includeHidden)` + `SaveRegistrationForm` (golden-rule ANALOG — field
> upserts + **ONE `cp_audit_log`** row, **NO `cp_outbox`** since the template is
> control-plane-only and never reaches a node; immutable kind/field_type/locked taken from the
> stored row; custom keys validated as slugs; absent customs hard-deleted). `Register` now loads
> the live template, **rejects** missing visible+required fields (built-in OR custom) with their
> labels, and persists recognised **visible** custom answers into `extra_fields`. Handlers:
> public `GET /api/v1/registration-form` (drives signup) + platform `GET`/`PUT
> /api/v1/platform/registration-form` (gated `platform.registration.review`). FE (platform SPA,
> manual client): the signup form **renders from the template** (built-ins keep bespoke widgets;
> custom fields render by type incl. dropdown; required-validated; posts `extra{}`), a new
> **Registration Form** editor page under the TENANTS sidebar section (toggle/relabel/reorder
> built-ins, add/remove custom fields with a dropdown-options editor, locked rows disabled), and
> the review page shows submitted custom answers. **Verified:** `go build`/`go vet
> -tags=integration`/`gofmt` clean; platform `tsc -b` + `vite build:platform` clean; **3 new
> integration tests green** (save golden-rule: one cp_audit_log + zero cp_outbox + locked/
> dropdown/slug guards; Register enforces required custom field + persists visible / drops hidden
> answers; public projection visibility + ordering); **live HTTP smoke** on the control-plane
> binary — public GET built-ins, platform login, unauth PUT → 401, PUT add required custom
> dropdown → 204, register WITHOUT it → 400 "required field(s): Affiliation board", WITH it →
> 201 + `extra_fields={"board":"CBSE"}` persisted. _Carried-forward: custom **FILE** fields
> render as a link/text input for now (MinIO upload path — the payment-proof pattern — is a fast
> follow-up); endpoints use the manual platform API client (OpenAPI promotion is a doc
> follow-up, consistent with the M9–M11 slices). Pre-existing `TestMagicLinkActivation` failure
> (`outbox_op_check` in identity.Activate) is unrelated to this slice — reproduces on the clean
> branch._
>
> **(prev) M11 (Login-As · Magic-Link · Plan-Versioning · KYC · AutoPay) — backend
> + frontend complete; live DB verification PENDING.** The five deferred super-admin/platform
> features (docs/promts.md) are built as five vertical slices. **Slice A — KYC/Risk/Source**
> (`cp/00006`): `school_registration` gains kyc_status/business_reg/gst/notes + risk_score
> (auto-triaged at register: free-email domain → MEDIUM, >5 sign-ups/hr → HIGH, dup phone) +
> risk_factors + source (WEBSITE/REFERRAL/CAMPAIGN/DIRECT); superadmin `POST …/kyc` verify/reject
> + `kyc-analytics`. **Slice B — Login-As** (`00014` tenant + `cp/00007`): impersonation is
> TENANT-CONSENTED (`tenant_profile.allow_superadmin_access`, the school admin toggles it,
> golden rule) — `POST /platform/tenants/{id}/login-as` mints a SHORT-LIVED (30-min)
> node-compatible access token (`auth.IssueImpersonation`, new `imp` claim) for the tenant's
> School Admin, gated by consent, audited to a new `cp_audit_log`. Passwords are never shown.
> **Slice C — Magic Link** (`00015`): provisioning mints a one-time `activation_token` (hash
> stored; raw returned in ApproveResult); node public `POST /auth/activate` (controlled-bypass
> `auth_activation` SECURITY DEFINER) consumes it single-use → logs the admin in (still forced
> to reset). **Slice D — Plan versioning** (`cp/00008`): immutable `plan_version` chain +
> `subscription.plan_version_id` pin → new subscribers get the latest version, existing stay
> **grandfathered**; `GET/POST /platform/plans/{id}/versions` with per-version subscriber counts
> + price diff; catalog headline rolls forward on a new version. **Slice E — AutoPay**
> (`cp/00009`): `subscription.autopay_enabled` + last_status/failed_count; toggle +
> adoption/failed/renewal analytics; surfaced on the enriched tenant row. FE (platform SPA,
> manual `platformApi.ts`): KYC/risk/source columns + KYC verify + magic-link shown at approval;
> **Login As** button (opens `tenantUrl/#login-as=<token>`); AutoPay column/toggle + analytics
> cards; Plans version-history panel + new-version form. Tenant app: super-admin-access consent
> toggle + a public **/activate** page (magic-link + impersonation-hash handoff).
> **Verified:** `go build`/`go vet -tags=integration`/`gofmt` clean across the module; both web
> apps `tsc -b` + `vite build` + `build:platform` clean (EXIT 0). **5 new integration tests
> WRITTEN** (risk scoring + KYC decision; consent-gated login-as token + audit; magic-link
> single-use; plan grandfathering; autopay analytics) — _compile-verified only._ **PENDING: the
> live integration run + HTTP smoke** — the dev Postgres port (5432) was held by an unrelated
> container this session, so `./ved.sh test` couldn't bind; run it once the port is free.
> _Next: live-verify M11, then **M12** (Support tickets + AI chatbot). Carried-forward: M11
> endpoints use the manual API clients (OpenAPI promotion is a doc follow-up); cross-subdomain
> impersonation-token handoff via URL hash (tighten to a one-time code later); GUARDIAN
> onboarding template._

> **(prev) M10 (Dynamic onboarding template) complete & verified.** A School Admin
> can now tailor the people-onboarding forms without a code change (docs/06). Migration
> `00013_onboarding_template` adds two tenant-scoped + RLS + sync tables: **`onboarding_field_config`**
> (per person_type, toggles VISIBLE + REQUIRED + label + order over the BUILT-IN OnboardInput
> fields — the "field-toggle" model, `field_key` always maps to an existing field, no arbitrary
> columns) and **`dropdown_option`** (admin-managed option lists: GENDER/BLOOD_GROUP/
> STUDENT_CATEGORY/GUARDIAN_RELATION/DEPARTMENT/DESIGNATION). The `access` slice gains the
> service+handlers (`tenantsetup.go`): `GET /access/onboarding-template/{type}` (ungated —
> the forms need it; falls back to code defaults if un-customized), `PUT …` (tenant.settings,
> golden rule: field upserts + ONE outbox + ONE audit), and `GET/POST/DELETE /access/dropdowns`.
> The onboarding **engine** gained `MissingRequiredFields`, and students/teachers/staff
> `Onboard` now reject when a visible+required field is absent (core name/admission_no still
> enforced in code). Defaults are seeded at provisioning + dev boot (idempotent). FE: a tenant
> **Onboarding Forms** admin page (per-type visible/required/label editor) + the **Dynamic
> Dropdowns** page rewired to real CRUD, and the student/teacher/staff onboard forms now render
> from the template (hide non-visible, mark+validate required, dropdown-backed selects).
> **Verified:** `go build`/`vet`/`gofmt` clean; **3 new integration tests** green (template
> seed+save golden rule + non-configurable-field rejected; engine required-field enforcement;
> dropdown upsert-in-place + RLS isolation + soft-delete) alongside the full suite; both web
> apps `tsc -b` + `vite build` + `build:platform` clean; **live HTTP smoke** on the node — seeded
> template (8 student fields) + 20 dropdowns, `PUT` dob→required (204), `POST` dropdown (200),
> unauth `PUT` 401, and the marquee loop: **onboard with dob missing → 400 "required field(s):
> Date of Birth", with dob present → 201.** _Next per the plan: **M11** (Login-As/magic-link/
> plan-versioning/KYC/AutoPay), **M12** (Support tickets + AI chatbot). Carried-forward: the
> GUARDIAN onboarding template (no form yet); promoting the M9/M10 endpoints into the OpenAPI
> spec + generated client (both use the manual API clients today, matching their slices)._

> **(prev) M9 (Super-Admin Platform v2) — foundation round complete & verified.**
> The control-plane super-admin surface (docs/promts.md) went from happy-path-only to an
> analytics-driven console: a new cp migration (`00004_platform_v2`) adds a **license status
> state machine** (ACTIVE/SUSPENDED/EXPIRED/CANCELLED + auto-renew + end-of-cycle cancel +
> `superseded_by`), `payment_proof.clarification_note`, `plan_catalog.annual_price/status`,
> and `school_registration.reminded_at`. A new `registration/platform_v2.go` adds, all
> platform-gated: **registration analytics + funnel** (avg-approval-time, approval-rate,
> volume/day) + Send-Reminder; **payment-proof clarification** (INFO_REQUESTED + note,
> surfaced to the public status poll) + verification analytics; **license lifecycle** —
> suspend/resume (mirrors `revoked` for the node), cancel (immediate | end-of-cycle), and
> extend/change-plan which **re-sign** a fresh license via `license.Sign` and supersede the
> old row — every license mutation also writes a `control_plane.cp_outbox` push for the node;
> **subscriptions analytics** (MRR normalized per cycle, ARR, churn, plan popularity, revenue
> trend) + **plan CRUD** (create/update/duplicate/archive); **tenant enrichment** (plan +
> license + user-count + subscription join, suspend/resume cascade, billing history); and a
> composed **dashboard** endpoint. FE: a **Recharts chart kit** (`shared/ui/charts` —
> FunnelChart/TrendChart/BarSeries/DonutChart/DotChart on design tokens), a grouped sidebar
> (Dashboard · TENANTS · BILLING · INSIGHTS), a new **Plans & Prices** page, and rebuilt
> Dashboard/Registrations/PaymentProofs/Licenses/Subscriptions/Tenants pages. **Verified:**
> `go build`/`go vet`/`gofmt` clean; full integration suite green incl. **4 new M9 tests**
> (license suspend-mirror + extend re-sign verifies + cp_outbox push; clarification flips
> status + public poll + settled-row no-op; plan archive leaves the public catalog; analytics
> aggregates incl. MRR×12=ARR + enriched tenant); both web apps `tsc -b` + `vite build` +
> `build:platform` clean; **live HTTP smoke** on the control-plane binary — login → all v2
> endpoints 200, 401 without token, suspend→204→SUSPENDED, extend→new signed license, real
> dashboard counts (12 tenants, MRR ₹66,666, license distribution Premium 8/Starter 4).
> _Carried-forward: v2 endpoints use the platform SPA's manual `api.ts` client (consistent
> with the existing dashboard/tenants/licenses/subscriptions pages) — adding them to
> `controlplane.yaml` + the generated client is a documentation follow-up. **Deferred to
> M11** (per the plan): tenant impersonation / "Login As", magic login links, plan
> versioning / grandfathering, KYC / risk / source tracking, AutoPay. **M10** = dynamic
> school-admin onboarding template (field-toggle + dropdowns). **M12** = Support tickets +
> AI chatbot (Support page stays a scaffold; dashboard shows 0 open tickets)._

> **(prev) M8 (LMS) — complete and verified** — the final roadmap milestone, so
> the whole phased build M0→M8 is now done. The new `learning` slice delivers the
> content→submit→grade loop: teachers publish **assignments** (+ materials) anchored on a
> `teaching_assignment`; students **submit** (self-service — resolved from their membership,
> no staff perm; LATE derived from `due_at`); teachers **grade**. `submission` and `grade`
> are **append-only** (a resubmission/re-grade is a NEW row, latest wins; DB triggers block
> UPDATE/DELETE). The marquee **integration point**: grading an assignment with `max_marks`
> writes an append-only `mark_entry` into academics **in the same tx** — so an assignment
> counts toward assessment from the ONE marks ledger, not a parallel one (`mark_entry`
> gained a nullable `exam_id` + `assignment_id`). Files carry only a MinIO `storage_key`.
> Verified live: assignment published; student submit SUBMITTED → resubmit RESUBMITTED (2
> rows kept, teacher sees latest-per-student); grade 72 → mark_entry 72; re-grade 85 → 2
> grades + 2 mark_entries kept, effective 85; `UPDATE grade`/`DELETE submission` rejected
> by trigger; student can't create/grade (403), non-student can't submit (403). FE: teacher
> Assignments + grading screens, `tsc`/build clean. **The roadmap is complete (M0–M8).**
> _Carried-forward (post-roadmap polish): LMS T3c (quizzes/discussion), lesson plans,
> MinIO blob upload, student/guardian LMS FE; academics setup FE. **M6 is now
> code-complete** — pillars 1–5 (real HLC + LWW/tombstone merge), bidirectional cloud→node
> push-down, and the offline license-grace state machine all landed & tested; only the
> infra items remain (mTLS / per-tenant NATS accounts / WAL archiving / DR drill) plus
> wiring the license guard as a mutation-gate._

> **(prev) M7 (Guardian Portal) — complete and verified** — child-scoped read
> access on top of RLS. Per docs/18 the guardian is *an actor + a portal, not a slice*:
> the only schema change is a nullable `guardian.membership_id` (links a login to a
> contact record). A staff **promote** flow (`POST /students/guardians/{id}/promote`,
> `student.update`) gives a contact-only guardian a GUARDIAN login + the seeded
> **Guardian** role (auto guardian.* perms) via the shared onboarding engine. The new
> **`guardian` feature** owns no tables — it's a child-scoped projection: it resolves the
> caller's `guardian_id` from their membership, then restricts every read to the
> `guardian_student` set (query layer) **on top of** RLS (defence-in-depth), reusing the
> academics + finance *services* (not their tables). Verified live: promoted guardian
> logs in with 4 guardian.* perms (not tenant.admin); sees only their **one** linked child;
> reads that child's fees (outstanding 3000) + attendance (200); **a foreign child →
> 403** (both fees & attendance); a non-guardian (admin) → 403; the guardian can't touch a
> staff endpoint (`/students` → 403). FE: guardian dashboard (multi-child switcher) + child
> attendance + child fees, `tsc -b` + `vite build` clean. Next: **M8 (LMS)**, Tier-2
> guarded writes (online pay, leave requests), the Expo mobile app, or finishing
> M6 hardening. _DoD carried forward as before (OpenAPI specs, DB-integration tests,
> platform SPA, academics FE, HLC-merge/mTLS/DR)._

> **(prev) M6 (Sync & Offline) — core complete and verified** — the system is now
> local-first. Because every mutation already wrote an `outbox` row in its transaction
> (the golden rule, since M0), this was **wiring, not a rewrite**. A **relay** worker on the
> node publishes unsent outbox rows to **NATS JetStream** (`tenant.<id>.<aggregate>.<op>`,
> dedup MsgId = event id) and marks them sent; the cloud **sync hub** (`cmd/controlplane`)
> runs a **durable** JetStream consumer that idempotently records every tenant's events in
> the durable history `control_plane.sync_event` (PK on event_id = the inbox dedupe).
> Verified live on real JetStream: the relay drained the **54-event backlog** (M1–M5) into
> the cloud history and marked the outbox sent; a fresh onboard flowed end-to-end (+1);
> **idempotency** — re-arming an event republished it with **no duplicate** in the cloud
> (JetStream MsgId + PK); and the **offline-replay drill** — hub killed, node kept
> producing (events buffered in JetStream), hub restarted → its durable cursor **resumed**
> and applied the buffered event. Pillars 1–4 (outbox · UUIDv7 · JetStream · idempotent
> inbox + resumable cursor) are live; the append-only ledgers (M5) already cover
> "lossless where it matters". _Deferred/carried-forward: per-field HLC LWW merge for
> mutable rows + tombstone apply (pillar 5); mTLS + per-tenant NATS accounts; cloud→node
> config push-down; snapshot/replay bootstrap + DR drill; local WAL archiving; offline
> license grace. Plus the platform SPA, academics FE, OpenAPI specs, DB-integration tests._

> **(prev) M5 — complete and verified** — all four replication slices done
> (teachers, staff, **academics**, **finance**). The design care point — **append-only
> ledgers** — is proven end to end. Academics adds the structure (program → stage →
> subject → section → enrollment + exam) plus the two append-only ledgers
> **attendance_event** and **mark_entry**; finance adds the **append-only, event-sourced
> ledger** (fee_head → invoice/DEBIT → payment/CREDIT with **gapless receipts** →
> **derived outstanding** Σ DEBIT−Σ CREDIT → **reversal** void). **DB triggers** block
> UPDATE/DELETE on every append-only table (defence at the database). A minimal
> `academic_year` (tenant-setup subset) is seeded for dev. Verified live: attendance
> re-mark keeps all 3 rows, latest-by-hlc wins, summary summed (PRESENT 2/2); mark
> re-grade → effective 45; invoice 5000 → outstanding 5000 → pay 5000 → 0 → void 2000 →
> 2000 (payment row preserved); receipts RCT-00001/00002 gapless; `UPDATE ledger_entry`
> and `DELETE attendance_event` rejected by trigger; no-token 401; RLS foreign-tenant 0.
> FE: finance **student-ledger** screens (issue charge / record payment / void / derived
> outstanding), `tsc -b` + `vite build` clean (academics setup/attendance UI deferred).
> Next: the platform SPA (M4), or **M6 (sync)** — the outbox is already populated by every
> slice, so sync is wiring. _DoD carried forward: OpenAPI specs; automated DB-integration
> tests; fee structures/schedules/concessions/fines, COURSE_BASED mode, timetable; full
> tenant-setup slice; academics FE._

> **(prev) M5 (Teachers & Staff)** — the "bridges-first,
> then replicate" payoff. The shared people machinery is now a kernel **onboarding engine**
> (`internal/platform/onboarding`): handle generation + temp password + user + membership
> + roles in one tenant tx, plus the aggregate event/audit writer. `students` was
> **refactored** onto it (and re-verified), and `teachers` (TEACHER) + `staff` (EMPLOYEE)
> are near-copies that only add their profile table + domain event — each is
> onboard/roster/detail end-to-end (DB → engine → handler `requirePermission` → React).
> Verified live: `teacher.onboard`/`staff.onboard` golden rule (1 row ⇒ 1 outbox ⇒ 1
> audit); handles `alanturing.teacher@ved.com` / `gracehopper.employee@ved.com` (correct
> type suffixes); membership user_type TEACHER/EMPLOYEE; duplicate employee_code 409;
> rosters/detail 200; **students still pass post-refactor**; no-token 401; RLS on
> `teacher` as `ved_app` (own 1, foreign 0). FE: teachers + staff roster/onboard/detail
> screens, `tsc -b` + `vite build` clean. Next: **M5 cont.** (`academics`/`finance` —
> append-only ledgers/marks/attendance), the platform SPA, or **M6** (sync). _DoD carried
> forward: OpenAPI specs; automated DB-integration tests; person_document upload (MinIO);
> onboarding wizard/approval states._

> **(prev) M4 (Control Plane) — backend complete and verified** — the central
> cloud that registers schools and provisions tenants, a SEPARATE binary
> (`cmd/controlplane`), SEPARATE schema (`control_plane`), and SEPARATE permission
> namespace (`platform.*`). The full chain runs end to end: platform superadmin login →
> school self-registers (slug validated/unique) → uploads payment proof
> (`PENDING_PAYMENT_REVIEW`) → superadmin **approves** → in one control-plane tx the
> registration state machine advances (tenant ACTIVE + subscription ACTIVE + **gapless**
> invoice + payment-proof APPROVED + a **signed** offline license) → then the **cross-plane
> handoff** provisions the tenant plane: first admin (generated credential + temp
> password), the M2 RBAC bootstrap (default roles + School Admin), and the M3
> tenant_profile slug. Verified live: register/duplicate-slug 409, proof 202, approve →
> `INV-2026-00001/00002` gapless, license signed; **the provisioned admin logs into the
> tenant node and resolves 31 effective permissions (tenant.admin) and hits gated
> `/access/roles` 200**; platform endpoints 401 without a platform token. (Found & fixed a
> real bug: `BootstrapTenant`'s School-Admin lookup relied on RLS, which the
> superuser control plane bypasses — now filters `tenant_id` explicitly, defence-in-depth.)
> license sign/verify is unit-tested. **Deferred:** the platform **SPA** (`web/platform/`
> is a separate Vite build, still manifest-only) and MinIO payment-proof upload (metadata
> + storage_key wired; blob path is the next step). Next: build the platform SPA, and/or
> **M5** (replicate the M3 shape for teachers/staff/academics/finance). _DoD carried
> forward: OpenAPI specs; automated DB-integration tests; control-plane audit log._

> **(prev) M3 (Onboarding + Students) — complete and verified** — the first real
> domain slice, which completes the walking skeleton. `student.onboard` runs the whole
> admission in **one transaction** (flow A): global `users` (generated login handle +
> temp password, `must_reset_password`) + `memberships` (STUDENT) [+ optional roles] +
> `student` profile + `guardian`(s) + `guardian_student` links + `outbox[student.enrolled]`
> + audit. A kernel credential generator (`internal/platform/credential`) produces the
> `{name}.{type}@{slug}.com` handle with global-uniqueness increment + a one-time temp
> password (unit-tested). A minimal `tenant_profile` (just `slug`) is seeded for the dev
> tenant (full tenant-setup slice + control-plane provisioning come at M4). The `notes`
> demo slice is **retired** (BE + FE removed; index now redirects to `/students`).
> Verified end-to-end: onboard 201 with golden rule (1 student ⇒ 1 outbox ⇒ 1 audit, +1
> guardian_student); handle `johndoe.student@ved.com` then `johndoe2.student@ved.com` on
> collision; new student `must_reset_password=true` on first login; duplicate admission
> 409; roster/detail 200; no-token 401; RLS on `student` as `ved_app` (own 2, foreign 0).
> Frontend: roster + onboard wizard (shows credentials once) + detail screens, `tsc -b` +
> `vite build` clean. Next: **M4** (Control Plane) and/or **M5** (replicate the slice for
> teachers/staff/academics/finance). _DoD gaps carried forward: OpenAPI spec files;
> automated DB-integration tests (RLS/golden-rule proven live; credential/gate logic
> unit-tested); document upload (person_document table exists; MinIO path is M4); the
> multi-step onboarding wizard + approval states (skip/direct path shipped)._

> **(prev) M2 (RBAC) — complete and verified.** The `requirePermission` gate is
> real and backed by data: a code-defined permission catalog (31 keys) is seeded at
> startup into the global `permissions` table; tenant provisioning seeds default system
> roles (School Admin, Admission Officer, Class Teacher, Accountant, Student) + their
> `role_permissions` and attaches the first admin to **School Admin** (`tenant.admin`).
> The `access` slice ships roles CRUD, designations, and membership-role assignment —
> every mutation row + outbox + audit in one tx, behind `authz.Require(...)`.
> `tenant.admin` short-circuits to "all within this tenant". Verified end-to-end on the
> deployed stack: admin login 200 → `/me/permissions` = 31 (tenant.admin expansion);
> role create 201 with golden rule (1 row ⇒ 1 outbox ⇒ 1 audit, +1 role_permissions);
> system-role delete 409; **role-less member 403 with `missing permission: role.manage`
> and empty `/me/permissions`**; foreign-tenant 403, no-token 401; RLS on `roles` as
> `ved_app` (own tenant 6, foreign 0). Frontend: AuthProvider now loads **real**
> per-tenant permissions from `/me/permissions` (the M1 `['*']` wildcard is gone),
> `PermissionGuard` waits for them, and the `access/roles` + `access/user-roles` screens
> are built; `tsc -b` + `vite build` clean. Next: **M3** (Onboarding + Students — first
> real domain slice; the `notes` demo retires there). _DoD gaps carried forward: a
> formal OpenAPI spec file + automated DB integration tests (RLS/golden-rule proven live
> via curl+psql; gate logic has unit tests); Redis caching of effective permissions is a
> planned optimization (currently resolved per-request from the DB)._

---

## Frontend buildout (Minimal Tech) — ✅ all pages created

Re-skinned the shared `shared/ui` token/kit layer to **Minimal Tech** (emerald/cyan/coral
on a soft-gray canvas, 16px cards + faint border + soft shadow, sparklines + growth deltas
+ hero banners) — both apps inherit it. Added kit primitives (DataTable, EmptyState, Field,
Tabs, Toolbar, Sparkline, GrowthDelta, HeroBanner, Select, StatCard spark/delta). Fixed
persona-scoped nav/routing (`AppShell` + `PersonaHome`: EMPLOYEE→management, TEACHER/STUDENT/
GUARDIAN→own portal). Built **every planned page** across the three apps via parallel
feature agents: **96 tenant pages + 11 platform pages wired (0 "planned" left)** + a public
**signup site** (landing→register→proof→status). New read endpoints over existing tables
(academics lists, finance invoices/payments, students/guardians, access designations/profile/
years, guardian child-marks, learning materials, platform registration/proof detail) + public
`GET /plans`. Pages over not-yet-existing tables (fee structures, timetable, dropdowns,
notices, …) are polished **designed scaffolds**. Both apps `tsc -b` + `vite build` clean;
`go build`/`vet`/`gofmt` clean; new endpoints smoke-tested 200; node/controlplane/web images
rebuilt. Roadmap (P0–P6) in [docs/22](./docs/22-frontend.md); tokens in [docs/23](./docs/23-design-system.md).

## Milestone tracker (→ [plan](./docs/plan/README.md))

| Milestone | Scope | Status |
|---|---|---|
| **M0** Foundations & walking skeleton | repo layout, migration+RLS, middleware chain, one slice end-to-end, FE shell | ✅ verified (skeleton + RLS enforcing) |
| **M1** Identity & Tenancy | real `users`/`memberships`, JWT login, tenant resolve | ✅ verified (argon2id + JWT + memberships + RLS-authorised tenant) |
| **M2** RBAC | permission catalog, roles, `requirePermission`, provisioning bootstrap | ✅ verified (catalog seed + default roles + real `requirePermission` + FE real perms) |
| **M3** Onboarding + Students | credential gen, onboarding engine, first real domain slice | ✅ verified (student.onboard tx + credential gen + roster/detail; notes retired) |
| **M4** Control Plane | registration state machine, payment-proof, licensing | ✅ verified — backend + **platform SPA** (login, registrations review/approve, tenants, licenses) |
| **M5** Teachers/Staff/Academics/Finance | replicate the M3 shape across slices | ✅ verified (teachers, staff, academics, finance; append-only ledgers DB-enforced) |
| **M6** Sync & Offline | NATS relay + inbox + HLC; wiring, not rewrite | ✅ code-complete (pillars 1–5: real HLC + row-level LWW/tombstone merge, bidirectional cloud→node push-down, offline license-grace state machine); mTLS/per-tenant accounts/WAL = infra, deferred |
| **M7** Guardian Portal & Mobile | child-scoped read API; Expo read-heavy | ✅ portal + **T2 guarded writes** (pay/leave/contact + maker-checker) + **Expo mobile read app** (login → children → attendance/marks/fees, `tsc` clean) |
| **M8** LMS | content → assignments → submission/grading | ✅ verified (T3a+T3b: assignments/materials → submit → grade → marks; append-only; T3c deferred) |
| **M9** Super-Admin Platform v2 | analytics + funnel, license lifecycle, payment clarification, subscriptions/plans, tenant enrichment, dashboard, Recharts kit | ✅ verified (foundation round; Login-As/magic-link/plan-versioning/KYC = M11, onboarding template = M10, support = M12) |
| **M10** Dynamic onboarding template | school-admin configures per-type field visibility/required + dropdown lists; onboard forms + backend validation honor it | ✅ verified (field-toggle + dropdowns; seeded defaults; live required-field enforcement) |
| **M11** Login-As · Magic-Link · Plan-Versioning · KYC · AutoPay | tenant-consented impersonation, one-time activation links, grandfathered pricing, registration KYC/risk/source, AutoPay analytics | 🟡 backend+FE built & compile/typecheck-clean (5 integration tests written); **live DB run + HTTP smoke pending** (port 5432 held this session) |

---

## DoD backfill — OpenAPI contract + DB-integration tests — ✅ complete (all slices)

The two cross-cutting DoD gaps carried forward since M1 ("OpenAPI specs" + "automated
DB-integration tests") are now closed across **every** slice. The `students` slice proved
the shape; the rest replicate it. **OpenAPI is the frozen fence:** Orval generates the TS
client + Zod from the spec, and each FE feature **consumes the generated client** (the
hand-written contract types are deleted — the spec is the single source).

**Tooling (shared):**
- Tenant-plane spec: `server/api/openapi/openapi.yaml` (root) + `components/common.yaml` + `paths/<slice>.yaml` — **9 slices, ~50 operations**, redocly-lint clean.
- Control-plane spec (separate plane, platform JWT): `server/api/openapi/controlplane.yaml` — 11 operations, redocly-lint clean.
- Codegen: `web/orval.config.ts` (tenant app + platform app targets), mutators `web/src/shared/api/mutator.ts` + `web/platform/src/shared/mutator.ts`, `npm run gen:api`. Generated dirs gitignored.
- Test harness: `server/internal/platform/testdb/testdb.go` — `Pool` (ved_app, RLS-enforcing) + `ControlPlanePool` (owner) + throwaway tenants, behind the `integration` build tag. `./ved.sh test` ensures infra and runs `-tags=integration`; default `go test ./...` stays DB-free.

**Per-slice (spec ✅ · FE consumes generated ✅ · integration tests ✅ pass on live PG):**

| Slice | Ops | Integration tests (what they prove) |
|---|---|---|
| students | 6 | RLS isolation · golden-rule atomicity · rollback (no orphan outbox/audit) |
| teachers | 3 | RLS · golden rule · dup employee_code rollback |
| staff | 3 | RLS · golden rule · dup rollback |
| access (RBAC) | 12 | RLS on roles · role-create golden rule · dup-name rollback |
| finance | 7 | RLS · derived outstanding (Σ DEBIT−Σ CREDIT) · append-only void preserves payment · gapless receipts |
| academics | 14 | RLS · **append-only attendance** (correction = new row, latest-by-hlc wins) |
| learning (LMS) | 6 | RLS · **append-only** submit/grade · grade → mark_entry in the ONE marks ledger |
| identity | 4 | login with generated temp credential (must-reset) · wrong-password rejected |
| guardian | 5 | child-scoping boundary — sees only linked child, **foreign child rejected** |
| registration (CP) | 11 | golden chain: register → proof → approve → tenant ACTIVE + **gapless invoice** + license + provisioned admin |

**Live verification:** `./ved.sh test ./...` → **all 10 slices pass** on the live Postgres
(28 integration tests). `go build`/`go vet`/`gofmt` clean; both web apps `tsc -b` +
`vite build` + `build:platform` clean.
**Carried-forward (minor):** Go-side request validation (`go-playground/validator`) and
wiring the generated **Zod** schemas into the FE forms (schemas are generated, not yet
imported by forms) — both incremental, neither blocks the contract or the tests.

## Documentation — ✅ complete

`docs/` (01–22 + `database/` + `plan/` + `commands.md`). Architecture, slices, RBAC,
sync, finance, academics, guardian, LMS, dataflow, DB architecture, frontend, the
per-slice schema plan, the execution plan, the component bridges, and the tooling
reference are all written and cross-linked.

## Tooling — ✅ complete

| Item | Status |
|---|---|
| `ved.sh` (build/start/stop + helpers + `test`) | ✅ runs, syntax-checked |
| `docker-compose.yml` (infra + `app` profile) | ✅ `docker compose config` validates |
| `.env.example` | ✅ |
| `docs/commands.md` | ✅ |
| OpenAPI → TS client codegen (`web/ npm run gen:api`, Orval; tenant + platform apps) | ✅ all slices |
| DB-integration tests (`./ved.sh test`, `-tags=integration`) | ✅ all 10 slices (28 tests) |

`./ved.sh up infra` works today. `./ved.sh up` (full) works once the steps below pass.

---

## Backend — `server/` (M0) — 🟡 scaffolded

| Component | File(s) | Status |
|---|---|---|
| Go module | `go.mod`, `go.sum` | ✅ tidied, `go.sum` generated |
| Binaries | `cmd/node`, `cmd/controlplane` | ✅ written |
| Config / DB pool | `internal/platform/config`, `internal/platform/db` | ✅ written |
| HTTP kernel + middleware | `internal/platform/httpx/{httpx,tenant}.go` | ✅ written (auth/rbac seams are stubs → M1/M2) |
| Migrations (embedded, goose) | `db/migrations/{embed.go,00001_cross_cutting.sql}` | ✅ written |
| Cross-cutting tables + RLS | migration 00001: `outbox`,`inbox`,`sync_cursor`,`audit_log` | ✅ written |
| Non-superuser app role (RLS enforcement) | migration 00002 `ved_app` + pool `SET ROLE` | ✅ verified isolating |
| Demo slice (golden rule) | `internal/features/notes` (row+outbox+audit in 1 tx) | ✅ proved the seam, then **retired at M3** (replaced by `students`) |
| Health/readiness | `internal/features/health` | ✅ written |
| **Compile + run verified** | — | ✅ `go build` 0; ✅ `./ved.sh up` round-trip (notes POST/GET, golden rule, 400 on no tenant) |

**RLS — fixed & verified.** Migration 00002 creates the `ved_app`
(NOSUPERUSER/NOBYPASSRLS) role; the node's pool runs `SET ROLE ved_app` on every
connection (`db.Connect`), while migrations keep running as the owner. Verified:
tenant-1 reads return only tenant-1 rows, tenant-2 only tenant-2's, and inserts pass
the RLS `WITH CHECK`. (Production: have the app's login role be a member of `ved_app`
rather than relying on a superuser's `SET ROLE`.)

## Backend — `server/` (M1 Identity) — ✅ verified

| Component | File(s) | Status |
|---|---|---|
| Migration `users` (global, no RLS) + `memberships` (tenant-scoped, RLS) | `db/migrations/00003_identity.sql` | ✅ applied |
| Cross-tenant login read (controlled bypass) | `auth_memberships(uuid)` `SECURITY DEFINER` fn | ✅ |
| Password hashing (argon2id, PHC-encoded) | `internal/platform/crypto` | ✅ + unit tests |
| JWT kernel (access+refresh, HS256) | `internal/platform/auth` | ✅ + unit tests |
| Auth middleware (Bearer JWT → identity) | `internal/platform/httpx/auth.go` | ✅ (replaces M0 stub) |
| Tenant-context **authorised** (tenant ∈ memberships → else 403) | `internal/platform/httpx/tenant.go` | ✅ |
| Identity slice (login/refresh/reset/me + dev seed) | `internal/features/identity/` | ✅ golden rule on seed |
| Node wiring (public / authed / authed+tenant groups) | `cmd/node/main.go` | ✅ |

**Dev seed:** `DEV_SEED=true` idempotently creates a demo tenant + admin
(`admin@ved.local` / `admin1234`, tenant `0189…0001`) via row+outbox+audit in one tx.
**Carried-forward DoD:** formal OpenAPI spec file + automated DB-integration tests
(RLS/golden-rule proven live via curl+psql for now).

## Backend — `server/` (M2 RBAC) — ✅ verified

| Component | File(s) | Status |
|---|---|---|
| Migration `permissions`(global) + `designations`/`roles`/`role_permissions`/`membership_roles` (tenant-scoped + RLS) + `memberships.designation_id` FK | `db/migrations/00004_rbac.sql` | ✅ applied |
| Code-defined permission catalog (31 keys) + default-role template | `internal/platform/authz/catalog.go` | ✅ |
| Effective-permission resolver (roles → permissions, RLS) | `internal/platform/authz/resolver.go` | ✅ |
| `requirePermission` gate (`authz.Require`, tenant.admin short-circuit) | `internal/platform/authz/middleware.go` | ✅ + unit tests |
| `access` slice: roles CRUD, designations, member-role assignment, `/me/permissions` | `internal/features/access/access.go` | ✅ golden rule per mutation |
| Read-only tenant-setup GETs (`/access/profile`, `/access/academic-years`, gated `tenant.settings`) powering the admin setup screens | `internal/features/access/access.go` | ✅ read-only (full tenant-setup write slice later) |
| Catalog seed + tenant provisioning bootstrap (default roles + attach admin) | `internal/features/access/provisioning.go` | ✅ idempotent |
| Node wiring (seed catalog, bootstrap dev tenant, mount gated slice) | `cmd/node/main.go` | ✅ |

**Live verification:** admin `/me/permissions` = 31 (tenant.admin → full catalog); role
create 201 with 1 row ⇒ 1 outbox ⇒ 1 audit (+1 role_permissions); system-role delete
409; role-less member → 403 `missing permission: role.manage` + empty `/me/permissions`;
foreign-tenant 403; no-token 401; RLS on `roles` as `ved_app` (own 6, foreign 0).
**Carried-forward:** Redis cache of effective perms (currently per-request DB resolve);
OpenAPI spec file; automated DB-integration tests.

## Backend — `server/` (M3 Onboarding + Students) — ✅ verified

| Component | File(s) | Status |
|---|---|---|
| Migration `tenant_profile`(minimal slug subset) + `student`/`guardian`/`guardian_student`/`person_document` (tenant-scoped + RLS) | `db/migrations/00005_people.sql` | ✅ applied |
| Kernel credential generator (slugify, type suffix, global-unique handle, temp password) | `internal/platform/credential/` | ✅ + unit tests |
| `students` slice: `student.onboard` (one-tx flow A), roster, detail | `internal/features/students/students.go` | ✅ golden rule |
| Dev tenant_profile seed (slug `ved`) | `internal/features/students/provisioning.go` | ✅ idempotent |
| Node wiring (mount students, seed profile) + **notes demo retired** | `cmd/node/main.go` | ✅ |

**Live verification:** onboard 201 → 1 student ⇒ 1 outbox[student.enrolled] ⇒ 1 audit
(+1 guardian_student); handle `johndoe.student@ved.com` then `…johndoe2…` on collision;
new student `must_reset_password=true`; duplicate admission 409; roster/detail 200;
no-token 401; RLS on `student` as `ved_app` (own 2, foreign 0).
**Carried-forward:** OpenAPI spec; DB-integration tests; document upload (MinIO, M4);
onboarding wizard/approval states (direct/skip path shipped).

## Backend — `server/` (M4 Control Plane) — ✅ verified (FE deferred)

Separate binary (`cmd/controlplane`), separate schema (`control_plane`), separate
permission namespace (`platform.*`). Control-plane tables carry **no** tenant_id/RLS/sync
(docs/database/01), so control-plane writes are plain transactional; the golden rule
applies only to the tenant-plane rows that provisioning creates in `public`.

| Component | File(s) | Status |
|---|---|---|
| Control-plane migration (own schema + own goose table): registration, tenant, plan_catalog, subscription, invoice, payment_proof, license, platform_admin, gapless counter | `db/cpmigrations/00001_control_plane.sql` | ✅ applied |
| Migrate plumbing (`UpControlPlane`, separate FS + version table) | `internal/platform/migrate/migrate.go` | ✅ |
| Signed offline license kernel (HMAC sign/verify) | `internal/platform/license/` | ✅ + unit tests |
| Platform auth slice (admin login → platform JWT, `RequirePermission`, dev superadmin seed) — separate namespace | `internal/features/platform/` | ✅ |
| Registration slice: public register + payment-proof; platform list/approve/reject/tenants | `internal/features/registration/registration.go` | ✅ |
| Approve = state machine (tenant+subscription+gapless invoice+proof+signed license) **+ cross-plane provisioning** (tenant admin via credential gen + M2 RBAC bootstrap + M3 tenant_profile) | same | ✅ |
| Control-plane wiring (migrate cp, seed superadmin+plans, public+platform routes) | `cmd/controlplane/main.go` | ✅ |

**Dev seed:** platform superadmin `super@ved.platform` / `super1234`; plans Starter/
Standard/Premium. **Live verification:** full chain register→proof→approve→provision→
license; gapless `INV-2026-00001/00002`; the provisioned tenant admin logs into the node
and resolves **31** perms (tenant.admin) + gated `/access/roles` 200; platform routes 401
without a platform token; duplicate slug 409.
**Fixed:** `BootstrapTenant` School-Admin lookup now filters `tenant_id` explicitly (the
superuser control plane bypasses RLS — relying on it cross-attached the wrong tenant's
role; caught in live verification).
**Platform SPA (`web/platform/`) — ✅ built & verified.** A SEPARATE Vite build (own
`index.html`/`vite.config.ts`/entry, `npm run build:platform`) that reuses the tenant
design system (`@/shared/ui`) but has its own platform-scoped auth + API client (control
plane :8080, separate token namespace). Pages: superadmin login, dashboard (counts),
**Registrations** (review queue + approve→provision→license with one-time admin creds
shown, + reject), **Tenants**, **Licenses** (new `GET /platform/licenses` endpoint added).
`tsc -b` typechecks both apps; `vite build --config platform/vite.config.ts` builds the
separate bundle. Verified: every SPA endpoint live (login, queue, approve→`INV-2026-00003`
+ provisioned admin, tenants, licenses, 401 without token).
**Deferred / carried-forward:** MinIO payment-proof blob upload (metadata + storage_key
wired); platform subscriptions/analytics/support screens; a control-plane audit log;
OpenAPI specs; automated DB-integration tests.

## Backend — `server/` (M5 Teachers & Staff) — ✅ verified

The replication milestone: the shared people machinery is extracted once, then teachers
and staff are near-copies. (academics/finance — the other M5 slices — are not yet built.)

| Component | File(s) | Status |
|---|---|---|
| Shared onboarding engine (WithTenant, SchoolSlug, CreateMember = handle+temp pw+user+membership+roles, event/audit writer, SQL helpers) | `internal/platform/onboarding/` | ✅ |
| `students` refactored onto the engine (DRY; re-verified) | `internal/features/students/students.go` | ✅ |
| Migration `teacher` + `employee` profile tables (RLS + base/sync, partial-unique employee_code) | `db/migrations/00006_people_staff.sql` | ✅ applied |
| `teachers` slice (TEACHER): onboard/roster/detail, gated teacher.* | `internal/features/teachers/teachers.go` | ✅ golden rule |
| `staff` slice (EMPLOYEE): onboard/roster/detail, gated staff.* | `internal/features/staff/staff.go` | ✅ golden rule |
| Node wiring (mount teachers + staff) | `cmd/node/main.go` | ✅ |

**Live verification:** teacher/staff onboard 201 with golden rule (1 row ⇒ 1 outbox ⇒ 1
audit); handles `alanturing.teacher@ved.com` / `gracehopper.employee@ved.com` (correct
suffixes); membership user_type TEACHER/EMPLOYEE; duplicate employee_code 409; rosters +
detail 200; **students still pass after the refactor**; no-token 401; RLS on `teacher` as
`ved_app` (own 1, foreign 0).
**Carried-forward:** person_document upload (MinIO); onboarding wizard/approval states;
OpenAPI specs; DB-integration tests.

## Backend — `server/` (M5 Academics & Finance) — ✅ verified

The append-only ledgers — the milestone's one new design care point. Corrections insert
NEW rows (latest by hlc wins); counts/balances are SUMMED on read, never stored; **DB
triggers** (`forbid_mutation()`) reject UPDATE/DELETE so immutability holds at the
database, not just the repo.

| Component | File(s) | Status |
|---|---|---|
| Academics migration (+ minimal `academic_year`): program/stage/subject/curriculum/section/enrollment/teaching_assignment/exam + **attendance_event** & **mark_entry** (append-only) + `forbid_mutation()` triggers | `db/migrations/00007_academics.sql` | ✅ applied |
| Finance migration: fee_head + **invoice/invoice_line** + **payment** (gapless) + **ledger_entry** (append-only) + counter + immutability triggers | `db/migrations/00008_finance.sql` | ✅ applied |
| `academics` slice: structure setup; `attendance.mark` + `marks.enter` (append-only, golden rule); derived reads (latest-by-hlc, summed summary) | `internal/features/academics/` | ✅ |
| `finance` slice: fee-heads; invoice (DEBIT); payment (CREDIT, gapless, flow B); void (REVERSAL); **derived** outstanding (Σ DEBIT−Σ CREDIT) | `internal/features/finance/finance.go` | ✅ |
| Shared `onboarding.Engine` reused for tenant tx + outbox/audit by both | `internal/platform/onboarding/` | ✅ |
| Dev `academic_year` seed; node wiring | `internal/features/academics/provisioning.go`, `cmd/node/main.go` | ✅ |
| Frontend: finance student-ledger (issue/pay/void/derived outstanding) | `web/src/features/finance/` | ✅ |

**Live verification:** attendance re-mark keeps all 3 rows, latest-by-hlc effective,
summary summed (PRESENT 2/2); mark re-grade → effective 45; invoice 5000 → outstanding
5000 → pay 5000 → 0 → void → 2000 (payment preserved); receipts RCT-00001/00002 gapless;
`UPDATE ledger_entry` + `DELETE attendance_event` rejected by trigger; no-token 401; RLS
foreign-tenant 0.
**Carried-forward:** academics setup/attendance FE; fee structures/schedules/concessions/
fines; COURSE_BASED mode; timetable; full tenant-setup slice (terms, rooms, dropdowns).

## Backend — `server/` (M6 Sync & Offline) — ✅ code-complete (pillars 1–5)

Local-first by WIRING the existing outbox to JetStream — no rewrite (every write has
routed through the outbox since M0). Core (pillars 1–4) was verified live earlier; this pass
adds the remaining code pillars (real HLC, conflict merge, the reverse sync direction, and
the offline license state machine).

| Component | File(s) | Status |
|---|---|---|
| NATS JetStream transport kernel (connect, ensure stream, publish w/ MsgId, durable subscribe) | `internal/platform/bus/bus.go` | ✅ + config stream `VED_CONFIG` (`cloud.>`) |
| Sync envelope + subject scheme `tenant.<id>.<aggregate>.<op>` | `internal/platform/sync/sync.go` | ✅ |
| Relay worker: unsent outbox → JetStream → mark sent (owner conn, spans tenants; at-least-once) | `internal/platform/sync/sync.go` | ✅ |
| Cloud durable history store + idempotent inbox (PK on event_id) | `db/cpmigrations/00002_sync.sql` (`control_plane.sync_event`) | ✅ applied |
| Sync hub: durable consumer `tenant.>` → idempotent apply | `internal/features/synchub/synchub.go` | ✅ |
| **Real Hybrid Logical Clock** (wall-ms + counter + node, monotonic `Now`, `Update` on receive, lexicographically-sortable encoding, `Compare` tolerant of legacy nanos) | `internal/platform/hlc/hlc.go` | ✅ + unit tests (replaces the M1–M5 `NowHLC` placeholder) |
| **Pillar 5 — conflict resolution:** pure LWW + tombstone decision (`Resolve`) + generic full-row applier (`ApplyRow`, row-level LWW, tombstone, resurrection, SQL-ident guarded) | `internal/platform/sync/merge.go` | ✅ + unit + integration tests |
| **Bidirectional cloud→node push-down:** cloud `cp_outbox` + cloud relay (`cloud.<id>.*`) + node idempotent inbox apply (`ApplyConfigEvent`, registry-driven) + node durable consumer | `db/cpmigrations/00003_config_outbox.sql`, `internal/platform/sync/{cloudrelay,inbox}.go`, `internal/features/configsync/configsync.go` | ✅ + integration tests |
| **Offline license-grace state machine** (`Evaluate` ACTIVE/GRACE/LOCKED from expiry+grace; thread-safe `Guard` the node holds) | `internal/platform/license/{grace,guard}.go` | ✅ + unit tests |
| Wiring: relay + config consumer in `cmd/node`; hub + cloud relay in `cmd/controlplane`; `hlc.SetNode` at node startup (all NATS-down tolerant) | `cmd/*/main.go` | ✅ |

**Verification.**
- *Live (earlier, real JetStream):* relay drained the 54-event M1–M5 backlog into the cloud
  history + marked outbox sent; fresh onboard flowed end-to-end; re-armed event republished
  with **no duplicate** (MsgId + PK dedup); **offline replay** — hub down → node buffered in
  JetStream → hub restart resumed its durable cursor. Pillars 1–4.
- *This pass (automated):* HLC monotonic under a stalled/backwards wall clock + receive-rule
  + legacy/new `Compare` (unit); LWW merge against the real `note` table — newer wins, stale
  no-op, delete tombstones, newer write resurrects, stale delete can't bury a live row
  (integration); cloud→node `tenant_profile` snapshot apply — newer wins, **redelivery is an
  inbox no-op**, out-of-order older loses (integration); license grace phase boundaries +
  zero-grace + empty-guard-locked (unit). `go build`/`vet`/`gofmt` clean; full integration
  suite (all 10 slices + sync/hlc/license) green. *(Fixed a latent test-harness flake:
  `testdb.NewTenant` slugged the UUIDv7 timestamp prefix, colliding within a millisecond —
  now uses the random tail.)*
**Deferred (infra/ops, not code):** mTLS + per-tenant NATS accounts; snapshot/replay
bootstrap + DR drill; local WAL archiving (pgBackRest). **License enforcement seam:** the
grace `Guard` is built + tested but not yet wired as a mutation-gate middleware (would need
the dev node seeded with a long-dated dev license first, else it self-locks) — the mechanism
is ready; flipping it on is a one-line gate + dev-license seed.

## Backend — `server/` (M7 Guardian Portal) — ✅ verified

A guardian is an actor + a portal, not a slice (docs/18). The portal owns no tables — it
is a child-scoped projection over students/academics/finance, the security boundary
enforced at the query layer (guardian_student) AND by RLS.

| Component | File(s) | Status |
|---|---|---|
| Migration: nullable `guardian.membership_id` (login → contact link) + partial unique | `db/migrations/00009_guardian_portal.sql` | ✅ applied |
| Seeded **Guardian** default role (guardian.* perms), auto-attached on promotion | `internal/platform/authz/catalog.go` | ✅ |
| Promote-guardian (`POST /students/guardians/{id}/promote`, `student.update`) → GUARDIAN login + Guardian role via the engine | `internal/features/students/students.go` | ✅ golden rule |
| `guardian` feature (no tables): resolve guardian_id → children, child attendance (reuses academics svc), child fees (reuses finance svc) | `internal/features/guardian/guardian.go` | ✅ |
| Node wiring | `cmd/node/main.go` | ✅ |
| Frontend: guardian dashboard (multi-child switcher) + child attendance + child fees | `web/src/features/guardians/` | ✅ |

**Live verification:** promoted guardian logs in with 4 guardian.* perms (not tenant.admin);
sees only their 1 linked child; own child fees (outstanding 3000) + attendance 200;
**foreign child → 403** (fees & attendance); non-guardian admin → 403; guardian → staff
`/students` 403.

### M7 Tier-2 guarded writes — ✅ verified

The "view dues → act" half of the portal (docs/18 Tier 2). Scoped per the earlier
decision: **simulated** online payment (no real gateway locally) + **minimal per-feature**
maker-checker (two small request tables, not a generic framework).

| Component | File(s) | Status |
|---|---|---|
| Migration: `leave_request` + `contact_change_request` (mutable status tables, RLS, base/sync cols) | `db/migrations/00012_guardian_t2.sql` | ✅ applied |
| `guardian.pay_fees` added to the seeded Guardian role | `internal/platform/authz/catalog.go` | ✅ |
| `PayFees` — simulated pay → reuses `finance.RecordPayment` (gapless receipt + CREDIT), gated by child link **AND `can_pay`** | `internal/features/guardian/guardian.go` | ✅ golden rule (via finance) |
| `RequestLeave` / `UpdateOwnContact` — PENDING request + outbox + audit in one tx; child-scoped / self-scoped | same | ✅ golden rule |
| Staff side: `PendingLeave`/`DecideLeave` (gated `attendance.mark`), `PendingContact`/`DecideContact` (gated `student.update`) — **approve applies** the contact change to the guardian record in the same tx | same | ✅ |
| OpenAPI: 4 new guardian ops (`payChildFees`/`requestChildLeave`/`listMyLeaveRequests`/`requestContactChange`) + regen TS client | `server/api/openapi/paths/guardian.yaml`, `web/src/shared/api/generated/` | ✅ |
| Frontend: PayFees / LeaveRequest / Contact pages rewired from scaffolds to the real generated mutations | `web/src/features/guardians/pages/` | ✅ |
| Integration tests (live PG) | `internal/features/guardian/t2_integration_test.go` | ✅ pass |

**Verification:** integration suite green — request_leave golden rule (1 outbox + 1 audit) +
foreign-child rejected on the **write** path; pay_fees writes one CREDIT and a non-paying
guardian is rejected by `can_pay`; contact-change **approve applies** the new phone to the
guardian record (maker-checker); a re-decision of a settled row is a no-op (`ErrNotFound`).
`go build`/`vet`/`gofmt` clean; web `tsc -b` + `vite build` clean; new routes live on the
node (401 gated, not 404).
### M7 Expo mobile — ✅ runnable read app

The read-heavy guardian app (docs/07 "mobile read-first"), built from scratch in `mobile/`.
**Expo SDK 51 + React Native + TypeScript**, React Navigation (native-stack), TanStack
Query, `expo-secure-store` for the session. It reuses the node's guardian read-API directly
(native apps skip the subdomain gateway, so the client names the tenant with the
`X-Tenant-Slug` header — the same header nginx injects on web).

| Component | File(s) | Status |
|---|---|---|
| HTTP seam (Bearer + `X-Tenant-Slug`; cross-tenant `login()`) | `mobile/src/api/client.ts` | ✅ |
| Typed guardian reads + react-query hooks (children/attendance/marks/fees/exams) | `mobile/src/api/guardian.ts` | ✅ |
| Persisted `{serverUrl, slug, token}` session (secure-store) + auth gate | `mobile/src/auth/AuthContext.tsx`, `navigation/` | ✅ |
| Screens: Login, Dashboard (multi-child switcher + summary), ChildAttendance/Marks/Fees | `mobile/src/screens/` | ✅ |
| Project config + README (per-target server URL guidance) | `mobile/{package.json,app.json,tsconfig.json,README.md}` | ✅ |

**Verification:** `npm install` (1150 pkgs) + `npx tsc --noEmit` **clean**; `expo config`
parses. *(Found & fixed: Expo pins TS 5.3, but react-query v5's public types use the
built-in `NoInfer` utility from TS ≥ 5.4 — without it `useQuery` degrades to `any`; bumped
to TS 5.6 + `moduleResolution: bundler` so the generic data types resolve.)* Launch with
`cd mobile && npm start` against a running node (`./ved.sh up`); sign in with a promoted
**guardian** credential + the school slug. **The full M7 is now complete.**

**Carried-forward:** Tier-2 writes on mobile (pay/leave/contact — endpoints exist, web uses
them); push notifications (docs/16); refresh-token rotation; child timetable read; staff
review-queue FE screens (decisions verified via API/tests); a real payment gateway behind
the same `pay` endpoint; an app icon/splash asset.

## Backend — `server/` (M8 LMS / learning) — ✅ verified — ROADMAP COMPLETE

The LMS is academics' growth (docs/19, docs/database/07-lms.md): content → submit → grade,
with grades feeding the ONE append-only marks ledger.

| Component | File(s) | Status |
|---|---|---|
| Migration: `assignment` + `material` (T3a); `submission`/`submission_file`/`grade` (append-only, T3b) + triggers; `mark_entry` gains nullable `exam_id` + `assignment_id` | `db/migrations/00010_lms.sql` | ✅ applied |
| academics: `teaching_assignment` create (anchor for LMS content) | `internal/features/academics/academics.go` | ✅ |
| `learning` slice: assignment/material authoring (academics.manage); student submit (self-service, LATE detection, append-only); grade (marks.enter, append-only) + assignment-sourced `mark_entry` in same tx; list submissions (latest per student + grade) | `internal/features/learning/learning.go` | ✅ |
| Node wiring | `cmd/node/main.go` | ✅ |
| Frontend: teacher Assignments (list/create) + Assignment detail (submissions + grading) | `web/src/features/learning/` | ✅ |

**Live verification:** assignment published; submit SUBMITTED → resubmit RESUBMITTED (2
rows kept, teacher sees latest-per-student); grade 72 → assignment-sourced mark_entry 72;
re-grade 85 → 2 grades + 2 mark_entries kept, effective 85; `UPDATE grade` / `DELETE
submission` rejected by trigger; student can't create/grade (403), non-student can't
submit (403).
**Carried-forward:** T3c (quizzes/discussion/completion), lesson plans, MinIO blob upload,
student + guardian LMS screens.

## Backend — `server/` (M9 Super-Admin Platform v2) — ✅ verified

The control-plane super-admin surface (docs/promts.md). Plain transactional writes
(control_plane has no tenant_id/RLS/sync); license mutations also emit a `cp_outbox` push so
the change can reach the owning node (docs/08). Analytics compute on-the-fly — no new tables.

| Component | File(s) | Status |
|---|---|---|
| Migration: `license` status SM (+auto_renew/cancel_at_period_end/cancelled_at/superseded_by, backfill from `revoked`); `payment_proof.clarification_note`; `plan_catalog.annual_price/status`; `school_registration.reminded_at` | `db/cpmigrations/00004_platform_v2.sql` | ✅ applied |
| Registration analytics + funnel + Send-Reminder | `internal/features/registration/platform_v2.go` | ✅ |
| Payment-proof clarification (INFO_REQUESTED + note → public poll) + verification analytics | same | ✅ |
| License lifecycle: suspend/resume (revoked mirror), cancel (immediate \| end-of-cycle), extend/change-plan (**re-sign** via `license.Sign`, supersede) + `cp_outbox` push | same | ✅ |
| Subscriptions analytics (MRR per-cycle-normalized, ARR, churn, trends, popularity) + plan CRUD (create/update/duplicate/archive) | same | ✅ |
| Tenant enrichment (plan+license+users+subscription join), suspend/resume cascade, billing history | same | ✅ |
| Composed dashboard endpoint | same | ✅ |
| Node wiring (`RegisterPlatformV2` mounted in the platform-gated group) | `cmd/controlplane/main.go` | ✅ |
| Integration tests (live PG): license suspend-mirror + extend re-sign-verifies + cp_outbox push; clarification flips status + public poll + settled no-op; plan archive hides from catalog; analytics aggregates (MRR×12=ARR, enriched tenant) | `internal/features/registration/platform_v2_integration_test.go` | ✅ pass |

**Frontend (`web/platform/`) — ✅ built.** Recharts chart kit (`web/src/shared/ui/charts.tsx`:
FunnelChart/TrendChart/BarSeries/DonutChart/DotChart on design tokens) + `+danger` Badge tone;
grouped sidebar (Dashboard · TENANTS · BILLING · INSIGHTS); new **Plans & Prices** page; and
rebuilt Dashboard/Registrations/PaymentProofs/Licenses/Subscriptions/Tenants pages wired to a
shared `platform/src/shared/platformApi.ts` hook surface. `tsc -b` + `vite build` +
`build:platform` clean.
**Carried-forward:** v2 endpoints use the SPA's manual `api.ts` client (matching the existing
platform pages) — promoting them into `controlplane.yaml` + the generated client is a doc
follow-up. **Deferred:** M10 dynamic onboarding template, M11 Login-As/magic-link/plan-
versioning/KYC/AutoPay, M12 Support tickets + AI chatbot.

## Backend — `server/` (M10 Dynamic onboarding template) — ✅ verified

A School Admin tailors the people-onboarding forms without a code change (docs/06,
docs/database/03-tenant-setup.md). Field-toggle model (not arbitrary columns): each
`field_key` maps to an existing OnboardInput field; config governs the form + required-ness.

| Component | File(s) | Status |
|---|---|---|
| Migration: `onboarding_field_config` + `dropdown_option` (tenant-scoped + RLS + sync cols) | `db/migrations/00013_onboarding_template.sql` | ✅ applied |
| Service + default catalog + seed (Get/Set template, list/upsert/delete dropdowns) — part of the `access` slice | `internal/features/access/tenantsetup.go` | ✅ golden rule per save |
| Endpoints: `GET /access/onboarding-template/{type}` (ungated; defaults fallback), `PUT` (tenant.settings); `GET/POST/DELETE /access/dropdowns` | `internal/features/access/access.go` | ✅ |
| Engine `MissingRequiredFields` + students/teachers/staff `Onboard` enforce visible+required | `internal/platform/onboarding/onboarding.go`, `internal/features/{students,teachers,staff}` | ✅ |
| Seed defaults at provisioning + dev boot (idempotent) | `internal/features/registration/registration.go`, `cmd/node/main.go` | ✅ |
| Integration tests (live PG): template seed+save golden rule + non-configurable rejected; engine required enforcement; dropdown upsert-in-place + RLS + soft-delete | `internal/features/access/tenantsetup_integration_test.go` | ✅ pass |

**Frontend (`web/`) — ✅ built.** Admin **Onboarding Forms** page (per-type visible/required/
label editor) + **Dynamic Dropdowns** page rewired to real CRUD (`features/admin/`); student/
teacher/staff onboard forms render from the template (hide non-visible, mark + client-validate
required, dropdown-backed selects). `tsc -b` + `vite build` clean.
**Carried-forward:** GUARDIAN onboarding template (no form yet); M9/M10 endpoints use the
manual API clients (OpenAPI promotion is a doc follow-up).

## Backend — `server/` (M11 Login-As/Magic-Link/Plan-Versioning/KYC/AutoPay) — 🟡 built, live-verify pending

The five deferred platform features (docs/promts.md), each a vertical slice. Control-plane
writes are plain transactional (no tenant_id/RLS/sync); tenant-plane writes follow the golden
rule. Cross-plane: Login-As mints a node token (shared `JWT_SECRET`), Magic-Link writes a
tenant-plane token at provisioning.

| Component | File(s) | Status |
|---|---|---|
| **A** KYC/Risk/Source: `school_registration` enrichment; risk auto-scored at register; superadmin KYC verify/reject + analytics | `db/cpmigrations/00006_registration_kyc.sql`, `internal/features/registration/{registration.go,platform_m11.go}` | ✅ built |
| **B** Login-As: tenant-consent flag + toggle (golden rule); `IssueImpersonation` + `imp` claim; `login-as` mints scoped 30-min token; `cp_audit_log` | `db/migrations/00014_superadmin_access.sql`, `db/cpmigrations/00007_cp_audit.sql`, `internal/platform/auth/jwt.go`, `internal/platform/httpx/auth.go`, `internal/features/access/tenantsetup.go`, `internal/features/registration/impersonation.go` | ✅ built |
| **C** Magic Link: one-time `activation_token` (+ `auth_activation` SECURITY DEFINER); minted at provisioning; node `POST /auth/activate` single-use | `db/migrations/00015_activation_token.sql`, `internal/platform/credential/credential.go`, `internal/features/identity/identity.go`, `internal/features/registration/registration.go` | ✅ built |
| **D** Plan versioning: `plan_version` chain + `subscription.plan_version_id` pin (grandfathering); version CRUD + per-version counts; catalog roll-forward; backfill + boot ensure | `db/cpmigrations/00008_plan_versions.sql`, `internal/features/registration/{plan_versions.go,platform_v2.go}` | ✅ built |
| **E** AutoPay: `subscription` autopay cols; toggle + adoption/failed/renewal analytics; on enriched tenant row | `db/cpmigrations/00009_autopay.sql`, `internal/features/registration/{autopay.go,platform_v2.go}` | ✅ built |
| Node wiring (`RegisterPlatformM11`/`Impersonation`/`PlanVersions`/`AutoPay`, `nodeTokens`, `EnsurePlanVersions`) | `cmd/controlplane/main.go` | ✅ |
| Integration tests (5): risk+KYC; consent-gated login-as token+audit; magic-link single-use; plan grandfathering; autopay analytics | `internal/features/registration/*_integration_test.go` | 🟡 written, **not yet run live** |

**Frontend (`web/platform/` + `web/`) — ✅ built & typecheck/build-clean.** Platform SPA wired
via the manual `platformApi.ts` hook surface: Registrations KYC/risk/source columns + KYC
verify + magic-link at approval; Tenants **Login As** + AutoPay toggle; Subscriptions AutoPay
cards; Plans version-history panel + new-version form. Tenant app: super-admin-access consent
toggle (`access/superadmin-access`) + public **/activate** page (magic-link + `#login-as=` hash
handoff). `tsc -b` + `vite build` + `build:platform` all EXIT 0.

**Verification status.** `go build`/`go vet -tags=integration`/`gofmt` clean module-wide; both
web apps typecheck + build clean. **DB-free `go test ./...` green**, incl. **2 new unit tests
that DO run** — `auth.IssueImpersonation` (token parses as a node token, carries the `imp`
claim, <1h expiry, no must-reset) and `credential.ActivationToken`/`HashToken` (hash=sha256(raw),
single-use-distinct). **NOT yet done:** the live integration run (`./ved.sh test`)
+ live HTTP smoke — blocked this session because port 5432 was held by an unrelated container
(`employee-tracker-db`), so the dev Postgres couldn't bind. **To close M11:** free 5432, run
`./ved.sh test ./internal/features/registration/... ./internal/features/identity/...` (expect
the 5 new tests green) + a live curl smoke (register→risk, set consent→login-as token,
activate→login, create plan version→grandfathered, toggle autopay).

## Frontend — `web/` (M0) — 🟡 architecture scaffolded

| Component | File(s) | Status |
|---|---|---|
| Toolchain | `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` | ✅ written |
| Entry + providers | `src/main.tsx`, `src/app/providers.tsx` | ✅ |
| Page-manifest contract | `src/shared/types/page.ts` | ✅ |
| Data-driven router + guards | `src/app/router.tsx`, `pages.ts`, `app/guards/*` | ✅ |
| Layouts | `app/layouts/{AppShell,AuthLayout}.tsx` | ✅ |
| Shared kernel | `shared/{api,auth,tenant,authz,ui,config,lib}` | ✅ |
| Design system (Premium SaaS Minimalism) | `shared/ui` tokens + kit + icons ([23](./docs/23-design-system.md)) | ✅ applied app-wide, typecheck clean |
| Auth (login) | `features/auth` | ✅ built (dev sign-in) |
| Notes demo (FE↔BE proof) | `features/notes` | ✅ built |
| Feature manifests (page plans) | 13 features + `platform` | ✅ written (103 pages planned) |
| Feature pages | all except auth/notes | ⬜ planned (render `PlannedPage`) |
| Control-plane app build | `web/platform` | 🟡 manifest only |
| Mobile (Expo) | `mobile/` | ⬜ placeholder dir |
| **Typecheck verified** | — | ✅ `npm install` + `tsc -b` clean. Run in browser (`./ved.sh up`) ⬜ |

### Frontend pages — build status by feature

All pages are scaffolded as `PageDef` manifests and browsable via `PlannedPage`.
Only `auth/login` and `notes` are built. Page inventory: [docs/22-frontend.md](./docs/22-frontend.md).

| Feature | Personas | Pages | Built |
|---|---|---|---|
| auth | PUBLIC | login, select-tenant, reset-password, no-access (+forgot planned) | ✅ (real JWT) |
| help | ALL | index + per-topic (`/help`, `/help/:slug`) + contextual `?` icons | ✅ |
| notes (demo) | ADMIN | retired at M3 | — (removed) |
| students | ADMIN/STAFF/STUDENT | roster, onboard, detail built; import/portal planned | 🟡 (roster + onboard + detail done) |
| teachers | ADMIN/STAFF/TEACHER | mgmt (roster/onboard/detail) done; portal planned | 🟡 (mgmt done) |
| staff | ADMIN/STAFF | mgmt (roster/onboard/detail) | ✅ (mgmt done) |
| onboarding | STAFF/ADMIN | wizard hub + approvals | ✅ (hub stepper links to students/teachers/staff onboard; approvals queue scaffold) |
| guardians | GUARDIAN | portal (dashboard + child attendance + fees done; marks/timetable/T2 planned) | 🟡 (T1 reads done) |
| academics | ADMIN | programs…timetable | 🟡 backend done (structure + append-only attendance/marks); FE planned |
| finance | ADMIN/STAFF | fees, ledger, audit | 🟡 backend done (append-only ledger); FE student-ledger done |
| access | ADMIN | roles, user-roles, designations, maker-checker | ✅ (roles + user-roles + designations WIRED; maker-checker designed scaffold) |
| admin | ADMIN | profile, academic-year, dropdowns, rooms, templates, holiday-calendar | ✅ (profile + academic-year READ live tenant_profile/academic_year; rest polished scaffolds) |
| communication | ADMIN | notices, notifications | ✅ (designed scaffolds, no backend) |
| reports | ADMIN | dashboards, exports, backup-restore | ✅ (dashboards KPI StatCards/sparklines; exports + backup-restore scaffolds, backup danger zone) |
| learning (LMS) | TEACHER/STUDENT/GUARDIAN | teacher assignments + grading done; student/guardian planned | 🟡 (teacher T3a/T3b done) |
| platform | SUPERADMIN | login + dashboard + registrations(approve/reject) + tenants + licenses built; subscriptions/analytics/support planned | 🟡 SPA core done (separate `web/platform` build) |

---

## Next steps (to finish M0 → start M1)

1. ~~**Backend build:** `go mod tidy && go build ./...`~~ ✅ done (`go.sum` generated).
2. ~~**Frontend install/typecheck:** `npm install && npm run typecheck`~~ ✅ done (tsc clean).
3. ~~**Run it:** `./ved.sh up`~~ ✅ API round-trip verified via curl. Browser smoke at
   http://localhost:5173 (sign in with a tenant id → Notes demo) still worth a look.
4. ~~**Harden RLS:** non-superuser `ved_app` role + pool `SET ROLE`~~ ✅ done & verified.
5. ~~**Begin M1:** replace the auth + tenant stubs with real `users`/`memberships` + JWT~~
   ✅ done & verified (argon2id login, JWT, memberships, RLS-authorised tenant, dev seed,
   FE login/tenant-picker/forced-reset).
6. ~~**Begin M2 (RBAC):** `roles`/`permissions`/`role_permissions`/`membership_roles`,
   code-defined permission catalog seeded at provisioning, real `requirePermission(...)`
   (the dev wildcard `['*']` in the FE auth provider flips to real perms here).~~ ✅ done
   & verified (catalog seed, default roles, `authz.Require`, FE real perms via
   `/me/permissions`).
7. ~~**Begin M3 (Onboarding + Students):** credential/email generator + onboarding,
   `student`/`guardian` tables, `student.onboard` in one tx, gated by
   `requirePermission("student.onboard")`. The `notes` demo slice retires here.~~ ✅ done
   & verified (credential generator, one-tx onboard, roster/onboard/detail screens, notes
   retired).
8. ~~**Begin M4 (Control Plane):** `cmd/controlplane` slices for school registration
   state machine, payment-proof, licensing, tenant provisioning (which calls the M2 RBAC
   bootstrap + M3 tenant_profile seed for real tenants).~~ ✅ backend done & verified
   (register→approve→provision→license + cross-plane handoff). **Remaining:** the platform
   SPA (`web/platform/`) + MinIO payment-proof upload + control-plane audit log.
8b. ~~**M5 (replicate):** clone the M3 shape for `teachers`/`staff`.~~ ✅ done & verified
   via a shared kernel **onboarding engine** (students refactored onto it too).
9b. ~~**Next:** `academics`/`finance` (append-only ledgers/marks/attendance).~~ ✅ done &
   verified — M5 complete (all four slices; DB-enforced append-only immutability).
10b. ~~**M6 (sync):** wire the outbox to NATS/JetStream.~~ ✅ core done & verified (relay →
   JetStream → idempotent durable hub + offline replay).
11b. ~~**M7** (Guardian Portal — child-scoped read API).~~ ✅ portal done & verified
   (promote + scoped reads + FE). Remaining M7: Expo mobile app + Tier-2 guarded writes.
12b. ~~**M8** (LMS — content → assignments → submission/grading).~~ ✅ done & verified.
   **The phased roadmap M0→M8 is COMPLETE.**
13b. **Post-roadmap polish (no roadmap milestone left):** ~~platform SPA~~ ✅ done;
   remaining — academics setup + student/guardian FE; LMS T3c (quizzes/discussion) + MinIO
   blob upload; Tier-2 guardian writes; M6 hardening (HLC-merge for mutable rows, mTLS,
   cloud→node push-down, DR drill); OpenAPI spec files + automated DB-integration tests.
9. **DoD backfill:** frozen OpenAPI spec files (`/auth/*`, `/access/*`, `/students/*`) +
   automated DB integration tests (RLS isolation, golden-rule atomicity); Redis cache for
   effective permissions; document upload (MinIO) + onboarding wizard/approval states.

## Definition of done per slice

See the checklist in [docs/plan/README.md](./docs/plan/README.md) (migration+RLS →
sqlc → service+outbox+audit → handler+rbac → OpenAPI → TS client → React → tests).
