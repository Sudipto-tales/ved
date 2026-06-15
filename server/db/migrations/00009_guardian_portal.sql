-- Migration #9 — Guardian portal (M7). The guardian portal owns NO new domain data
-- (docs/18-guardian-portal.md "Why not a guardian slice"): it is a child-scoped reader over
-- students/academics/finance. The only schema change is the reverse link from a guardian
-- LOGIN to its contact record, so a logged-in guardian resolves to its guardian_id.
--
-- A guardian still commonly has NO login (contact-only), so membership_id is nullable;
-- it is set only when the guardian is promoted to a portal user.

-- +goose Up
ALTER TABLE guardian ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES memberships (id);
-- one login per guardian record (when present)
CREATE UNIQUE INDEX IF NOT EXISTS guardian_membership_key
    ON guardian (membership_id) WHERE membership_id IS NOT NULL AND deleted_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS guardian_membership_key;
ALTER TABLE guardian DROP COLUMN IF EXISTS membership_id;
