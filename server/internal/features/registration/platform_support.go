package registration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/weloin/ved/internal/features/platform"
	"github.com/weloin/ved/internal/platform/httpx"
)

// Support ticketing — the Support Console backend. The superadmin lists tickets, opens
// one to read the full message thread, replies, and moves it through open → pending →
// resolved. School-raised tickets/messages land in these tables via the sync hub (later
// slice); the platform side reads them and writes PLATFORM replies here.

// ───────────────────────────── DTOs ────────────────────────────────────────

type SupportTicket struct {
	ID            uuid.UUID  `json:"id"`
	TenantID      *uuid.UUID `json:"tenant_id,omitempty"`
	SchoolName    string     `json:"school_name"`
	Subject       string     `json:"subject"`
	Priority      string     `json:"priority"`
	Status        string     `json:"status"`
	LastMessageAt time.Time  `json:"last_message_at"`
	CreatedAt     time.Time  `json:"created_at"`
	MessageCount  int        `json:"message_count"`
}

type SupportMessage struct {
	ID         uuid.UUID `json:"id"`
	TicketID   uuid.UUID `json:"ticket_id"`
	AuthorType string    `json:"author_type"` // SCHOOL | PLATFORM
	AuthorName string    `json:"author_name"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

type SupportThread struct {
	Ticket   SupportTicket    `json:"ticket"`
	Messages []SupportMessage `json:"messages"`
}

// ───────────────────────────── service ─────────────────────────────────────

// ListSupportTickets returns tickets, newest-active first. `status` (optional) filters.
func (s *Service) ListSupportTickets(ctx context.Context, status string) ([]SupportTicket, error) {
	q := `SELECT t.id, t.tenant_id, t.school_name, t.subject, t.priority, t.status,
	             t.last_message_at, t.created_at,
	             (SELECT count(*) FROM control_plane.support_message m WHERE m.ticket_id = t.id)
	        FROM control_plane.support_ticket t`
	args := []any{}
	if status != "" && status != "all" {
		q += ` WHERE t.status = $1`
		args = append(args, status)
	}
	q += ` ORDER BY t.last_message_at DESC LIMIT 500`

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SupportTicket{}
	for rows.Next() {
		var t SupportTicket
		if err := rows.Scan(&t.ID, &t.TenantID, &t.SchoolName, &t.Subject, &t.Priority, &t.Status,
			&t.LastMessageAt, &t.CreatedAt, &t.MessageCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetSupportThread returns one ticket with its full ordered message thread.
func (s *Service) GetSupportThread(ctx context.Context, ticketID uuid.UUID) (SupportThread, error) {
	var th SupportThread
	err := s.pool.QueryRow(ctx,
		`SELECT t.id, t.tenant_id, t.school_name, t.subject, t.priority, t.status,
		        t.last_message_at, t.created_at,
		        (SELECT count(*) FROM control_plane.support_message m WHERE m.ticket_id = t.id)
		   FROM control_plane.support_ticket t WHERE t.id = $1`, ticketID).
		Scan(&th.Ticket.ID, &th.Ticket.TenantID, &th.Ticket.SchoolName, &th.Ticket.Subject,
			&th.Ticket.Priority, &th.Ticket.Status, &th.Ticket.LastMessageAt, &th.Ticket.CreatedAt,
			&th.Ticket.MessageCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return th, ErrNotFound
	}
	if err != nil {
		return th, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, ticket_id, author_type, author_name, body, created_at
		   FROM control_plane.support_message WHERE ticket_id = $1 ORDER BY created_at ASC`, ticketID)
	if err != nil {
		return th, err
	}
	defer rows.Close()
	th.Messages = []SupportMessage{}
	for rows.Next() {
		var m SupportMessage
		if err := rows.Scan(&m.ID, &m.TicketID, &m.AuthorType, &m.AuthorName, &m.Body, &m.CreatedAt); err != nil {
			return th, err
		}
		th.Messages = append(th.Messages, m)
	}
	return th, rows.Err()
}

type CreateTicketInput struct {
	TenantID   *uuid.UUID `json:"tenant_id,omitempty"`
	SchoolName string     `json:"school_name"`
	Subject    string     `json:"subject"`
	Priority   string     `json:"priority"`
	Body       string     `json:"body"`
}

