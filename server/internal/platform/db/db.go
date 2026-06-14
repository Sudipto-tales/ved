// Package db owns the Postgres connection pool (pgxpool) — part of the shared
// kernel ([02] architecture). Every slice's repository borrows from this pool.
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Connect opens a pgx pool and verifies it with a ping. If appRole is non-empty,
// every pooled connection runs `SET ROLE <appRole>` — so the whole app runs as a
// NON-superuser role and Postgres RLS enforces tenant isolation. Migrations use a
// separate (owner) connection and are unaffected.
func Connect(ctx context.Context, url string, appRole string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 10

	if appRole != "" {
		setRole := "SET ROLE " + pgx.Identifier{appRole}.Sanitize()
		cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
			_, err := c.Exec(ctx, setRole)
			return err
		}
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return pool, nil
}
