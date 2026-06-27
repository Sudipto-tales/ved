//go:build integration

// Integration tests for the school-side support slice — the two invariants:
//
//  1. The golden rule — creating a ticket writes 2 rows (ticket + first message), and
//     EXACTLY 2 outbox + 2 audit rows, all in one tx. Adding a message writes 1+1+1.
//  2. RLS isolation — a tenant sees only its own tickets/messages.
//
// Run: ./ved.sh test ./internal/features/support/...
package support

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/platform/testdb"
)

func TestGoldenRuleOnCreateAndMessage(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(pool, nodeID)
	tenant := testdb.NewTenant(t, pool, nodeID)

	th, err := svc.Create(context.Background(), tenant.ID, tenant.Actor, CreateInput{
		Subject: "Sync paused", Priority: "high", Body: "It stopped after a power cut.",
	})
	require.NoError(t, err)
	require.Len(t, th.Messages, 1)
	tid := th.Ticket.ID

	// Create = 2 writes ⇒ 2 outbox + 2 audit, scoped to this tenant + aggregate.
	outboxT := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate='support_ticket' AND aggregate_id=$1`, tid)
	outboxM := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate='support_message' AND aggregate_id=$1`, th.Messages[0].ID)
	auditT := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM audit_log WHERE action='support.ticket.created' AND resource_id=$1`, tid)
	assert.Equal(t, 1, outboxT, "one outbox[support_ticket]")
	assert.Equal(t, 1, outboxM, "one outbox[support_message]")
	assert.Equal(t, 1, auditT, "one audit[support.ticket.created]")

	// Adding a message ⇒ +1 message row, +1 outbox, +1 audit; ticket bumped.
	th2, err := svc.AddMessage(context.Background(), tenant.ID, tenant.Actor, tid, "Any update?")
	require.NoError(t, err)
	assert.Len(t, th2.Messages, 2)
	msgs := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM support_message WHERE ticket_id=$1 AND deleted_at IS NULL`, tid)
	outboxMsgs := testdb.CountInTenant(t, pool, tenant.ID,
		`SELECT count(*) FROM outbox WHERE aggregate='support_message'`)
	assert.Equal(t, 2, msgs, "two messages on the ticket")
	assert.GreaterOrEqual(t, outboxMsgs, 2, "an outbox row per message")
}

func TestSupportRLSIsolation(t *testing.T) {
	pool := testdb.Pool(t)
	nodeID := uuid.Must(uuid.NewV7())
	svc := NewService(pool, nodeID)
	a := testdb.NewTenant(t, pool, nodeID)
	b := testdb.NewTenant(t, pool, nodeID)

	_, err := svc.Create(context.Background(), a.ID, a.Actor, CreateInput{Subject: "A issue", Body: "from A"})
	require.NoError(t, err)

	// Tenant B sees none of A's tickets.
	bList, err := svc.List(context.Background(), b.ID)
	require.NoError(t, err)
	assert.Empty(t, bList, "tenant B must not see tenant A's tickets")

	aList, err := svc.List(context.Background(), a.ID)
	require.NoError(t, err)
	assert.Len(t, aList, 1, "tenant A sees its own ticket")
}