// CreateSupportTicket opens a ticket plus its first message in one tx. Used by the console
// to log a ticket on a school's behalf; the school-app path writes the same rows via sync.
func (s *Service) CreateSupportTicket(ctx context.Context, authorName string, in CreateTicketInput) (SupportThread, error) {
	subject := strings.TrimSpace(in.Subject)
	body := strings.TrimSpace(in.Body)
	if subject == "" || body == "" {
		return SupportThread{}, fmt.Errorf("%w: subject and message are required", ErrInvalidInput)
	}
	priority := in.Priority
	if priority != "low" && priority != "high" {
		priority = "normal"
	}
	ticketID := uuid.Must(uuid.NewV7())
	err := inTx(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`INSERT INTO control_plane.support_ticket (id, tenant_id, school_name, subject, priority, status)
			 VALUES ($1, $2, $3, $4, $5, 'open')`,
			ticketID, in.TenantID, strings.TrimSpace(in.SchoolName), subject, priority); err != nil {
			return err
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO control_plane.support_message (id, ticket_id, author_type, author_name, body)
			 VALUES ($1, $2, 'SCHOOL', $3, $4)`,
			uuid.Must(uuid.NewV7()), ticketID, authorName, body)
		return err
	})
	if err != nil {
		return SupportThread{}, err
	}
	return s.GetSupportThread(ctx, ticketID)
}

// ReplyToTicket appends a PLATFORM message and reopens-as-pending (a reply awaits the
// school). Bumps last_message_at so the ticket sorts to the top of the queue.
func (s *Service) ReplyToTicket(ctx context.Context, ticketID uuid.UUID, authorName, body string) (SupportThread, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return SupportThread{}, fmt.Errorf("%w: message body required", ErrInvalidInput)
	}
	msgID := uuid.Must(uuid.NewV7())
	err := inTx(ctx, s.pool, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE control_plane.support_ticket
			    SET last_message_at = now(), updated_at = now(),
			        status = CASE WHEN status = 'resolved' THEN 'pending' ELSE status END
			  WHERE id = $1`, ticketID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		if _, err = tx.Exec(ctx,
			`INSERT INTO control_plane.support_message (id, ticket_id, author_type, author_name, body)
			 VALUES ($1, $2, 'PLATFORM', $3, $4)`,
			msgID, ticketID, authorName, body); err != nil {
			return err
		}
		// Push the reply (and the new ticket state) back to the school's node.
		if err := s.pushSupportMessage(ctx, tx, ticketID, msgID, authorName, body); err != nil {
			return err
		}
		return s.pushSupportTicket(ctx, tx, ticketID)
	})
	if err != nil {
		return SupportThread{}, err
	}
	return s.GetSupportThread(ctx, ticketID)
}

// SetTicketStatus moves a ticket through open / pending / resolved, and pushes the new
// status back to the school's node.
func (s *Service) SetTicketStatus(ctx context.Context, ticketID uuid.UUID, status string) error {
	if status != "open" && status != "pending" && status != "resolved" {
		return fmt.Errorf("%w: invalid status", ErrInvalidInput)
	}
	return inTx(ctx, s.pool, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE control_plane.support_ticket SET status = $2, updated_at = now() WHERE id = $1`,
			ticketID, status)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		return s.pushSupportTicket(ctx, tx, ticketID)
	})
}

// pushSupportMessage queues a cloud→node cp_outbox event for a PLATFORM reply, so it
// appears in the school's local thread. No-op when the ticket has no tenant (a ticket the
// superadmin logged on a school's behalf has nowhere to sync to yet).
func (s *Service) pushSupportMessage(ctx context.Context, tx pgx.Tx, ticketID, msgID uuid.UUID, authorName, body string) error {
	var tenantID *uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT tenant_id FROM control_plane.support_ticket WHERE id=$1`, ticketID).Scan(&tenantID); err != nil {
		return err
	}
	if tenantID == nil {
		return nil
	}
	payload, _ := json.Marshal(map[string]any{
		"ticket_id":   ticketID,
		"author_type": "PLATFORM",
		"author_name": authorName,
		"body":        body,
		"created_at":  time.Now().UTC().Format(time.RFC3339Nano),
	})
	_, err := tx.Exec(ctx,
		`INSERT INTO control_plane.cp_outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
		 VALUES ($1,$2,'support_message',$3,'CREATE',$4,$5,$6)`,
		uuid.Must(uuid.NewV7()), *tenantID, msgID, payload, cpHLC(), s.nodeID)
	return err
}

