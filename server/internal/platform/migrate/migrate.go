// Package migrate runs the embedded goose migrations against Postgres. The node
// binary runs this on startup so a fresh database is brought up to schema before
// it serves traffic. Migrations are expand-only (13-update-pipeline.md).
package migrate

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver "pgx"
	"github.com/pressly/goose/v3"

	"github.com/weloin/ved/db/migrations"
)

// Up applies all pending migrations.
func Up(ctx context.Context, databaseURL string) error {
	sqlDB, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("open db for migrate: %w", err)
	}
	defer sqlDB.Close()

	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set dialect: %w", err)
	}
	if err := goose.UpContext(ctx, sqlDB, "."); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}
