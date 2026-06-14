# Database — Academics

The academic backbone: *what* is taught (`program → program_stage → curriculum`),
*who* sits *where* (`section`, `enrollment`), and *who* teaches *what* to *whom*
(`teaching_assignment`). Attendance and marks hang off this structure. This is the
schema for the model described in [17](../17-academics-model.md); it keys off the
calendar and rooms in [03](./03-tenant-setup.md) and the people in
[04](./04-people.md).

All tables are **tenant-scoped**: they carry the base columns + RLS from
[00-conventions.md](./00-conventions.md) (not repeated here) — only slice-specific
columns are shown. `attendance_event` and `mark_entry` are **(append-only)** ledgers
([00](./00-conventions.md), [08](./08-offline-sync.md)): no `updated_at`/`deleted_at`,
corrections are new rows, and counts/percentages are **summed, never stored**.

Legend: `col?` nullable · `col ∈ {A, B}` `TEXT`+`CHECK` · `→ table` FK ·
**(append-only)** ledger table.

## Structure (defined once, reused every academic year)

The pivot is `program_stage` — curriculum hangs off the **stage**, not the program.
A school grade and a college semester are the same thing here.

### `program`

```sql
name             TEXT NOT NULL,
code             TEXT NOT NULL,
enrollment_mode  TEXT NOT NULL,    -- ∈ {SECTION_BASED, COURSE_BASED}
status           TEXT NOT NULL    -- ∈ {ACTIVE, ARCHIVED, ...}
-- UNIQUE (tenant_id, code)
```

- `enrollment_mode` is the school/college fork. **Tier-1 (MVP) is `SECTION_BASED`
  only**; `COURSE_BASED` is a documented future mode (see below).

### `program_stage`

```sql
program_id  UUID NOT NULL → program,
name        TEXT NOT NULL,    -- "Class 10", "Semester 3"
ordinal     INT  NOT NULL    -- ordered stage within the program
-- UNIQUE (tenant_id, program_id, ordinal)
-- composite FK carries tenant_id (no cross-tenant program link)
```

- A single-stage program is valid (a school grade-as-program). The curriculum and
  sections attach to the stage.

### `subject`

```sql
name     TEXT NOT NULL,
code     TEXT NOT NULL,
credits  INT?,             -- college courses; NULL for plain school subjects
kind     TEXT NOT NULL    -- ∈ {THEORY, LAB, ...}
-- UNIQUE (tenant_id, code)
```

- The tenant catalog of teachable subjects ("courses" in college). Co-owned with the
  teachers slice for a teacher's taught-subjects view ([17](../17-academics-model.md)).

### `curriculum`

```sql
program_stage_id  UUID NOT NULL → program_stage,
subject_id        UUID NOT NULL → subject,
requirement       TEXT NOT NULL    -- ∈ {MANDATORY, ELECTIVE}
-- UNIQUE (tenant_id, program_stage_id, subject_id)
-- composite FKs carry tenant_id
```

- **THE curriculum:** which subjects a stage teaches. In `SECTION_BASED`, everyone in
  a section takes every `MANDATORY` subject of the stage; `requirement = ELECTIVE`
  exists in the schema but is not yet a runtime path (see scope below).

## Per academic year (the live offering)

`academic_year`, `term`, and `room` live in [03](./03-tenant-setup.md);
`student` and `teacher` live in [04](./04-people.md).

### `section`

```sql
program_stage_id  UUID NOT NULL → program_stage,
academic_year_id  UUID NOT NULL → academic_year ([03]),
name              TEXT NOT NULL,    -- "A", "B"
room_id           UUID?  → room ([03]),       -- home room
class_teacher_id  UUID?  → teacher ([04]),    -- homeroom / mentor
capacity          INT?
-- UNIQUE (tenant_id, academic_year_id, program_stage_id, name)
-- composite FKs carry tenant_id
```

### `enrollment`

```sql
student_id        UUID NOT NULL → student ([04]),
section_id        UUID NOT NULL → section,
academic_year_id  UUID NOT NULL → academic_year ([03]),
roll_no           TEXT?,
status            TEXT NOT NULL,    -- ∈ {ACTIVE, TRANSFERRED, WITHDRAWN, PROMOTED}
enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT now()
-- UNIQUE (tenant_id, section_id, student_id, academic_year_id)
-- partial unique: at most one ACTIVE enrollment per (student, academic_year)
```

- A student belongs to a program/stage **through their `enrollment`** — there is no
  duplicated `student.program_id`. Year-end promotion **inserts** new `enrollment`
  rows in the next stage and closes the old ones via `status`, never edits them
  ([17](../17-academics-model.md)).

### `teaching_assignment`

```sql
section_id        UUID NOT NULL → section,
subject_id        UUID NOT NULL → subject,
teacher_id        UUID NOT NULL → teacher ([04]),
academic_year_id  UUID NOT NULL → academic_year ([03]),
role              TEXT NOT NULL    -- ∈ {PRIMARY, CO_TEACHER}
-- UNIQUE (tenant_id, section_id, subject_id, teacher_id)
-- composite FKs carry tenant_id
```

