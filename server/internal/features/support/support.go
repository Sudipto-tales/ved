// Package support is the school-side support slice (M-support): a school admin raises a
// ticket and exchanges messages with the platform. It is tenant-scoped under RLS and
// sync-enabled — every write follows the golden rule (row + outbox + audit in one tx), so
// the node→cloud relay projects tickets/messages into control_plane.support_* where the
// Support Console reads them. Platform replies arrive back via cloud→node sync (next slice).
package support

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/authz"
	"github.com/weloin/ved/internal/platform/httpx"
	"github.com/weloin/ved/internal/platform/onboarding"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrInvalidInput = errors.New("invalid input")
)

// ---- wire shapes -----------------------------------------------------------------

type Ticket struct {
	ID            uuid.UUID `json:"id"`
	Subject       string    `json:"subject"`
	Priority      string    `json:"priority"`
	Status        string    `json:"status"`
	LastMessageAt time.Time `json:"last_message_at"`
	CreatedAt     time.Time `json:"created_at"`
	MessageCount  int       `json:"message_count"`
}

type Message struct {
	ID         uuid.UUID `json:"id"`
	TicketID   uuid.UUID `json:"ticket_id"`
	AuthorType string    `json:"author_type"`
	AuthorName string    `json:"author_name"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

type Thread struct {
	Ticket   Ticket    `json:"ticket"`
	Messages []Message `json:"messages"`
}

// ---- sync payloads (what synchub projects into control_plane.support_*) ----------

type ticketPayload struct {
	ID            uuid.UUID `json:"id"`
	TenantID      uuid.UUID `json:"tenant_id"`
	SchoolName    string    `json:"school_name"`
	Subject       string    `json:"subject"`
	Priority      string    `json:"priority"`
	Status        string    `json:"status"`
	LastMessageAt time.Time `json:"last_message_at"`
	CreatedAt     time.Time `json:"created_at"`
}

type messagePayload struct {
	ID         uuid.UUID `json:"id"`
	TicketID   uuid.UUID `json:"ticket_id"`
	AuthorType string    `json:"author_type"`
	AuthorName string    `json:"author_name"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

// ---- service ---------------------------------------------------------------------

type Service struct {
	pool   *pgxpool.Pool
	nodeID uuid.UUID
}

func NewService(pool *pgxpool.Pool, nodeID uuid.UUID) *Service {
	return &Service{pool: pool, nodeID: nodeID}
}

func (s *Service) withTenant(ctx context.Context, tenantID uuid.UUID, fn func(pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return fmt.Errorf("set tenant: %w", err)
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type CreateInput struct {
	Subject  string `json:"subject"`
	Priority string `json:"priority"`
	Body     string `json:"body"`
}

// Create opens a ticket plus its first SCHOOL message. Two writes, each row + outbox +
// audit, all in ONE tx (the golden rule). The outbox payloads are full row snapshots so
// the cloud hub can project them.
func (s *Service) Create(ctx context.Context, tenantID, actor uuid.UUID, in CreateInput) (Thread, error) {
	subject := strings.TrimSpace(in.Subject)
	body := strings.TrimSpace(in.Body)
	if subject == "" || body == "" {
		return Thread{}, fmt.Errorf("%w: subject and message are required", ErrInvalidInput)
	}
	priority := in.Priority
	if priority != "low" && priority != "high" {
		priority = "normal"
	}
	ticketID := uuid.Must(uuid.NewV7())
	msgID := uuid.Must(uuid.NewV7())
	hlc := nowHLC()
	now := time.Now().UTC()

	err := s.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		schoolName, authorName := s.actorContext(ctx, tx, actor)

		if _, err := tx.Exec(ctx,
			`INSERT INTO support_ticket (id, tenant_id, subject, priority, status, last_message_at, created_by, hlc, origin_node_id)
			 VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8)`,
			ticketID, tenantID, subject, priority, now, actorOrNil(actor), hlc, s.nodeID); err != nil {
			return err
		}
		tp, _ := json.Marshal(ticketPayload{
			ID: ticketID, TenantID: tenantID, SchoolName: schoolName, Subject: subject,
			Priority: priority, Status: "open", LastMessageAt: now, CreatedAt: now,
		})
		if err := writeOutboxAudit(ctx, tx, tenantID, "support_ticket", ticketID, "CREATE", "support.ticket.created", actor, tp, hlc, s.nodeID); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx,
			`INSERT INTO support_message (id, tenant_id, ticket_id, author_type, author_name, body, created_at, created_by, hlc, origin_node_id)
			 VALUES ($1,$2,$3,'SCHOOL',$4,$5,$6,$7,$8,$9)`,
			msgID, tenantID, ticketID, authorName, body, now, actorOrNil(actor), hlc, s.nodeID); err != nil {
			return err
		}
		mp, _ := json.Marshal(messagePayload{
			ID: msgID, TicketID: ticketID, AuthorType: "SCHOOL", AuthorName: authorName, Body: body, CreatedAt: now,
		})
		return writeOutboxAudit(ctx, tx, tenantID, "support_message", msgID, "CREATE", "support.message.created", actor, mp, hlc, s.nodeID)
	})
	if err != nil {
		return Thread{}, err
	}
	return s.Get(ctx, tenantID, ticketID)
}

