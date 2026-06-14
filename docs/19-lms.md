# 19 — LMS (Learning Management) — the Academics T3 Growth Path

The LMS is **not a new top-level module.** It is the staged expansion of the
[`academics`](./17-academics-model.md) slice from *recording* learning (attendance,
marks) into *delivering* it (content, assignments, submissions, grading). The
service catalog already tags academics as "LMS-lite" ([12](./12-service-architecture.md));
this doc makes that path concrete.

> Design stance: build the LMS **inside `academics`** until the submission + grading
> + content-delivery loop clearly forms its own bounded context, then split a
> `learning` slice ([04](./04-vertical-slicing.md)). Don't create an empty slice up
> front; don't let LMS sprawl across the tree either.

## What already exists to build on

The LMS adds almost no new *organising* structure — it reuses the academic backbone:

| Reuses | From |
|---|---|
| Who teaches what to whom (`teaching_assignment`) | [17](./17-academics-model.md) |
| Which students are in a section (`enrollment`) | [17](./17-academics-model.md) |
| The curriculum (subjects of a `program_stage`) | [17](./17-academics-model.md) |
| File/material storage (MinIO) | [02](./02-architecture.md) shared kernel |
| Append-only marks (grades flow back here) | [09](./09-feature-catalog.md) academics |
| Push / in-app notifications (new assignment, due soon, graded) | [15](./15-notifications-feedback.md) · [16](./16-push-notifications.md) |
| Guardian visibility into homework/assignment status | [18](./18-guardian-portal.md) T3 |

## The staged path

### T3a — Content & assignments (publish)

The first releasable LMS: teachers *publish*, students *consume*. No submission loop
yet.

```
lesson_plan   (id UUIDv7, tenant_id, teaching_assignment_id, title, topic,
               sequence, planned_date?, body, status ∈ {DRAFT, PUBLISHED})
material      (id UUIDv7, tenant_id, teaching_assignment_id, lesson_plan_id?,
               title, kind ∈ {FILE, LINK, NOTE}, storage_key?, url?, published_at)
assignment    (id UUIDv7, tenant_id, teaching_assignment_id, title, instructions,
               assigned_at, due_at, max_marks?, status ∈ {DRAFT, PUBLISHED, CLOSED})
```

Everything anchors on `teaching_assignment` — so a piece of content/assignment is
automatically scoped to *the right teacher, subject, and section*. Syllabus
publishing = ordered `lesson_plan` rows per curriculum subject.

### T3b — Submission & grading loop (the real LMS)

Students submit; teachers grade; **grades flow into the existing append-only marks
store** rather than a parallel one.

```
submission        (id UUIDv7, tenant_id, assignment_id, student_id,
                   submitted_at, status ∈ {SUBMITTED, LATE, RETURNED, RESUBMITTED})
submission_file   (submission_id, storage_key, filename, size)
grade             (id UUIDv7, tenant_id, submission_id, marks, feedback,
                   graded_by, graded_at)   -- append-only; corrections add a new row
```

- **Submissions are append-only / versioned** — a resubmission is a new row, not an
  edit, keeping it sync-safe ([08](./08-offline-sync.md)) the same way payments and
  marks are.
- A `grade` writing back to the academics marks ledger is the integration point — an
  assignment with `max_marks` can count toward internal assessment.
- This is the point where the bounded context is real → **split the `learning` slice**.

### T3c — Engagement

```
quiz / quiz_question / quiz_attempt      -- auto-graded objective assessments
discussion_thread / post                 -- per section/subject Q&A
```

Plus content-completion tracking and lesson-level attendance. All optional, all
later.

## Sync & offline considerations

The LMS is the **heaviest payload** in the product, so it gets special handling:

- **Large files** (materials, submission uploads) sync via object storage
  references, **not** through the event bus — the event carries the `storage_key`,
  the blob replicates out-of-band ([08](./08-offline-sync.md)). Never put file bytes
  on NATS.
- **Append-only submissions & grades** mean no last-write-wins can lose a student's
  work or a teacher's mark.
- LMS is **gated by license/plan modules** ([01](./01-overview.md)) — a school on a
  basic plan may not have it enabled at all.

## Scope decision

| Stage | Tier | Lives in | Ships |
|---|---|---|---|
| LMS-lite (classes, attendance, marks) | T1/T2 | `academics` | already planned |
| **T3a** content + assignments (publish only) | T3 | `academics` | first LMS release |
| **T3b** submissions + grading → marks | T3 | **split `learning` slice** | the real LMS |
| **T3c** quizzes, discussion, completion | T3 | `learning` | later |

The existing feature-catalog row "Homework / assignments / syllabus" (T3,
[09](./09-feature-catalog.md)) is the T3a seed of this path.

## Cross-slice links

- **Academics** — LMS is its growth, not a peer; grades write to academics marks
  ([17](./17-academics-model.md)).
- **Guardian portal** — "LMS visibility" (T3, [18](./18-guardian-portal.md)) is a
  scoped read of assignment/submission status for a guardian's children.
- **Storage / sync** — files via MinIO + out-of-band replication ([02](./02-architecture.md), [08](./08-offline-sync.md)).
- **Notifications** — assignment published / due-soon / graded events
  ([15](./15-notifications-feedback.md), [16](./16-push-notifications.md)).
- **Slice ownership** — `academics` through T3a; a dedicated `learning` slice from
  T3b ([04](./04-vertical-slicing.md)).
