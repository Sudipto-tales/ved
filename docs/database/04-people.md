# Database — People (Students, Guardians, Teachers, Staff)

The human records of a school: the students who study, the guardians who pay and
watch, the teachers who teach, and the staff who run the place. This slice covers the
`students`, `teachers`, and `staff` vertical slices ([04](../04-vertical-slicing.md)),
which all share one shape.

> **These are PROFILE tables, not identity.** Who can log in (`users`), which tenant
> they belong to (`memberships`), and what they may do (`roles`, `membership_roles`)
> all live in [02](./02-identity-access.md) and are **not** repeated here. Each profile
> below links to a `membership_id` and carries only the domain-specific columns of that
> person type. Roles and login handles are never duplicated onto a profile.

Legend (see [00-conventions.md](./00-conventions.md)): `col?` nullable · `col ∈ {A,B}`
TEXT+CHECK enum · `→ table` foreign key. Every table is tenant-scoped and carries the
base columns + RLS block from [00](./00-conventions.md); only domain columns are shown.

---

## The shared pattern: identity + profile + onboarding

`students`, `teachers`, and `staff` are deliberately the same shape so we build the
generic machinery once ([04](../04-vertical-slicing.md)):

- **Identity** — a `users` row + a `membership` (with `user_type` and roles) in
  [02](./02-identity-access.md). Created by the credential generator, never self-signup.
- **Profile** — exactly one domain table here (`student` / `teacher` / `employee`),
  linked 1:1 to that membership via `membership_id`. This is where admission numbers,
  qualifications, and departments live — the parts the generic identity layer doesn't
  know about.
- **Onboarding** — one configurable workflow engine ([06](../06-onboarding-credentials.md))
  drives `DRAFT → IN_PROGRESS → PENDING_APPROVAL → ACTIVE`, collecting profile fields,
  guardians, prior records, and documents, then issuing credentials. The membership and
  profile rows are written as the wizard (or the skip-path direct form) completes.

`membership_id` is the join key throughout: one membership ⇒ one profile row of the
matching `user_type`. Because the membership already carries `tenant_id`, these tables
never re-derive a person's roles or login.

---

## `student`

The admission record. Its placement into a class/section is **not** here — enrollment
into a `section` lives in academics ([05](./05-academics.md), `enrollment`). A student
belongs to a program/stage transitively through that enrollment, so there is no
`section_id` or `program_id` on this table.

```sql
student
  membership_id   → memberships         -- the identity (user_type = STUDENT)
  admission_no    TEXT NOT NULL          -- school-assigned; UNIQUE (tenant_id, admission_no)
  dob             DATE
  gender          ∈ {MALE, FEMALE, OTHER, UNDISCLOSED}
  category        TEXT                   -- reservation/social category; a dropdown_option ([03])
  blood_group?    ∈ {A_POS, A_NEG, B_POS, ..., O_NEG}
  address         JSONB                  -- line1/line2/city/state/postal/country
  prior_school?   TEXT                   -- last institution attended
  prior_class?    TEXT                   -- last grade/stage completed
  prior_marks?    JSONB                  -- transferred prior-record summary

UNIQUE (tenant_id, admission_no)
```

> Enrollment, roll number, section, and academic-year placement are owned by academics
> ([05](./05-academics.md)). Keeping them out of `student` lets a student be promoted
> year to year (new `enrollment` rows) without ever editing the admission record.

---

## `guardian`

A parent or guardian. A guardian **may exist without a login** — a contact-only record
captured during admission. Promoting them to a portal user just creates a `membership`
with `user_type = GUARDIAN` ([02](./02-identity-access.md), [18](../18-guardian-portal.md));
the guardian record itself is unchanged. There is **no** `membership_id` column here
because a guardian frequently has no membership at all.

```sql
guardian
  name             TEXT NOT NULL
  relation_default ∈ {FATHER, MOTHER, GUARDIAN, ...}  -- default relation when linking children
  phone            TEXT NOT NULL         -- the real channel; OTP login path ([18])
  email?           TEXT                  -- optional real inbox
  occupation?      TEXT
  address          JSONB
```

> The optional login is what [18](../18-guardian-portal.md) calls "guardian identity."
> A guardian's real `phone`/`email` here are *contact* fields; if promoted, the login
> identity (handle, password) lives on `users`, not duplicated onto this profile.

---

## `guardian_student`

The many-to-many link between guardians and students — and the **scoping boundary** the
entire guardian portal hangs on. One guardian can have several children; one student can
have several guardians.

