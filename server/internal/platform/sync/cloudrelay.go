// Cloud-side relay for cloud→node config push-down (docs/08 "what flows which way"). The
// mirror of Relay, but it drains control_plane.cp_outbox and publishes on the cloud.* config
// subjects. Same at-least-once posture: publish before marking sent, so a crash merely
// republishes (JetStream MsgId + the node inbox dedupe it).
package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/bus"
)

// ConfigSubject is the cloud→node subject: cloud.<tenant_id>.<aggregate>.<op>.
func (e Envelope) ConfigSubject() string {
	return fmt.Sprintf("cloud.%s.%s.%s", e.TenantID, e.Aggregate, e.Op)
}

// CloudRelay publishes unsent control_plane.cp_outbox rows to the config stream.
type CloudRelay struct {
	pool     *pgxpool.Pool
	bus      *bus.Bus
	interval time.Duration
	batch    int
}

func NewCloudRelay(pool *pgxpool.Pool, b *bus.Bus) *CloudRelay {
	return &CloudRelay{pool: pool, bus: b, interval: 2 * time.Second, batch: 200}
}

func (r *CloudRelay) Run(ctx context.Context) {
	t := time.NewTicker(r.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n, err := r.drain(ctx); err != nil {
				slog.Warn("cloud relay drain", "err", err)
			} else if n > 0 {
				slog.Info("cloud relay published", "count", n)
			}
		}
	}
}

func (r *CloudRelay) drain(ctx context.Context) (int, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, tenant_id, aggregate, aggregate_id, op, payload, schema_version, hlc, origin_node_id, created_at
		   FROM control_plane.cp_outbox WHERE sent_at IS NULL ORDER BY created_at LIMIT $1`, r.batch)
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
		if err := r.bus.Publish(e.ConfigSubject(), e.EventID.String(), data); err != nil {
			return sent, fmt.Errorf("publish %s: %w", e.EventID, err)
		}
		if _, err := r.pool.Exec(ctx, `UPDATE control_plane.cp_outbox SET sent_at = now() WHERE id = $1`, e.EventID); err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}
