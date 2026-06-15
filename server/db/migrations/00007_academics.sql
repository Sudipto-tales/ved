-- Migration #7 — Academics (M5). The academic backbone (docs/database/05-academics.md,
-- docs/17-academics-model.md): structure (program → program_stage → subject/curriculum),
-- the live offering (section, enrollment, teaching_assignment, exam), and the two
-- APPEND-ONLY ledgers (attendance_event, mark_entry).
--
-- Also adds a MINIMAL subset of tenant-setup (docs/database/03): academic_year — the
-- anchor sections/exams hang from. The full tenant-setup slice (term, room, dropdowns)
-- comes later; this is only what academics needs. MVP enrollment_mode = SECTION_BASED.
--
-- Append-only convention (docs/database/00): ledgers carry created_at/created_by + hlc +
-- origin_node_id but NO updated_at/deleted_at/version; corrections are NEW rows and the
-- latest by hlc wins; counts are summed on read, never stored. A DB trigger enforces
-- immutability (no UPDATE/DELETE) — defence at the database, not just the repo.

-- +goose Up

-- Immutability guard reused by every append-only ledger (academics + finance).
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'append-only table %, % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- ---- minimal academic_year (tenant-setup subset) --------------------------------
CREATE TABLE IF NOT EXISTS academic_year (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    name           text NOT NULL,                 -- "2026-27"
    start_date     date NOT NULL,
    end_date       date NOT NULL,
    is_current     boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz,
    hlc            text NOT NULL,
    version        bigint NOT NULL DEFAULT 1,
    origin_node_id uuid NOT NULL,
    CONSTRAINT academic_year_tenant_name_key UNIQUE (tenant_id, name)
);
-- at most one current year per tenant
CREATE UNIQUE INDEX IF NOT EXISTS academic_year_one_current
    ON academic_year (tenant_id) WHERE is_current AND deleted_at IS NULL;

