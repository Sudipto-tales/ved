# Database — Schema Plan

The concrete table designs for VED, one file per slice. The cross-cutting
*principles* live in [../21-database-architecture.md](../21-database-architecture.md);
the shared *column template* every table follows is [00-conventions.md](./00-conventions.md).
End-to-end movement of this data is [../20-dataflow.md](../20-dataflow.md).

## The best way to build these schemas (strategy)

1. **Conventions first.** Lock [00-conventions.md](./00-conventions.md) — base columns,
   RLS policy, UUIDv7, sync columns, naming. Every table inherits it. Decided once,
   never re-litigated per table.
2. **Sync columns from migration #1.** `hlc`, `version`, `origin_node_id`,
   `deleted_at` exist on day one even while cloud-only. Cheap now, a rewrite later
   ([08](../08-offline-sync.md)).
3. **Build in dependency order**, not feature order — a table can't reference one that
   doesn't exist yet:
   `control-plane → identity/access → tenant-setup → people → academics → finance → lms`,
   with `cross-cutting` (outbox/inbox/audit) seeded alongside the very first slice.
4. **One goose migration per slice**, expand-only (parallel-change,
   [13](../13-update-pipeline.md)). Never drop/rename in the same release that adds.
5. **Raw SQL → sqlc.** Migrations define tables; `db/queries/*.sql` define access;
   sqlc generates the typed Go. No ORM ([02](../02-architecture.md)).
6. **Append-only where it matters** — ledgers, attendance, marks, submissions, audit.
   Derive totals; never store a mutable balance ([21](../21-database-architecture.md)).
7. **Seed data is code-defined** — the permission catalog and default roles are seeded
   at tenant provisioning ([03](../03-multi-tenancy.md), [05](../05-rbac.md)).

## Files (in build / dependency order)

| File | Slice | Key tables |
|---|---|---|
| [00-conventions.md](./00-conventions.md) | (all) | base columns, RLS, naming, legend |
| [01-control-plane.md](./01-control-plane.md) | platform (cloud-only) | `school_registration`, `tenant`, `subscription`, `subscription_invoice`, `license`, `payment_proof` |
| [02-identity-access.md](./02-identity-access.md) | identity + access | `users`, `memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `designations` |
| [03-tenant-setup.md](./03-tenant-setup.md) | tenant | `tenant_profile`, `academic_year`, `term`, `dropdown_option`, `room`, `document_template` |
| [04-people.md](./04-people.md) | students/teachers/staff | `student`, `guardian`, `guardian_student`, `teacher`, `employee`, `person_document` |
| [05-academics.md](./05-academics.md) | academics | `program`, `program_stage`, `subject`, `curriculum`, `section`, `enrollment`, `teaching_assignment`, `attendance_event`, `exam`, `mark_entry`, `timetable_slot` |
| [06-finance.md](./06-finance.md) | finance | `fee_head`, `fee_structure(_line)`, `fee_schedule`, `concession_scheme`, `fine_rule`, `ledger_entry`, `invoice(_line)`, `payment` |
| [07-lms.md](./07-lms.md) | learning (T3) | `lesson_plan`, `material`, `assignment`, `submission`, `submission_file`, `grade`, `quiz*` |
| [08-cross-cutting.md](./08-cross-cutting.md) | shared kernel | `outbox`, `inbox`, `sync_cursor`, `audit_log`, `notification`, `device_token` |
