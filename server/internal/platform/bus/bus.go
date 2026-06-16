// Package bus is the NATS JetStream transport kernel for sync (docs/08-offline-sync.md
// pillar 3, docs/plan/bridges.md §7). JetStream gives durable, replayable delivery: the
// relay publishes events here; a node that was offline for days replays from its durable
// consumer cursor on reconnect. The bus is just the wire — the relay (outbox) and the
// hub (inbox) own the at-least-once + idempotency semantics around it.
package bus

import (
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
)

// StreamName carries node→cloud business events (tenant.<id>.<aggregate>.<op>).
const StreamName = "VED_EVENTS"

// ConfigStreamName carries cloud→node config push-down (cloud.<id>.<aggregate>.<op>):
// license/tenant-config/catalog updates flowing the OTHER direction (docs/08 "what flows
// which way"). Kept a SEPARATE stream so the two directions have independent retention and
// consumer cursors and never cross-deliver.
const ConfigStreamName = "VED_CONFIG"

// SubjectAll matches every node→cloud tenant subject.
const SubjectAll = "tenant.>"

// ConfigSubjectAll matches every cloud→node config subject.
const ConfigSubjectAll = "cloud.>"

// Bus wraps a NATS connection + JetStream context.
type Bus struct {
	nc *nats.Conn
	js nats.JetStreamContext
}

// Connect dials NATS and opens a JetStream context. It retries briefly so startup races
// with the broker don't fail the process.
func Connect(url string) (*Bus, error) {
	nc, err := nats.Connect(url,
		nats.RetryOnFailedConnect(true),
		nats.MaxReconnects(-1), // reconnect forever (offline-tolerant)
		nats.ReconnectWait(2*time.Second),
		nats.Timeout(5*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("nats connect: %w", err)
	}
	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("jetstream context: %w", err)
	}
	return &Bus{nc: nc, js: js}, nil
}

// EnsureStream creates the node→cloud events stream if it does not exist (idempotent).
func (b *Bus) EnsureStream() error {
	return b.ensureStream(StreamName, SubjectAll)
}

// EnsureConfigStream creates the cloud→node config stream if it does not exist (idempotent).
func (b *Bus) EnsureConfigStream() error {
	return b.ensureStream(ConfigStreamName, ConfigSubjectAll)
}

func (b *Bus) ensureStream(name, subject string) error {
	if _, err := b.js.StreamInfo(name); err == nil {
		return nil
	}
	_, err := b.js.AddStream(&nats.StreamConfig{
		Name:       name,
		Subjects:   []string{subject},
		Storage:    nats.FileStorage,
		Retention:  nats.LimitsPolicy,
		MaxAge:     30 * 24 * time.Hour, // durable per-tenant history window
		Duplicates: 10 * time.Minute,    // server-side MsgId dedup window
	})
	if err != nil {
		return fmt.Errorf("add stream %s: %w", name, err)
	}
	return nil
}

// Publish sends data on subject with a dedup id (the outbox/event id). JetStream drops a
// duplicate MsgId inside its dedup window — the first layer of effectively-once.
func (b *Bus) Publish(subject, msgID string, data []byte) error {
	_, err := b.js.Publish(subject, data, nats.MsgId(msgID))
	return err
}

// Subscribe starts a DURABLE push consumer with manual ack. The durable name persists the
// cursor server-side, so a restarted/reconnected consumer resumes from the last ack.
func (b *Bus) Subscribe(subject, durable string, handler func(*nats.Msg)) (*nats.Subscription, error) {
	return b.js.Subscribe(subject, handler,
		nats.Durable(durable),
		nats.ManualAck(),
		nats.AckExplicit(),
		nats.DeliverAll(),
	)
}

// Close drains and closes the connection.
func (b *Bus) Close() {
	if b.nc != nil {
		_ = b.nc.Drain()
	}
}
