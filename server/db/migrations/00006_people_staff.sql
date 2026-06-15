-- Migration #6 — People: teachers & staff (M5). The same membership-linked profile shape
-- as `student` (#5), per docs/database/04-people.md. Identity (users + memberships + roles)
-- is NOT repeated here — these are profile tables only, 1:1 with a membership.
--
--   * teacher  — membership.user_type = TEACHER; HR profile (qualifications, joining…).
--   * employee — membership.user_type = EMPLOYEE; non-teaching staff/authority profile.
--
-- Subjects taught (teaching_assignment) and homeroom live in academics (later); not here.
-- Both tenant-scoped: base columns + RLS from docs/database/00-conventions.md.

-- +goose Up

CREATE TABLE IF NOT EXISTS teacher (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    membership_id    uuid NOT NULL REFERENCES memberships (id),  -- user_type = TEACHER
    qualifications   jsonb,
    joining_date     date,
    employee_code    text,
    specialization   text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT teacher_membership_key UNIQUE (membership_id)
);
CREATE INDEX IF NOT EXISTS teacher_tenant_idx ON teacher (tenant_id) WHERE deleted_at IS NULL;
-- employee_code is unique within the tenant ONLY when present (partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS teacher_tenant_code_key
    ON teacher (tenant_id, employee_code) WHERE employee_code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS employee (
    id               uuid PRIMARY KEY,
    tenant_id        uuid NOT NULL,
    membership_id    uuid NOT NULL REFERENCES memberships (id),  -- user_type = EMPLOYEE
    department       text,
    designation      text,                                       -- display title (not authz)
    joining_date     date,
    employee_code    text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    hlc              text NOT NULL,
    version          bigint NOT NULL DEFAULT 1,
    origin_node_id   uuid NOT NULL,
    CONSTRAINT employee_membership_key UNIQUE (membership_id)
);
CREATE INDEX IF NOT EXISTS employee_tenant_idx ON employee (tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employee_tenant_code_key
    ON employee (tenant_id, employee_code) WHERE employee_code IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE teacher  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher  FORCE  ROW LEVEL SECURITY;
ALTER TABLE employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON teacher  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON employee USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- +goose Down
DROP TABLE IF EXISTS employee;
DROP TABLE IF EXISTS teacher;
