// Package synchub is the control-plane sync hub: it consumes every tenant's events from
// JetStream and records them in the durable cloud history (control_plane.sync_event),
// idempotently (docs/08-offline-sync.md pillars 3+4). The durable consumer cursor makes
// it resumable after downtime; the PK on event_id makes replays/duplicates no-ops.
package synchub

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"

	"github.com/weloin/ved/internal/platform/bus"
	syncpkg "github.com/weloin/ved/internal/platform/sync"
)

const durable = "cloud-hub"

// Start ensures the stream and subscribes the durable cloud-hub consumer. Returns the
// subscription so the caller can keep it alive for the process lifetime.
func Start(ctx context.Context, b *bus.Bus, pool *pgxpool.Pool) (*nats.Subscription, error) {
	if err := b.EnsureStream(); err != nil {
		return nil, err
	}
	return b.Subscribe(bus.SubjectAll, durable, func(msg *nats.Msg) {
		var e syncpkg.Envelope
		if err := json.Unmarshal(msg.Data, &e); err != nil {
			slog.Warn("synchub: bad envelope", "err", err)
			_ = msg.Ack() // poison message: drop, don't redeliver forever
			return
		}
		// Idempotent apply: PK on event_id turns a duplicate into a no-op.
		ct, err := pool.Exec(ctx,
			`INSERT INTO control_plane.sync_event
			   (event_id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id, schema_version, occurred_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			 ON CONFLICT (event_id) DO NOTHING`,
			e.EventID, e.TenantID, e.Aggregate, e.AggregateID, e.Op, e.Payload, e.HLC, e.OriginNodeID, e.SchemaVer, e.CreatedAt)
		if err != nil {
			slog.Warn("synchub: apply failed (will redeliver)", "event", e.EventID, "err", err)
			return // no ack → JetStream redelivers
		}
		if ct.RowsAffected() == 0 {
			slog.Debug("synchub: duplicate event ignored", "event", e.EventID)
		} else {
			slog.Info("synchub: applied event", "aggregate", e.Aggregate, "op", e.Op, "tenant", e.TenantID)
		}

		// Project domain aggregates that the cloud serves directly (e.g. the Support
		// Console reads control_plane.support_*). Projection is idempotent; on failure we
		// DON'T ack so JetStream redelivers (e.g. a message arriving before its ticket).
		if err := Project(ctx, pool, e); err != nil {
			slog.Warn("synchub: projection failed (will redeliver)", "event", e.EventID, "aggregate", e.Aggregate, "err", err)
			return
		}
		_ = msg.Ack()
	})
}