-- ---- structure ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS program (
    id              uuid PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    name            text NOT NULL,
    code            text NOT NULL,
    enrollment_mode text NOT NULL DEFAULT 'SECTION_BASED'
                      CHECK (enrollment_mode IN ('SECTION_BASED','COURSE_BASED')),
    status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    hlc             text NOT NULL,
    version         bigint NOT NULL DEFAULT 1,
    origin_node_id  uuid NOT NULL,
    CONSTRAINT program_tenant_code_key UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS program_stage (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    program_id     uuid NOT NULL REFERENCES program (id),
    name           text NOT NULL,
    ordinal        int  NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz,
    hlc            text NOT NULL,
    version        bigint NOT NULL DEFAULT 1,
    origin_node_id uuid NOT NULL,
    CONSTRAINT program_stage_ordinal_key UNIQUE (tenant_id, program_id, ordinal)
);

CREATE TABLE IF NOT EXISTS subject (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    name           text NOT NULL,
    code           text NOT NULL,
    credits        int,
    kind           text NOT NULL DEFAULT 'THEORY' CHECK (kind IN ('THEORY','LAB','OTHER')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz,
    hlc            text NOT NULL,
    version        bigint NOT NULL DEFAULT 1,
    origin_node_id uuid NOT NULL,
    CONSTRAINT subject_tenant_code_key UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS curriculum (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    program_stage_id uuid NOT NULL REFERENCES program_stage (id),
    subject_id       uuid NOT NULL REFERENCES subject (id),
    requirement      text NOT NULL DEFAULT 'MANDATORY' CHECK (requirement IN ('MANDATORY','ELECTIVE')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT curriculum_key UNIQUE (tenant_id, program_stage_id, subject_id)
);

-- ---- live offering --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS section (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    program_stage_id uuid NOT NULL REFERENCES program_stage (id),
    academic_year_id uuid NOT NULL REFERENCES academic_year (id),
    name             text NOT NULL,
    room_id          uuid,
    class_teacher_id uuid REFERENCES teacher (id),
    capacity         int,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT section_key UNIQUE (tenant_id, academic_year_id, program_stage_id, name)
);

CREATE TABLE IF NOT EXISTS enrollment (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    student_id       uuid NOT NULL REFERENCES student (id),
    section_id       uuid NOT NULL REFERENCES section (id),
    academic_year_id uuid NOT NULL REFERENCES academic_year (id),
    roll_no          text,
    status           text NOT NULL DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE','TRANSFERRED','WITHDRAWN','PROMOTED')),
    enrolled_at      timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL
);
-- at most one ACTIVE enrollment per (student, academic_year)
CREATE UNIQUE INDEX IF NOT EXISTS enrollment_one_active
    ON enrollment (tenant_id, student_id, academic_year_id) WHERE status = 'ACTIVE' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS enrollment_section_idx ON enrollment (tenant_id, section_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS teaching_assignment (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    section_id       uuid NOT NULL REFERENCES section (id),
    subject_id       uuid NOT NULL REFERENCES subject (id),
    teacher_id       uuid NOT NULL REFERENCES teacher (id),
    academic_year_id uuid NOT NULL REFERENCES academic_year (id),
    role             text NOT NULL DEFAULT 'PRIMARY' CHECK (role IN ('PRIMARY','CO_TEACHER')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT teaching_assignment_key UNIQUE (tenant_id, section_id, subject_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS exam (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    academic_year_id uuid NOT NULL REFERENCES academic_year (id),
    term_id          uuid,
    name             text NOT NULL,
    max_marks        numeric(8,2) NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT exam_key UNIQUE (tenant_id, academic_year_id, name)
);

-- ---- append-only ledgers (no updated_at/deleted_at/version) ----------------------
CREATE TABLE IF NOT EXISTS attendance_event (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    enrollment_id  uuid REFERENCES enrollment (id),
    student_id     uuid REFERENCES student (id),
    section_id     uuid REFERENCES section (id),
    date           date NOT NULL,
    status         text NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
    marked_by      uuid NOT NULL REFERENCES teacher (id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS attendance_event_idx ON attendance_event (tenant_id, enrollment_id, date);

CREATE TABLE IF NOT EXISTS mark_entry (
    id             uuid PRIMARY KEY,
    tenant_id      uuid NOT NULL,
    exam_id        uuid NOT NULL REFERENCES exam (id),
    enrollment_id  uuid REFERENCES enrollment (id),
    student_id     uuid REFERENCES student (id),
    subject_id     uuid NOT NULL REFERENCES subject (id),
    marks          numeric(8,2) NOT NULL,
    graded_by      uuid NOT NULL REFERENCES teacher (id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid,
    hlc            text NOT NULL,
    origin_node_id uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS mark_entry_idx ON mark_entry (tenant_id, exam_id, enrollment_id, subject_id);

-- ---- RLS ------------------------------------------------------------------------
-- +goose StatementBegin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_year','program','program_stage','subject','curriculum',
                           'section','enrollment','teaching_assignment','exam',
                           'attendance_event','mark_entry']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', t);
  END LOOP;
END $$;
-- +goose StatementEnd

-- ---- immutability triggers on the append-only ledgers ---------------------------
CREATE TRIGGER attendance_event_immutable BEFORE UPDATE OR DELETE ON attendance_event
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER mark_entry_immutable BEFORE UPDATE OR DELETE ON mark_entry
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- +goose Down
DROP TABLE IF EXISTS mark_entry;
DROP TABLE IF EXISTS attendance_event;
DROP TABLE IF EXISTS exam;
DROP TABLE IF EXISTS teaching_assignment;
DROP TABLE IF EXISTS enrollment;
DROP TABLE IF EXISTS section;
DROP TABLE IF EXISTS curriculum;
DROP TABLE IF EXISTS subject;
DROP TABLE IF EXISTS program_stage;
DROP TABLE IF EXISTS program;
DROP TABLE IF EXISTS academic_year;
DROP FUNCTION IF EXISTS forbid_mutation();
