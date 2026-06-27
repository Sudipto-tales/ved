//go:build integration

// Slice 3 — the cloud→node round-trip. A platform reply must reach the school's node:
// ReplyToTicket writes the reply + cp_outbox events; applying those events (as the cloud
// relay + node configsync would) materializes the PLATFORM message and the new ticket
// status into the node's local support_* tables.
//
// Run: ./ved.sh test ./internal/features/registration/...
package registration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/features/configsync"
	syncpkg "github.com/weloin/ved/internal/platform/sync"
	"github.com/weloin/ved/internal/platform/testdb"
)

func TestSupportReplySyncsToNode(t *testing.T) {
	pool := testdb.ControlPlanePool(t) // owner pool: both planes, RLS bypassed
	ctx := context.Background()
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(pool, nodeID, nil)

	tenantID := uuid.Must(uuid.NewV7())
	ticketID := uuid.Must(uuid.NewV7())

	// A provisioned tenant + a school-raised ticket that has already synced UP: it exists
	// both in the console (control_plane) and on the node (tenant plane).
	_, err := pool.Exec(ctx,
		`INSERT INTO control_plane.tenant (id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE')`,
		tenantID, "sync-"+tenantID.String(), "Sync School")
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO control_plane.support_ticket (id, tenant_id, school_name, subject, priority, status)
		 VALUES ($1,$2,'Sync School','Need help','normal','resolved')`, ticketID, tenantID)
	require.NoError(t, err)
	// Node-side ticket (low hlc so the cloud's later snapshot wins LWW).
	_, err = pool.Exec(ctx,
		`INSERT INTO support_ticket (id, tenant_id, subject, priority, status, hlc, origin_node_id)
		 VALUES ($1,$2,'Need help','normal','resolved','1000000000000000000',$3)`, ticketID, tenantID, nodeID)
	require.NoError(t, err)

	// Superadmin replies → control_plane gets the PLATFORM message + ticket goes pending,
	// and two cp_outbox events are queued for the node.
	th, err := svc.ReplyToTicket(ctx, ticketID, "Support", "Here is the fix.")
	require.NoError(t, err)
	assert.Equal(t, "pending", th.Ticket.Status)

	var outboxCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM control_plane.cp_outbox WHERE tenant_id=$1 AND aggregate LIKE 'support_%'`, tenantID).
		Scan(&outboxCount))
	assert.Equal(t, 2, outboxCount, "a support_message + a support_ticket cp_outbox event")

	// Drain cp_outbox and apply each event the way the cloud relay + node configsync do.
	rows, err := pool.Query(ctx,
		`SELECT id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id, created_at
		   FROM control_plane.cp_outbox WHERE tenant_id=$1 ORDER BY aggregate`, tenantID)
	require.NoError(t, err)
	var envs []syncpkg.Envelope
	for rows.Next() {
		var e syncpkg.Envelope
		require.NoError(t, rows.Scan(&e.EventID, &e.TenantID, &e.Aggregate, &e.AggregateID, &e.Op,
			&e.Payload, &e.HLC, &e.OriginNodeID, &e.CreatedAt))
		envs = append(envs, e)
	}
	rows.Close()
	require.NoError(t, rows.Err())
	for _, e := range envs {
		_, err := syncpkg.ApplyConfigEvent(ctx, pool, configsync.DefaultRegistry, e)
		require.NoError(t, err, "apply %s", e.Aggregate)
	}

	// The reply landed in the school's local thread…
	var body, status string
	var when time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT body FROM support_message WHERE ticket_id=$1 AND author_type='PLATFORM'`, ticketID).Scan(&body))
	assert.Equal(t, "Here is the fix.", body)

	// …and the node ticket reflects the new status.
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, last_message_at FROM support_ticket WHERE id=$1`, ticketID).Scan(&status, &when))
	assert.Equal(t, "pending", status, "platform status change synced to the node")
}
