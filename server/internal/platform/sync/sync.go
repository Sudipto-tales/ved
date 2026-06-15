// Package sync turns the cloud-first system into local-first by WIRING the transactional
// outbox to JetStream (docs/08-offline-sync.md, docs/plan/bridges.md §6/§7). Because every
// mutation already writes an outbox row in its transaction (the golden rule from M0), sync
// is wiring, not a rewrite: the relay reads unsent outbox rows and publishes them; the
// cloud hub records them in a durable per-tenant history with an idempotent inbox.
package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/bus"
)

// Envelope is the on-the-wire event shape (the §6 contract). It mirrors an outbox row.
// Producers and consumers depend on this schema + a version, never each other's tables.
type Envelope struct {
	EventID      uuid.UUID       `json:"event_id"`
	TenantID     uuid.UUID       `json:"tenant_id"`
	Aggregate    string          `json:"aggregate"`
	AggregateID  uuid.UUID       `json:"aggregate_id"`
	Op           string          `json:"op"`
	Payload      json.RawMessage `json:"payload"`
	HLC          string          `json:"hlc"`
	OriginNodeID uuid.UUID       `json:"origin_node_id"`
	SchemaVer    int             `json:"schema_version"`
	CreatedAt    time.Time       `json:"created_at"`
}

// Subject is the per-tenant JetStream subject: tenant.<tenant_id>.<aggregate>.<op>. Per-
// tenant scoping means a node only ever touches its own tenant's subjects (§7 isolation).
func (e Envelope) Subject() string {
	return fmt.Sprintf("tenant.%s.%s.%s", e.TenantID, e.Aggregate, e.Op)
}

// Relay reads unsent outbox rows and publishes them to JetStream, then marks them sent.
// It uses a connection that bypasses RLS (a node-local infra worker spanning every tenant
// the node hosts) — the same posture as migrations running as the owner.
type Relay struct {
	pool     *pgxpool.Pool
	bus      *bus.Bus
	interval time.Duration
	batch    int
}

func NewRelay(pool *pgxpool.Pool, b *bus.Bus) *Relay {
	return &Relay{pool: pool, bus: b, interval: 2 * time.Second, batch: 200}
}

// Run polls until the context is cancelled. At-least-once: publish happens before the
// sent_at mark, so a crash in between merely republishes (JetStream MsgId + the cloud
// inbox dedupe it).
func (r *Relay) Run(ctx context.Context) {
	t := time.NewTicker(r.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n, err := r.drain(ctx); err != nil {
				slog.Warn("sync relay drain", "err", err)
			} else if n > 0 {
				slog.Info("sync relay published", "count", n)
			}
		}
	}
}

func (r *Relay) drain(ctx context.Context) (int, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, tenant_id, aggregate, aggregate_id, op, payload, schema_version, hlc, origin_node_id, created_at
		   FROM outbox WHERE sent_at IS NULL ORDER BY created_at LIMIT $1`, r.batch)
	if err != nil {
		return 0, err
	}
	var envs []Envelope
	for rows.Next() {
		var e Envelope
		if err := rows.Scan(&e.EventID, &e.TenantID, &e.Aggregate, &e.AggregateID, &e.Op,
			&e.Payload, &e.SchemaVer, &e.HLC, &e.OriginNodeID, &e.CreatedAt); err != nil {
			rows.Close()
			return 0, err
		}
		envs = append(envs, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	sent := 0
	for _, e := range envs {
		data, _ := json.Marshal(e)
		if err := r.bus.Publish(e.Subject(), e.EventID.String(), data); err != nil {
			return sent, fmt.Errorf("publish %s: %w", e.EventID, err) // stop; retry next tick
		}
		if _, err := r.pool.Exec(ctx, `UPDATE outbox SET sent_at = now() WHERE id = $1`, e.EventID); err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}
