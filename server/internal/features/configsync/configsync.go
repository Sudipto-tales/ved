// Package configsync is the NODE side of cloud→node push-down (docs/08-offline-sync.md).
// It is the mirror of the control-plane synchub: a durable JetStream consumer on the config
// stream (cloud.>) that idempotently applies the cloud's config snapshots into the node's
// local tables via the inbox + LWW/tombstone merge. License/tenant-config/catalog updates
// reach an offline-for-days node by replaying from its durable cursor on reconnect.
package configsync

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"

	"github.com/weloin/ved/internal/platform/bus"
	syncpkg "github.com/weloin/ved/internal/platform/sync"
)

const durable = "node-config"

// DefaultRegistry maps the config aggregates a node materialises to their target tables.
// Each payload is a FULL-ROW snapshot (the cloud relay sends complete columns), merged by
// row-level LWW. tenant_profile is the first real cloud→node config target (a school's
// display settings pushed from the control plane).
var DefaultRegistry = syncpkg.Registry{
	"tenant_profile": {Table: "tenant_profile", Columns: []string{"display_name", "slug"}},
}

// Start ensures the config stream and subscribes the durable node-config consumer. Returns
// the subscription so the caller keeps it alive for the process lifetime.
func Start(ctx context.Context, b *bus.Bus, pool *pgxpool.Pool, reg syncpkg.Registry) (*nats.Subscription, error) {
	if err := b.EnsureConfigStream(); err != nil {
		return nil, err
	}
	return b.Subscribe(bus.ConfigSubjectAll, durable, func(msg *nats.Msg) {
		var e syncpkg.Envelope
		if err := json.Unmarshal(msg.Data, &e); err != nil {
			slog.Warn("configsync: bad envelope", "err", err)
			_ = msg.Ack() // poison message: drop, don't redeliver forever
			return
		}
		action, err := syncpkg.ApplyConfigEvent(ctx, pool, reg, e)
		if err != nil {
			slog.Warn("configsync: apply failed (will redeliver)", "event", e.EventID, "err", err)
			return // no ack → JetStream redelivers
		}
		slog.Info("configsync: applied config event",
			"aggregate", e.Aggregate, "op", e.Op, "tenant", e.TenantID, "action", action)
		_ = msg.Ack()
	})
}
