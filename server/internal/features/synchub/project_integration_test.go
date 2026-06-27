//go:build integration

// Integration test for the support projection — proves a synced support_ticket /
// support_message event materializes into the control_plane.support_* read model the
// Support Console queries, idempotently.
//
// Run: ./ved.sh test ./internal/features/synchub/...
package synchub

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	syncpkg "github.com/weloin/ved/internal/platform/sync"
	"github.com/weloin/ved/internal/platform/testdb"
)

func TestProjectSupport(t *testing.T) {
	pool := testdb.ControlPlanePool(t)
	ctx := context.Background()

	// A provisioned tenant must exist (support_ticket.tenant_id FKs control_plane.tenant).
	tenantID := uuid.Must(uuid.NewV7())
	_, err := pool.Exec(ctx,
		`INSERT INTO control_plane.tenant (id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE')`,
		tenantID, "proj-"+tenantID.String(), "Projected School")
	require.NoError(t, err)

	ticketID := uuid.Must(uuid.NewV7())
	msgID := uuid.Must(uuid.NewV7())
	now := time.Now().UTC()

	ticketPayload, _ := json.Marshal(map[string]any{
		"id": ticketID, "tenant_id": tenantID, "school_name": "Projected School",
		"subject": "Sync issue", "priority": "high", "status": "open",
		"last_message_at": now, "created_at": now,
	})
	msgPayload, _ := json.Marshal(map[string]any{
		"id": msgID, "ticket_id": ticketID, "author_type": "SCHOOL",
		"author_name": "Asha", "body": "Please help.", "created_at": now,
	})

	ticketEnv := syncpkg.Envelope{Aggregate: "support_ticket", AggregateID: ticketID, Payload: ticketPayload}
	msgEnv := syncpkg.Envelope{Aggregate: "support_message", AggregateID: msgID, Payload: msgPayload}

	require.NoError(t, Project(ctx, pool, ticketEnv))
	require.NoError(t, Project(ctx, pool, msgEnv))

	// Projected into the read model.
	var subject, body string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT subject FROM control_plane.support_ticket WHERE id=$1`, ticketID).Scan(&subject))
	assert.Equal(t, "Sync issue", subject)
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT body FROM control_plane.support_message WHERE id=$1`, msgID).Scan(&body))
	assert.Equal(t, "Please help.", body)

	// Idempotent: replaying both events changes nothing and errors nothing.
	require.NoError(t, Project(ctx, pool, ticketEnv))
	require.NoError(t, Project(ctx, pool, msgEnv))
	var msgCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM control_plane.support_message WHERE ticket_id=$1`, ticketID).Scan(&msgCount))
	assert.Equal(t, 1, msgCount, "replay does not duplicate the message")
}
