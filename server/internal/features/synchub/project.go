package synchub

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	syncpkg "github.com/weloin/ved/internal/platform/sync"
)

// Project materializes the domain aggregates the control plane serves directly into their
// control_plane.* tables. The generic sync_event log (synchub.Start) keeps the full
// history; this builds the queryable read model the Support Console needs.
//
// It is idempotent (upsert on PK), so duplicate deliveries are no-ops. Events for
// aggregates without a projection are ignored (the sync_event log already captured them).
func Project(ctx context.Context, pool *pgxpool.Pool, e syncpkg.Envelope) error {
	switch e.Aggregate {
	case "support_ticket":
		return projectSupportTicket(ctx, pool, e.Payload)
	case "support_message":
		return projectSupportMessage(ctx, pool, e.Payload)
	default:
		return nil
	}
}

type supportTicketPayload struct {
	ID            uuid.UUID `json:"id"`
	TenantID      uuid.UUID `json:"tenant_id"`
	SchoolName    string    `json:"school_name"`
	Subject       string    `json:"subject"`
	Priority      string    `json:"priority"`
	Status        string    `json:"status"`
	LastMessageAt time.Time `json:"last_message_at"`
	CreatedAt     time.Time `json:"created_at"`
}

func projectSupportTicket(ctx context.Context, pool *pgxpool.Pool, raw json.RawMessage) error {
	var p supportTicketPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil // unparseable payload: drop (don't loop forever)
	}
	// Upsert: a school-side status/last_message change re-syncs and updates the row, but
	// never clobbers a platform-set status (the cloud is authoritative on status).
	_, err := pool.Exec(ctx,
		`INSERT INTO control_plane.support_ticket
		   (id, tenant_id, school_name, subject, priority, status, last_message_at, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 ON CONFLICT (id) DO UPDATE
		   SET subject = EXCLUDED.subject,
		       priority = EXCLUDED.priority,
		       last_message_at = GREATEST(control_plane.support_ticket.last_message_at, EXCLUDED.last_message_at),
		       updated_at = now()`,
		p.ID, nullableUUID(p.TenantID), p.SchoolName, p.Subject, p.Priority, p.Status, p.LastMessageAt, p.CreatedAt)
	return err
}

type supportMessagePayload struct {
	ID         uuid.UUID `json:"id"`
	TicketID   uuid.UUID `json:"ticket_id"`
	AuthorType string    `json:"author_type"`
	AuthorName string    `json:"author_name"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

func projectSupportMessage(ctx context.Context, pool *pgxpool.Pool, raw json.RawMessage) error {
	var p supportMessagePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil
	}
	// Bump the ticket's activity, then insert the message. If the ticket hasn't projected
	// yet the FK fails → the caller redelivers until it has.
	if _, err := pool.Exec(ctx,
		`UPDATE control_plane.support_ticket
		    SET last_message_at = GREATEST(last_message_at, $2), updated_at = now()
		  WHERE id = $1`, p.TicketID, p.CreatedAt); err != nil {
		return err
	}
	_, err := pool.Exec(ctx,
		`INSERT INTO control_plane.support_message (id, ticket_id, author_type, author_name, body, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 ON CONFLICT (id) DO NOTHING`,
		p.ID, p.TicketID, p.AuthorType, p.AuthorName, p.Body, p.CreatedAt)
	return err
}

func nullableUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}