- WHO teaches WHAT to WHICH section — the bridge across the three axes.

## Attendance (append-only)

### `attendance_event` **(append-only)**

```sql
-- ledger: created_at/created_by only; NO updated_at/deleted_at
enrollment_id  UUID? → enrollment,    -- the student-in-section, OR…
student_id     UUID? → student ([04]),  -- …(student_id, section_id) when no enrollment row
section_id     UUID? → section,
date           DATE NOT NULL,
status         TEXT NOT NULL,    -- ∈ {PRESENT, ABSENT, LATE, EXCUSED}
marked_by      UUID NOT NULL → teacher ([04])    -- WHO marked it
-- index (tenant_id, enrollment_id, date)
```

- **Append-only**: a correction (wrong status, re-mark) inserts a **new** row; the
  latest event by `hlc` for a `(enrollment, date)` wins. Attendance counts and
  percentages are **summed from these rows on read, never stored**
  ([08](./08-offline-sync.md)).

## Exams & marks

### `exam`

```sql
academic_year_id  UUID NOT NULL → academic_year ([03]),
term_id           UUID? → term ([03]),
name              TEXT NOT NULL,    -- "Mid-Term", "Final"
max_marks         NUMERIC NOT NULL,    -- max-marks scheme for the exam
-- UNIQUE (tenant_id, academic_year_id, name)
```

### `mark_entry` **(append-only)**

```sql
-- ledger: created_at/created_by only; NO updated_at/deleted_at
exam_id        UUID NOT NULL → exam,
enrollment_id  UUID? → enrollment,    -- OR student_id when no enrollment row
student_id     UUID? → student ([04]),
subject_id     UUID NOT NULL → subject,
marks          NUMERIC NOT NULL,
graded_by      UUID NOT NULL → teacher ([04])    -- WHO graded it
-- index (tenant_id, exam_id, enrollment_id, subject_id)
```

- **Append-only**: a re-grade inserts a **new** row referencing the same
  `(exam, enrollment, subject)`; the latest by `hlc` is the effective mark. Totals,
  averages and ranks are **derived by summing**, never overwritten
  ([08](./08-offline-sync.md)).

## Timetable *(T2)*

### `timetable_slot` *(T2)*

```sql
section_id   UUID NOT NULL → section,
subject_id   UUID NOT NULL → subject,
teacher_id   UUID NOT NULL → teacher ([04]),
room_id      UUID? → room ([03]),
day_of_week  INT  NOT NULL,    -- 0=Sun … 6=Sat
period       INT  NOT NULL,
start_time   TIME NOT NULL,
end_time     TIME NOT NULL
-- UNIQUE (tenant_id, section_id, day_of_week, period)
```

- Places each `(section, subject, teacher)` from `teaching_assignment` into periods +
  rooms ([17](../17-academics-model.md), step 7).

## The staffing-completeness rule (derived)

> A section is **fully staffed** when every `curriculum` subject of its
> `program_stage` has a matching `teaching_assignment` for that section.

This is *derived* from the model — not a stored flag. Unfilled subjects surface as a
setup-dashboard warning ("Subject X in 10-A has no teacher"):

```sql
-- missing teaching assignments for a section
SELECT c.subject_id
FROM   curriculum c
JOIN   section s ON s.program_stage_id = c.program_stage_id
WHERE  s.id = :section_id
  AND  c.requirement = 'MANDATORY'
  AND  NOT EXISTS (
         SELECT 1 FROM teaching_assignment ta
         WHERE  ta.section_id = s.id
           AND  ta.subject_id = c.subject_id);
```

## Future: `COURSE_BASED` mode *(fast-follow, not built)*

`SECTION_BASED` is the MVP. Credit-system colleges flip `program.enrollment_mode` to
`COURSE_BASED`, which is **additive** — these tables join later, alongside credit
totals, prerequisites, a registration window, and capacity enforcement
([17](../17-academics-model.md)):

```sql
course_offering  (program_stage_id → program_stage, subject_id → subject,
                  academic_year_id → academic_year ([03]), teacher_id? → teacher ([04]),
                  capacity)        -- a course taught in a term
student_course   (student_id → student ([04]), course_offering_id → course_offering,
                  academic_year_id → academic_year ([03]), status)    -- elected courses
```

Until then `COURSE_BASED` is a documented future mode, not a runtime path.

## Cross-slice links

- **Tenant setup** — `academic_year`, `term`, `room` live in [03](./03-tenant-setup.md).
- **People** — `student`, `teacher` live in [04](./04-people.md).
- **Finance** — `fee_structure.applies_to` keys off class/section; sections are what
  fee structures attach to ([10](./10-finance-payments.md)).
- **Offline & sync** — attendance and marks are append-only ledgers
  ([08](./08-offline-sync.md)).
