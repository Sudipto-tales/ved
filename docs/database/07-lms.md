# Database — LMS (learning slice, T3)

The LMS is the staged growth of academics from *recording* learning into *delivering*
it. Per [19](../19-lms.md) it ships in three tiers: **T3a** content + assignments live
inside `academics`; at **T3b** the submission + grading loop forms its own bounded
context and a dedicated `learning` slice splits out ([04](../04-vertical-slicing.md)).
This file transcribes the [19](../19-lms.md) sketches into the conventions format
([00](./00-conventions.md)).

Everything anchors on **`teaching_assignment`** ([17](../17-academics-model.md),
[05](./05-academics.md)) — the `teacher × subject × section` bridge. Scoping content
and assignments to a `teaching_assignment_id` automatically binds them to the right
teacher, subject, and section for the academic year; no LMS row re-derives that
structure. The other anchor is `student` (via `enrollment` into the section).

All tables below are **tenant-scoped**: assume the base columns (`id` UUIDv7,
`tenant_id`, audit + sync metadata) and the `tenant_isolation` RLS policy from
[00](./00-conventions.md). Only the domain columns are shown.

Two cross-cutting rules from [08](../08-offline-sync.md):

- **Files** (`material`, `submission_file`) store a `storage_key` referencing the
  object store (MinIO) only. The bytes replicate out-of-band; the event bus carries
  the key, **never the blob**.
- **`submission` and `grade` are append-only.** A resubmission is a new `submission`
  row; a grade correction is a new `grade` row. No last-write-wins can lose a
  student's work or a teacher's mark.

---

## T3a — Content & assignments (publish)

The first releasable LMS: teachers *publish*, students *consume*. No submission loop
yet. Lives in the `academics` slice.

```
lesson_plan   (teaching_assignment_id → teaching_assignment,
               title, topic,
               sequence,                       -- order within the assignment
               planned_date?,
               body,
               status ∈ {DRAFT, PUBLISHED})
              -- syllabus = ordered lesson_plan rows per curriculum subject

material      (teaching_assignment_id → teaching_assignment,
               lesson_plan_id? → lesson_plan,  -- optional: attach to a lesson
               title,
               kind ∈ {FILE, LINK, NOTE},
               storage_key?,                   -- MinIO ref when kind = FILE
               url?,                           -- when kind = LINK
               published_at)

assignment    (teaching_assignment_id → teaching_assignment,
               title, instructions,
               assigned_at, due_at,
               max_marks?,                     -- if set, can count toward assessment
               status ∈ {DRAFT, PUBLISHED, CLOSED})
```

`material.storage_key` is populated only for `kind = FILE`; `url` only for
`kind = LINK`; a `NOTE` carries its text inline. `assignment.max_marks` is the hook
that lets a graded assignment flow into internal assessment (see T3b).

---

## T3b — Submission & grading loop (the real LMS)

Students submit; teachers grade; the grade flows into the **existing append-only
academics marks store** rather than a parallel one. This is the point where the
bounded context is real → the `learning` slice splits from `academics`.

```
submission        (assignment_id → assignment,
                   student_id → student,
                   submitted_at,
                   status ∈ {SUBMITTED, LATE, RETURNED, RESUBMITTED})
                  -- (append-only): a resubmission is a NEW row, not an edit

submission_file   (submission_id → submission,
                   storage_key,                -- MinIO ref; bytes never on the bus
                   filename,
                   size)

grade             (submission_id → submission,
                   marks,
                   feedback,
                   graded_by,                  -- membership_id of the grading teacher
                   graded_at)
                  -- (append-only): a correction is a NEW row referencing the prior
                  --                grade; flows into academics mark_entry
```

- **`submission` (append-only)** — versioned like `payment` and `mark_entry`
  ([00](./00-conventions.md), [08](../08-offline-sync.md)). The newest row for an
  `(assignment_id, student_id)` is the current attempt; `RESUBMITTED` marks a superseded
  one. Late detection compares `submitted_at` against `assignment.due_at`.
- **`submission_file` (append-only)** — the blob lives in MinIO; only the
  `storage_key` (plus `filename`/`size` metadata) crosses the event bus.
- **`grade` (append-only)** — corrections insert a new row; the effective grade is the
  latest. The **grade → marks integration point**: a `grade` on a submission whose
  `assignment.max_marks` is set writes a corresponding append-only `mark_entry` in
  academics ([05](./05-academics.md), [17](../17-academics-model.md)), so an assignment
  counts toward internal assessment without a second source of truth.

---

## T3c — Engagement

Optional, later. Auto-graded objective assessments and per-section/subject Q&A. Same
conventions; sketches kept light per [19](../19-lms.md).

```
quiz              (teaching_assignment_id → teaching_assignment,
                   title, instructions,
                   opens_at?, closes_at?, max_marks?,
                   status ∈ {DRAFT, PUBLISHED, CLOSED})

quiz_question     (quiz_id → quiz,
                   sequence, prompt,
                   kind ∈ {SINGLE, MULTI, TRUE_FALSE, SHORT},
                   options,                    -- choices + correct key
                   marks)

quiz_attempt      (quiz_id → quiz,
                   student_id → student,
                   started_at, submitted_at?,
                   answers, score?,            -- auto-graded objective score
                   status ∈ {IN_PROGRESS, SUBMITTED, GRADED})
                  -- objective scores flow into academics mark_entry like grade

discussion_thread (teaching_assignment_id → teaching_assignment,
                   title,
                   created_by,                 -- membership_id of the opener
                   status ∈ {OPEN, LOCKED})

post              (discussion_thread_id → discussion_thread,
                   parent_post_id? → post,     -- threaded replies
                   author_id,                  -- membership_id
                   body, posted_at)
```

Content-completion tracking and lesson-level attendance hang off T3a/T3b here too —
all later, all optional.

---

## Cross-slice links

- **Academics** — LMS is its growth, not a peer. `teaching_assignment`, `enrollment`,
  and `student` are reused; `grade`/`quiz_attempt` write into the append-only
  `mark_entry` ledger ([05](./05-academics.md), [17](../17-academics-model.md)).
- **Storage / sync** — files via MinIO `storage_key` + out-of-band replication; bytes
  never on the bus; `submission`/`grade` append-only ([08](../08-offline-sync.md)).
- **Guardian portal** — guardian visibility is a scoped read of assignment/submission
  status for a guardian's children (T3, [19](../19-lms.md)).
- **Slice ownership** — `academics` through T3a; a dedicated `learning` slice from T3b
  ([04](../04-vertical-slicing.md)).
