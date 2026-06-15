-- Migration #10 — LMS / learning (M8, docs/database/07-lms.md, docs/19-lms.md). The
-- staged growth of academics from RECORDING learning to DELIVERING it: T3a content +
-- assignments, T3b the submission → grading loop. Everything anchors on
-- teaching_assignment (teacher × subject × section); files store a storage_key only
-- (MinIO; bytes never on the bus). submission/submission_file/grade are APPEND-ONLY.
--
-- The integration point: a grade on a submission whose assignment.max_marks is set writes
-- an append-only mark_entry in academics — so an assignment counts toward assessment
-- WITHOUT a second source of truth. That requires mark_entry to accept an
-- assignment-sourced mark, so exam_id becomes nullable + a nullable assignment_id is added.

-- +goose Up

-- ---- T3a: content + assignments (mutable config) --------------------------------
CREATE TABLE IF NOT EXISTS assignment (
    id                     uuid PRIMARY KEY,
    tenant_id              uuid NOT NULL,
    teaching_assignment_id uuid NOT NULL REFERENCES teaching_assignment (id),
    title                  text NOT NULL,
    instructions           text,
    assigned_at            timestamptz NOT NULL DEFAULT now(),
    due_at                 timestamptz,
    max_marks              numeric(8,2),                 -- if set, grade flows to mark_entry
    status                 text NOT NULL DEFAULT 'PUBLISHED'
                             CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_at             timestamptz NOT NULL DEFAULT now(),
    deleted_at             timestamptz,
    hlc                    text NOT NULL,
    version                bigint NOT NULL DEFAULT 1,
    origin_node_id         uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS assignment_ta_idx ON assignment (tenant_id, teaching_assignment_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS material (
    id                     uuid PRIMARY KEY,
    tenant_id              uuid NOT NULL,
    teaching_assignment_id uuid NOT NULL REFERENCES teaching_assignment (id),
    assignment_id          uuid REFERENCES assignment (id),
    title                  text NOT NULL,
    kind                   text NOT NULL DEFAULT 'NOTE' CHECK (kind IN ('FILE','LINK','NOTE')),
    storage_key            text,                         -- MinIO ref when kind = FILE
    url                    text,                         -- when kind = LINK
    body                   text,                         -- inline when kind = NOTE
    published_at           timestamptz NOT NULL DEFAULT now(),
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid,
    updated_at             timestamptz NOT NULL DEFAULT now(),
    deleted_at             timestamptz,
    hlc                    text NOT NULL,
    version                bigint NOT NULL DEFAULT 1,
    origin_node_id         uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS material_ta_idx ON material (tenant_id, teaching_assignment_id) WHERE deleted_at IS NULL;

-- ---- T3b: submission → grading (append-only) ------------------------------------
CREATE TABLE IF NOT EXISTS submission (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    assignment_id  uuid NOT NULL REFERENCES assignment (id),
    student_id     uuid NOT NULL REFERENCES student (id),
    submitted_at   timestamptz NOT NULL DEFAULT now(),
    status         text NOT NULL CHECK (status IN ('SUBMITTED','LATE','RETURNED','RESUBMITTED')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS submission_idx ON submission (tenant_id, assignment_id, student_id);

CREATE TABLE IF NOT EXISTS submission_file (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    submission_id  uuid NOT NULL REFERENCES submission (id),
    storage_key    text NOT NULL,                -- MinIO ref; bytes never on the bus
    filename       text,
    size           bigint,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS submission_file_idx ON submission_file (tenant_id, submission_id);

CREATE TABLE IF NOT EXISTS grade (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    submission_id  uuid NOT NULL REFERENCES submission (id),
    marks          numeric(8,2) NOT NULL,
    feedback       text,
    graded_by      uuid,                         -- membership_id of the grading teacher
    graded_at      timestamptz NOT NULL DEFAULT now(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS grade_idx ON grade (tenant_id, submission_id);

-- ---- grade → marks integration: mark_entry accepts an assignment-sourced mark -----
ALTER TABLE mark_entry ALTER COLUMN exam_id DROP NOT NULL;
ALTER TABLE mark_entry ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES assignment (id);

-- ---- RLS ------------------------------------------------------------------------
-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assignment','material','submission','submission_file','grade']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;
-- +goose StatementEnd

-- ---- immutability triggers on the append-only T3b tables ------------------------
CREATE TRIGGER submission_immutable      BEFORE UPDATE OR DELETE ON submission      FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER submission_file_immutable BEFORE UPDATE OR DELETE ON submission_file FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER grade_immutable           BEFORE UPDATE OR DELETE ON grade           FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- +goose Down
ALTER TABLE mark_entry DROP COLUMN IF EXISTS assignment_id;
DROP TABLE IF EXISTS grade;
DROP TABLE IF EXISTS submission_file;
DROP TABLE IF EXISTS submission;
DROP TABLE IF EXISTS material;
DROP TABLE IF EXISTS assignment;