// AddMessage appends a SCHOOL message to an existing ticket (row + outbox + audit), and
// bumps the ticket's last_message_at so it sorts to the top.
func (s *Service) AddMessage(ctx context.Context, tenantID, actor, ticketID uuid.UUID, body string) (Thread, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return Thread{}, fmt.Errorf("%w: message body required", ErrInvalidInput)
	}
	msgID := uuid.Must(uuid.NewV7())
	hlc := nowHLC()
	now := time.Now().UTC()

	err := s.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		_, authorName := s.actorContext(ctx, tx, actor)

		ct, err := tx.Exec(ctx,
			`UPDATE support_ticket SET last_message_at=$2, updated_at=now(), version=version+1
			  WHERE id=$1 AND deleted_at IS NULL`, ticketID, now)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}

		if _, err := tx.Exec(ctx,
			`INSERT INTO support_message (id, tenant_id, ticket_id, author_type, author_name, body, created_at, created_by, hlc, origin_node_id)
			 VALUES ($1,$2,$3,'SCHOOL',$4,$5,$6,$7,$8,$9)`,
			msgID, tenantID, ticketID, authorName, body, now, actorOrNil(actor), hlc, s.nodeID); err != nil {
			return err
		}
		mp, _ := json.Marshal(messagePayload{
			ID: msgID, TicketID: ticketID, AuthorType: "SCHOOL", AuthorName: authorName, Body: body, CreatedAt: now,
		})
		return writeOutboxAudit(ctx, tx, tenantID, "support_message", msgID, "CREATE", "support.message.created", actor, mp, hlc, s.nodeID)
	})
	if err != nil {
		return Thread{}, err
	}
	return s.Get(ctx, tenantID, ticketID)
}

// List returns the tenant's tickets, newest-active first.
func (s *Service) List(ctx context.Context, tenantID uuid.UUID) ([]Ticket, error) {
	out := []Ticket{}
	err := s.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT t.id, t.subject, t.priority, t.status, t.last_message_at, t.created_at,
			        (SELECT count(*) FROM support_message m WHERE m.ticket_id = t.id AND m.deleted_at IS NULL)
			   FROM support_ticket t
			  WHERE t.deleted_at IS NULL
			  ORDER BY t.last_message_at DESC LIMIT 500`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var t Ticket
			if err := rows.Scan(&t.ID, &t.Subject, &t.Priority, &t.Status, &t.LastMessageAt, &t.CreatedAt, &t.MessageCount); err != nil {
				return err
			}
			out = append(out, t)
		}
		return rows.Err()
	})
	return out, err
}

// Get returns one ticket with its full message thread.
func (s *Service) Get(ctx context.Context, tenantID, ticketID uuid.UUID) (Thread, error) {
	var th Thread
	err := s.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			`SELECT t.id, t.subject, t.priority, t.status, t.last_message_at, t.created_at,
			        (SELECT count(*) FROM support_message m WHERE m.ticket_id = t.id AND m.deleted_at IS NULL)
			   FROM support_ticket t WHERE t.id = $1 AND t.deleted_at IS NULL`, ticketID).
			Scan(&th.Ticket.ID, &th.Ticket.Subject, &th.Ticket.Priority, &th.Ticket.Status,
				&th.Ticket.LastMessageAt, &th.Ticket.CreatedAt, &th.Ticket.MessageCount)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT id, ticket_id, author_type, author_name, body, created_at
			   FROM support_message WHERE ticket_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`, ticketID)
		if err != nil {
			return err
		}
		defer rows.Close()
		th.Messages = []Message{}
		for rows.Next() {
			var m Message
			if err := rows.Scan(&m.ID, &m.TicketID, &m.AuthorType, &m.AuthorName, &m.Body, &m.CreatedAt); err != nil {
				return err
			}
			th.Messages = append(th.Messages, m)
		}
		return rows.Err()
	})
	return th, err
}

