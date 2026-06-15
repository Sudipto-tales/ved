// Package migrate runs the embedded goose migrations against Postgres. The node
// binary runs this on startup so a fresh database is brought up to schema before
// it serves traffic. Migrations are expand-only (13-update-pipeline.md).
package migrate

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"

	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver "pgx"
	"github.com/pressly/goose/v3"

	"github.com/weloin/ved/db/cpmigrations"
	"github.com/weloin/ved/db/migrations"
)

// Up applies all pending tenant-plane migrations (the node's `public` schema).
func Up(ctx context.Context, databaseURL string) error {
	return run(ctx, databaseURL, migrations.FS, "goose_db_version")
}

// UpControlPlane applies the control-plane migrations. They live in their own schema
// (`control_plane`) and track version under their OWN goose table, so they never collide
// with the tenant-plane migration sequence even in a shared dev database.
func UpControlPlane(ctx context.Context, databaseURL string) error {
	return run(ctx, databaseURL, cpmigrations.FS, "cp_goose_db_version")
}

func run(ctx context.Context, databaseURL string, fsys fs.FS, versionTable string) error {
	sqlDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("open db for migrate: %w", err)
	}
	defer sqlDB.Close()

	goose.SetBaseFS(fsys)
	goose.SetTableName(versionTable)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set dialect: %w", err)
	}
	if err := goose.UpContext(ctx, sqlDB, "."); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}
