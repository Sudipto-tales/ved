-- Creates the runtime application role. The app's connection pool runs as this role
-- (NOSUPERUSER, NOBYPASSRLS) so Row-Level Security actually enforces tenant
-- isolation — a superuser silently bypasses RLS. Migrations keep running as the
-- owner/superuser; only the app's queries run as ved_app. (docs/03-multi-tenancy.md)

-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ved_app') THEN
    CREATE ROLE ved_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
-- +goose StatementEnd

GRANT USAGE ON SCHEMA public TO ved_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ved_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ved_app;

-- Future tables/sequences (created by the migration owner) are granted automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ved_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ved_app;

-- +goose Down
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ved_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM ved_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ved_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ved_app;
REVOKE USAGE ON SCHEMA public FROM ved_app;
-- Role left in place; DROP ROLE ved_app manually if truly removing.