// actorContext returns the tenant's display name (for the ticket's school_name on the
// cloud side) and the acting user's roster label (message author). Best-effort.
func (s *Service) actorContext(ctx context.Context, tx pgx.Tx, actor uuid.UUID) (school, author string) {
	_ = tx.QueryRow(ctx, `SELECT display_name FROM tenant_profile LIMIT 1`).Scan(&school)
	if actor != uuid.Nil {
		var login string
		if err := tx.QueryRow(ctx,
			`SELECT u.login_identifier FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = $1`, actor).
			Scan(&login); err == nil {
			author = onboarding.NameFromHandle(login)
		}
	}
	if author == "" {
		author = "School"
	}
	return school, author
}

// ---- golden-rule helper ----------------------------------------------------------

func writeOutboxAudit(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID, aggregate string, aggID uuid.UUID, op, action string, actor uuid.UUID, payload []byte, hlc string, nodeID uuid.UUID) error {
	if _, err := tx.Exec(ctx,
		`INSERT INTO outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		uuid.Must(uuid.NewV7()), tenantID, aggregate, aggID, op, payload, hlc, nodeID); err != nil {
		return fmt.Errorf("insert outbox: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO audit_log (id, tenant_id, actor_membership_id, action, resource_type, resource_id, after, origin_node_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		uuid.Must(uuid.NewV7()), tenantID, actorOrNil(actor), action, aggregate, aggID, payload, nodeID); err != nil {
		return fmt.Errorf("insert audit: %w", err)
	}
	return nil
}

func actorOrNil(a uuid.UUID) *uuid.UUID {
	if a == uuid.Nil {
		return nil
	}
	return &a
}

func nowHLC() string { return strconv.FormatInt(time.Now().UnixNano(), 10) }

// ---- HTTP ------------------------------------------------------------------------

// Register mounts the school-side support endpoints on the auth + tenant-scoped group.
// No special permission: any authenticated member of the tenant may contact support.
func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID, _ *authz.Resolver) {
	svc := NewService(pool, nodeID)

	r.Get("/api/v1/support/tickets", func(w http.ResponseWriter, req *http.Request) {
		list, err := svc.List(req.Context(), httpx.TenantID(req.Context()))
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"tickets": list})
	})

	r.Post("/api/v1/support/tickets", func(w http.ResponseWriter, req *http.Request) {
		var in CreateInput
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		th, err := svc.Create(req.Context(), httpx.TenantID(req.Context()), actorID(req), in)
		if err != nil {
			writeErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, th)
	})

	r.Get("/api/v1/support/tickets/{id}", func(w http.ResponseWriter, req *http.Request) {
		id, err := uuid.Parse(chi.URLParam(req, "id"))
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid ticket id")
			return
		}
		th, err := svc.Get(req.Context(), httpx.TenantID(req.Context()), id)
		if err != nil {
			writeErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, th)
	})

	r.Post("/api/v1/support/tickets/{id}/messages", func(w http.ResponseWriter, req *http.Request) {
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
		th, err := svc.AddMessage(req.Context(), httpx.TenantID(req.Context()), actorID(req), id, in.Body)
		if err != nil {
			writeErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusCreated, th)
	})
}

func actorID(req *http.Request) uuid.UUID {
	ident, ok := httpx.IdentityFrom(req.Context())
	if !ok {
		return uuid.Nil
	}
	tenantID := httpx.TenantID(req.Context())
	for _, m := range ident.Memberships {
		if m.TenantID == tenantID {
			return m.MembershipID
		}
	}
	return uuid.Nil
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.Error(w, http.StatusNotFound, "not found")
	case errors.Is(err, ErrInvalidInput):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}
