# 26 — School Setup Journey (registration → people → running the school)

How a brand-new school goes from "just approved" to "fully operational", **in the order
the data dependencies require it**. This is both the human runbook *and* the spec for the
**guided setup checklist** on the admin dashboard (with skip-warnings) and the **sidebar
taxonomy**.

> The one rule that drives the ordering: **you can't reference a thing that doesn't exist
> yet.** You can't assign a class to a teacher before the teacher exists; you can't enroll a
> student into a section before the section exists; you can't raise an invoice before a fee
> structure exists. So setup is a dependency chain, not a free-for-all.

---

## 0. Before the school exists — registration (control plane)

Handled entirely on the platform side ([24](./24-login-and-registration.md)): the school
self-registers, pays, the superadmin approves, and provisioning creates the **tenant + first
admin** (+ default roles + a current academic year stub). The admin signs in at the tenant
app and everything below begins. Nothing in this doc happens until there is a School Admin.

---

## 1. The dependency chain (the canonical order)

```
            ┌─────────────────────────────────────────────────────────────┐
            │ STEP                         DEPENDS ON (must be done first)  │
            ├─────────────────────────────────────────────────────────────┤
  setup  →  │ 1. Academic year & terms     —                               │
            │ 2. Programs & stages         academic year                   │
            │ 3. Sections                  programs & stages               │
            │ 4. Subjects                  programs & stages               │
  people →  │ 5. Teachers                  —  (can run in parallel w/ 2–4)  │
            │ 6. Teaching assignments      teachers + sections + subjects   │
            │ 7. Students (enroll)         sections                         │
  money  →  │ 8. Fee heads & structures    academic year                   │
            │ 9. Invoices / collection     fee structures + students        │
            └─────────────────────────────────────────────────────────────┘
```

The worked example the whole feature is built around:

> **"If the teacher isn't created, who takes the class?"** Teaching assignments bind a
> *teacher* to a *(section, subject)*. So **teachers must exist before you assign classes**.
> If an admin opens *Teaching assignments* with no teachers (or no sections/subjects) yet,
> the page shows a **warning** that names the missing prerequisite and links straight to it —
> instead of presenting an empty, un-fillable form.

### Step by step

| # | Step | Where | Done when | Blocked until | Why the order |
|---|------|-------|-----------|---------------|---------------|
| 1 | **Academic year & terms** | Setup → Academic Year | a *current* academic year exists | — | Anchors fees, exams, promotion, attendance. Nothing is dated without it. |
| 2 | **Programs & stages** | Academics → Programs | ≥1 program | academic year | The "shelves" — grades/sections (school) or programs/semesters (college). |
| 3 | **Sections** | Academics → Sections | ≥1 section | programs & stages | A student enrolls *into a section*; a class is taught *to a section*. |
| 4 | **Subjects** | Academics → Subjects | ≥1 subject | programs & stages | A teaching assignment needs a subject. |
| 5 | **Teachers** | People → Teachers | ≥1 teacher | — (parallel with 2–4) | Someone has to take the class. Onboard before assigning. |
| 6 | **Teaching assignments** | Academics → Teaching Assignments | ≥1 assignment | **teachers + sections + subjects** | Binds teacher × section × subject — the anchor every timetable/LMS row hangs off. |
| 7 | **Students** | People → Students | ≥1 student | sections (to enroll) | Enrollment puts a student into a section that already exists. |
| 8 | **Fee heads & structures** | Finance → Fee Heads / Structures | ≥1 fee head | academic year | Defines what is charged before you charge it. |
| 9 | **Invoices & collection** | Finance → Invoices / Collection | first receipt issued | fee structures + students | Bill the enrolled students against the defined fees. |

Guardians are **not** a separate setup step — they're captured as a contact when a student is
onboarded, and *promoted* to a portal login later on demand ([24 §2](./24-login-and-registration.md)).

---

## 2. The guided checklist (admin dashboard)

The admin dashboard shows a **Setup checklist** — the steps above, in order, each with a live
status computed from real per-tenant data (counts via the existing list endpoints, RLS-scoped):

- **✅ Done** — the step's data exists (e.g. ≥1 teacher).
- **➜ Next / available** — prerequisites met, not yet done; primary call-to-action.
- **🔒 Blocked** — a prerequisite is missing; the row is locked and names what to do first.

The checklist also shows **overall progress** (done / total) so an admin always knows what's
left. It is gated to admins (`tenant.settings`) and disappears once every step is complete.

### Skip-warnings on the dependent pages

The checklist is guidance; nothing forces an order. But if an admin **jumps ahead** — opens a
page whose prerequisites aren't met — that page renders a **warning banner** at the top
(`SetupGate`) that:

1. States plainly what's missing ("No teachers yet — create a teacher before assigning classes").
2. Links directly to the prerequisite step.
3. Does **not** hard-block (the admin may have a reason) — it warns, it doesn't lock the door.

Pages that carry a `SetupGate`:

| Page | Warns when | Sends you to |
|------|-----------|--------------|
| Teaching assignments | no teachers **/** no sections **/** no subjects | Teachers / Sections / Subjects |
| Sections | no programs | Programs |
| Enrollment | no sections | Sections |

(Finance gating — Invoices / Collection requiring a fee structure — is a fast follow-up; it
needs a fee-structure presence check beyond the fee-heads count the hook tracks today.)

---

## 3. Sidebar taxonomy (proper classification)

The admin sidebar is regrouped from "one giant ADMIN list" into **functional sections, ordered
to mirror the setup journey** so the nav itself teaches the order:

1. **Overview** — Dashboard
2. **Setup** — Profile & branding · Academic year & terms · Holiday calendar · Dropdowns ·
   Onboarding forms · Rooms · Document & number templates
3. **People** — Onboarding hub · Students · Guardians · Teachers · Staff
4. **Academics** — Programs · Stages · Subjects · Curriculum · Sections · Enrollment ·
   Teaching assignments · Timetable · Attendance · Exams · Marks
5. **Finance** — Fee heads · Fee structures · Fee schedules · Invoices · Concessions · Fines ·
   Student ledger · Financial audit trail
6. **Communication** — Notices · Notifications
7. **Access & Roles** — Roles · Designations · Assign roles · Maker-checker · Super-admin access
8. **Reports** — Dashboards · Exports · Backup & restore
9. **Support** — Support

The persona portals (Teacher / Student / Guardian) keep their own focused, single-group nav —
they don't need the admin taxonomy.

---

## Cross-references
- Registration & first admin — [24](./24-login-and-registration.md)
- Onboarding people & credentials — [06](./06-onboarding-credentials.md)
- Academic structure (programs → stages → sections) — [17](./17-academics-model.md)
- Finance (fee heads → structures → invoices) — [10](./10-finance-payments.md)
- Feature catalog & MVP line — [09](./09-feature-catalog.md)