// pushSupportTicket queues a cloud→node cp_outbox snapshot of the ticket's current state
// (status / priority / subject / last activity) so the school's queue reflects it.
func (s *Service) pushSupportTicket(ctx context.Context, tx pgx.Tx, ticketID uuid.UUID) error {
	var (
		tenantID      *uuid.UUID
		subject       string
		priority      string
		status        string
		lastMessageAt time.Time
	)
	if err := tx.QueryRow(ctx,
		`SELECT tenant_id, subject, priority, status, last_message_at
		   FROM control_plane.support_ticket WHERE id=$1`, ticketID).
		Scan(&tenantID, &subject, &priority, &status, &lastMessageAt); err != nil {
		return err
	}
	if tenantID == nil {
		return nil
	}
	payload, _ := json.Marshal(map[string]any{
		"subject":         subject,
		"priority":        priority,
		"status":          status,
		"last_message_at": lastMessageAt.UTC().Format(time.RFC3339Nano),
	})
	_, err := tx.Exec(ctx,
		`INSERT INTO control_plane.cp_outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
		 VALUES ($1,$2,'support_ticket',$3,'UPDATE',$4,$5,$6)`,
		uuid.Must(uuid.NewV7()), *tenantID, ticketID, payload, cpHLC(), s.nodeID)
	return err
}

// SupportAnalytics powers the console's stat cards.
type SupportAnalytics struct {
	Open     int `json:"open"`
	Pending  int `json:"pending"`
	Resolved int `json:"resolved"`
}

func (s *Service) SupportAnalytics(ctx context.Context) (SupportAnalytics, error) {
	var a SupportAnalytics
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FILTER (WHERE status='open'),
		        count(*) FILTER (WHERE status='pending'),
		        count(*) FILTER (WHERE status='resolved')
		   FROM control_plane.support_ticket`).Scan(&a.Open, &a.Pending, &a.Resolved)
	return a, err
}

// ───────────────────────────── HTTP ────────────────────────────────────────

// RegisterPlatformSupport mounts the support console endpoints under the platform
// Authenticator group, gated by platform.support.manage.
func RegisterPlatformSupport(r chi.Router, svc *Service) {
	r.With(platform.RequirePermission(platform.PermSupportManage)).
		Get("/api/v1/platform/support/analytics", func(w http.ResponseWriter, req *http.Request) {
			a, err := svc.SupportAnalytics(req.Context())
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, a)
		})

	r.With(platform.RequirePermission(platform.PermSupportManage)).
		Get("/api/v1/platform/support/tickets", func(w http.ResponseWriter, req *http.Request) {
			list, err := svc.ListSupportTickets(req.Context(), req.URL.Query().Get("status"))
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"tickets": list})
		})

	r.With(platform.RequirePermission(platform.PermSupportManage)).
		Post("/api/v1/platform/support/tickets", func(w http.ResponseWriter, req *http.Request) {
			var in CreateTicketInput
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			th, err := svc.CreateSupportTicket(req.Context(), supportActorName(req), in)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, th)
		})

	r.With(platform.RequirePermission(platform.PermSupportManage)).
		Get("/api/v1/platform/support/tickets/{id}", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid ticket id")
				return
			}
			th, err := svc.GetSupportThread(req.Context(), id)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, th)
		})

	r.With(platform.RequirePermission(platform.PermSupportManage)).
		Post("/api/v1/platform/support/tickets/{id}/reply", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid ticket id")
				return
			}
			var in struct {
				Body string `json:"body"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			th, err := svc.ReplyToTicket(req.Context(), id, supportActorName(req), in.Body)
			if err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusCreated, th)
		})

	r.With(platform.RequirePermission(platform.PermSupportManage)).
		Post("/api/v1/platform/support/tickets/{id}/status", func(w http.ResponseWriter, req *http.Request) {
			id, err := uuid.Parse(chi.URLParam(req, "id"))
			if err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid ticket id")
				return
			}
			var in struct {
				Status string `json:"status"`
			}
			if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
				httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
				return
			}
			if err := svc.SetTicketStatus(req.Context(), id, in.Status); err != nil {
				writeErr(w, err)
				return
			}
			httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
		})
}

// supportActorName is a best-effort display name for the acting superadmin.
func supportActorName(req *http.Request) string {
	if id, ok := platform.IdentityFrom(req.Context()); ok && id.SuperAdmin {
		return "Support"
	}
	return "Support"
}