```sql
guardian_student
  guardian_id  → guardian
  student_id   → student
  relation     ∈ {FATHER, MOTHER, GUARDIAN, GRANDPARENT, SIBLING, OTHER}
  is_primary   BOOLEAN NOT NULL DEFAULT false  -- primary contact for THIS child
  can_pay      BOOLEAN NOT NULL DEFAULT false  -- may this guardian transact fees?

UNIQUE (tenant_id, guardian_id, student_id)
```

> **Guardian scoping rule** ([18](../18-guardian-portal.md)): a logged-in guardian
> resolves to their `guardian_id`; the set of students they may read or act on is
> exactly the `guardian_student` rows for that guardian — nothing else. Enforced at the
> query layer **and** backed by RLS as defence-in-depth, the same as tenant isolation.
> Fee actions additionally require `can_pay` on the link row, so a non-paying relative
> can view dues ([06](./06-finance.md)) but not pay them.

---

## `teacher`

The teaching-staff profile. The subjects and sections a teacher actually teaches are
**not** here — they are `teaching_assignment` rows (teacher × subject × section) in
academics ([05](./05-academics.md)). A teacher's homeroom is the `section.class_teacher_id`
there. This table holds only the HR-style profile.

```sql
teacher
  membership_id   → memberships         -- the identity (user_type = TEACHER)
  qualifications  JSONB                  -- degrees/certifications list
  joining_date    DATE
  employee_code?  TEXT                   -- HR code; UNIQUE (tenant_id, employee_code) when set
  specialization? TEXT

UNIQUE (tenant_id, employee_code)        -- partial: WHERE employee_code IS NOT NULL
```

> Taught-subjects view = join `teaching_assignment` ([05](./05-academics.md)); do not
> store a subject list here. The `subject` catalog is co-owned with `teachers` for that
> view, but the data lives in academics.

---

## `employee`

The non-teaching staff and authority profile — accountants, clerks, the principal, the
school admin. Same membership-linked shape as `teacher`; the distinction is `user_type`
on the membership and the role set, not a separate identity model.

```sql
employee
  membership_id  → memberships          -- the identity (user_type = EMPLOYEE)
  department     TEXT                    -- "Accounts", "Administration"; a dropdown_option ([03])
  designation    TEXT                    -- display title shown on screens
  joining_date   DATE
  employee_code? TEXT

UNIQUE (tenant_id, employee_code)         -- partial: WHERE employee_code IS NOT NULL
```

> `designation` here is the **display** title. The permission-bearing designation /
> role assignment lives on the membership ([02](./02-identity-access.md)); this string
> is for the org chart and printed cards, not for authorization.

---

## `person_document`

Documents attached to any person — admission certificates, ID proofs, teacher degrees,
guardian KYC. Polymorphic by `(owner_type, owner_id)` rather than a column per type, so
one upload/verify flow ([06](../06-onboarding-credentials.md)) serves every people slice.

```sql
person_document
  owner_type   ∈ {STUDENT, TEACHER, EMPLOYEE, GUARDIAN}
  owner_id     UUID NOT NULL            -- id of the matching profile/guardian row (same tenant)
  kind         TEXT NOT NULL            -- "BIRTH_CERT", "ID_PROOF", "DEGREE", "PHOTO", ...
  storage_key  TEXT NOT NULL            -- object-store key; the blob lives in storage, not the DB
  verified     BOOLEAN NOT NULL DEFAULT false  -- set by a reviewer during onboarding
  verified_by? → memberships            -- who verified
  verified_at? TIMESTAMPTZ
```

> `owner_id` is a soft polymorphic reference (no single FK target), so cross-tenant
> integrity is enforced by `tenant_id` + the application layer rather than a DB foreign
> key. The file itself never sits in Postgres — only its `storage_key`.

---

## Cross-slice summary

| This slice owns | Lives elsewhere |
|---|---|
| Admission record, guardians, HR profiles, documents | Login, membership, roles → [02](./02-identity-access.md) |
| Guardian ↔ student links (`guardian_student`) | Class/section enrollment → [05](./05-academics.md) (`enrollment`) |
| Teacher/employee profile fields | Subjects taught (`teaching_assignment`) → [05](./05-academics.md) |
| `category`/`department` *values* referenced | Dropdown option lists → [03](./03-tenant-setup.md) |
| Per-student profile | Fee ledger & dues → [06](./06-finance.md) |
