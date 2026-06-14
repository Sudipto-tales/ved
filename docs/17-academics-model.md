# 17 — Academic Structure (Programs, Classes, Sections, Subjects)

This doc defines how the school's academic backbone is modelled: what is taught,
who sits where, and who teaches whom. It is the structure that
[finance](./10-finance-payments.md) (fees key off section/class), attendance, and
exams/marks all hang from.

VED targets **schools *and* colleges / higher-ed**, so the model is built to
collapse to a simple school and expand to a multi-year college **without two
codebases** — the difference is one config flag and a deeper-but-optional hierarchy.

## The one idea: three axes that meet at one bridge

Most academic-system confusion comes from collapsing everything into a single
"class" table. Keep three concerns separate and the rest falls out:

- **Curriculum axis — *what* is taught:** `program → program_stage → subjects`
- **Grouping axis — *who* sits *where*:** `section → room`, students enrolled into sections
- **The bridge — *who* teaches *what* to *whom*:** `teacher × subject × section`

```
STRUCTURE (defined once, reused every year)
  program            B.Sc Computer Science   │  Secondary (CBSE)
    program_stage    Semester 1..6 (ordered) │  Class 9, 10, 11 (ordered)
      curriculum     courses of that stage   │  subjects of that grade
                     (+ credits, elective)   │

PER ACADEMIC YEAR (the live offering)
  section            CS-Sem3-A  + room + class teacher
    enrollment       student placed into the section
  teaching_assignment  teacher × subject × section
```

The pivot is **`program_stage`** — the curriculum hangs off the stage, not the
program. A school grade and a college semester are the same thing here.

## School ↔ College mapping (one model, two shapes)

| Concept | School | College |
|---|---|---|
| `program` | "Secondary (CBSE)" *(or a stream)* | "B.Sc Computer Science" |
| `program_stage` | Class 9 / 10 / 11 *(grade)* | Semester 1…6 *(or Year 1…3)* |
| `subject` *(= "course" in college)* | Math, English | CS301 Data Structures *(with credits)* |
| `curriculum` (stage ─< subject) | 8 subjects of Class 10 | 5 courses of Semester 3 |
| `section` | 10-A | CS-Sem3-A *(batch)* |
| `room` | classroom | classroom / lab |
| `enrollment` | student → 10-A | student → section |
| `teaching_assignment` | teacher × subject × 10-A | teacher × course × section |

**The school collapse:** a school creates one `program` whose `program_stage`s are
its grades. If an admin thinks purely in grades, the UI hides "program" and shows
stages directly — no empty layers, no college jargon on a school's screens.

## Domain model

### Structure (defined once, reused every academic year)

```
program        (id UUIDv7, tenant_id, name, code,
                enrollment_mode ∈ {SECTION_BASED, COURSE_BASED},  -- see scope below
                status)
program_stage  (id, tenant_id, program_id, name, ordinal)
                -- ordered stage within a program: grade / year / semester
                -- a single-stage program is fine (a school grade-as-program)
subject        (id, tenant_id, name, code, credits?, kind ∈ {THEORY, LAB, ...})
                -- tenant catalog of teachable subjects ("courses" in college)
curriculum     (id, tenant_id, program_stage_id, subject_id,
                requirement ∈ {MANDATORY, ELECTIVE})
                -- THE curriculum: which subjects a stage teaches
room           (id, tenant_id, name, building, capacity, type ∈ {CLASSROOM, LAB, ...})
```

### Per academic year (the live offering)

```
section             (id UUIDv7, tenant_id, program_stage_id, academic_year_id,
                     name,                 -- "A", "B"
                     room_id?,             -- home room
                     class_teacher_id?,    -- homeroom / mentor teacher
                     capacity)
enrollment          (id UUIDv7, tenant_id, student_id, section_id, academic_year_id,
                     roll_no,
                     status ∈ {ACTIVE, TRANSFERRED, WITHDRAWN, PROMOTED},
                     enrolled_at)
                     -- a student in a section is, transitively, in the
                     -- program_stage and its program for that year
teaching_assignment (id UUIDv7, tenant_id, section_id, subject_id, teacher_id,
                     academic_year_id, role ∈ {PRIMARY, CO_TEACHER})
                     -- WHO teaches WHAT to WHICH section
```

A student belongs to a program/stage **through their `enrollment`** — there is no
duplicated `student.program_id`. Outstanding-style derived facts are computed, not
stored, mirroring the [finance](./10-finance-payments.md) ledger discipline.

## The setup flow (exactly the lifecycle)

1. **Define subjects** — build the tenant's subject catalog.
2. **Create a program and its stages** — e.g. program "Secondary", stages Class 9/10/11.
3. **Attach subjects to each stage** → `curriculum` rows. *This is the curriculum.*
4. **Create sections** for the academic year (10-A, 10-B), each with a **room** and a
   **class teacher**.
5. **Enroll students** into a section → they are now in that stage/program, studying
   its curriculum.
6. **Assign teachers** → for each `(section, subject)` a `teaching_assignment`.
7. **Timetable** ([feature catalog](./09-feature-catalog.md), T2) later places each
   `(section, subject, teacher)` into time periods + rooms.

## The staffing completeness rule

> A section is **fully staffed** when every `curriculum` subject of its
> `program_stage` has a matching `teaching_assignment` for that section.

Unfilled curriculum subjects = "Subject X in 10-A has no teacher" → a setup-dashboard
warning. It is *derived* from the model, not a manual checklist.

## Enrollment mode — the school/college fork

The hierarchy above supports both institutions on day one. The behavioural
difference is a single flag on `program`:

| Mode | Used by | How enrollment works |
|---|---|---|
| **`SECTION_BASED`** | Schools, cohort colleges | Student enrolls into a **section** and takes *all* the stage's curriculum subjects with that cohort. Curriculum is a fixed list. |
| **`COURSE_BASED`** | Credit-system colleges | Student registers for **individual course-offerings** up to required credits; electives are chosen. "Section" becomes per-course. |

### Scope decision

**Tier-1 (MVP) = `SECTION_BASED` only.** Everyone in a section takes every subject
in the stage's curriculum. `enrollment_mode` and the `requirement`/`credits` columns
exist in the schema from the start so the upgrade is additive, but the elective /
credit-registration machinery is **not** built yet.

**Fast-follow = `COURSE_BASED`**, which adds:

```
course_offering  (id, tenant_id, program_stage_id, subject_id, academic_year_id,
                  teacher_id?, capacity)        -- a course taught in a term
student_course   (id, tenant_id, student_id, course_offering_id, academic_year_id,
                  status)                        -- a student's elected courses
```

plus credit totals, prerequisites, a registration window, and capacity enforcement.
Until then, `COURSE_BASED` is a documented future mode, not a runtime path.

## Cross-slice links

- **Finance** — `fee_structure.applies_to` keys off class/section/category
  ([10](./10-finance-payments.md)); sections are what fee structures attach to.
- **Attendance & exams** — attendance and marks are recorded per
  `(enrollment / section, subject)` and are **append-only** ([08](./08-offline-sync.md)).
- **Promotion / transfer** — a year-end promotion creates new `enrollment` rows in
  the next stage; old enrollments are closed (status), never edited.
- **Slice ownership** — all of the above lives in the `academics` slice
  ([04](./04-vertical-slicing.md)); `subject` co-owned with `teachers` for a
  teacher's taught-subjects view.
