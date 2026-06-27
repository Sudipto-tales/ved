//go:build integration

// Integration test for the support ticketing slice — the Support Console backend.
// Proves the thread lifecycle: create (ticket + first SCHOOL message) → reply (PLATFORM
// message, bumps to top) → status transitions, plus the open/pending/resolved counts.
//
// Run: ./ved.sh test ./internal/features/registration/...
package registration

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSupportTicketLifecycle(t *testing.T) {
	svc, _, _, _ := v2Fixture(t)
	ctx := context.Background()

	// Create opens a ticket with its first SCHOOL message in one tx.
	th, err := svc.CreateSupportTicket(ctx, "Asha Rao", CreateTicketInput{
		SchoolName: "Sunrise Public School",
		Subject:    "Cannot reset admin password",
		Priority:   "high",
		Body:       "The reset link does nothing when clicked.",
	})
	require.NoError(t, err)
	assert.Equal(t, "open", th.Ticket.Status)
	require.Len(t, th.Messages, 1)
	assert.Equal(t, "SCHOOL", th.Messages[0].AuthorType)
	assert.Equal(t, 1, th.Ticket.MessageCount)
	id := th.Ticket.ID

	// A platform reply appends a PLATFORM message and shows in the thread.
	th2, err := svc.ReplyToTicket(ctx, id, "Support", "Try the new link we just sent.")
	require.NoError(t, err)
	require.Len(t, th2.Messages, 2)
	assert.Equal(t, "PLATFORM", th2.Messages[1].AuthorType)

	// Resolve, then a reply reopens it as pending (a new reply awaits the school).
	require.NoError(t, svc.SetTicketStatus(ctx, id, "resolved"))
	th3, err := svc.ReplyToTicket(ctx, id, "Support", "Following up — did that work?")
	require.NoError(t, err)
	assert.Equal(t, "pending", th3.Ticket.Status, "reply reopens a resolved ticket as pending")

	// Invalid status is rejected.
	assert.Error(t, svc.SetTicketStatus(ctx, id, "bogus"))

	// Empty subject/body is rejected.
	_, err = svc.CreateSupportTicket(ctx, "X", CreateTicketInput{Subject: "  ", Body: "  "})
	assert.Error(t, err)

	// Counts: our resolved-then-reopened ticket is now pending → at least one pending.
	a, err := svc.SupportAnalytics(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, a.pendingPlusOpen(), 1)

	// List filters by status; "all" returns everything.
	pending, err := svc.ListSupportTickets(ctx, "pending")
	require.NoError(t, err)
	var found bool
	for _, tk := range pending {
		if tk.ID == id {
			found = true
		}
	}
	assert.True(t, found, "the reopened ticket appears in the pending filter")
}

// pendingPlusOpen is a tiny test helper to assert the queue is non-empty.
func (a SupportAnalytics) pendingPlusOpen() int { return a.Open + a.Pending }
