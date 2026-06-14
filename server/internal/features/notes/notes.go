// Package notes is the walking-skeleton demo slice. It is deliberately trivial but
// exercises every M0 seam end-to-end so later slices are pure replication:
//
//   - tenant-scoped repository that arms RLS via set_config('app.tenant_id', …, true)
//   - the GOLDEN RULE: a mutation writes the domain row + an outbox event + an audit
//     row in ONE transaction (20-dataflow.md)
//   - UUIDv7 primary keys generated at the node (08-offline-sync.md)
//
// A real slice (students, finance, …) is this exact shape with different columns.
package notes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/httpx"
)

type Note struct {
	ID        uuid.UUID `json:"id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

// ---- Repository (data access; the only layer that touches tables) ----

type Repo struct {
	pool   *pgxpool.Pool
	nodeID uuid.UUID
}

func NewRepo(pool *pgxpool.Pool, nodeID uuid.UUID) *Repo { return &Repo{pool: pool, nodeID: nodeID} }

// withTenant runs fn inside a transaction with app.tenant_id set locally, so RLS
// policies filter every statement in the transaction.
func (r *Repo) withTenant(ctx context.Context, tenantID uuid.UUID, fn func(pgx.Tx) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after a successful Commit

	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return fmt.Errorf("set tenant: %w", err)
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Create inserts a note + its outbox event + an audit row in one transaction.
func (r *Repo) Create(ctx context.Context, tenantID uuid.UUID, body string) (Note, error) {
	var n Note
	err := r.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		id := uuid.Must(uuid.NewV7())
		hlc := nowHLC()

		if _, err := tx.Exec(ctx,
			`INSERT INTO note (id, tenant_id, body, hlc, version, origin_node_id)
			 VALUES ($1, $2, $3, $4, 1, $5)`,
			id, tenantID, body, hlc, r.nodeID); err != nil {
			return fmt.Errorf("insert note: %w", err)
		}

		payload, _ := json.Marshal(map[string]any{"id": id, "body": body})
		if _, err := tx.Exec(ctx,
			`INSERT INTO outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
			 VALUES ($1, $2, 'note', $3, 'CREATE', $4, $5, $6)`,
			uuid.Must(uuid.NewV7()), tenantID, id, payload, hlc, r.nodeID); err != nil {
			return fmt.Errorf("insert outbox: %w", err)
		}

		if _, err := tx.Exec(ctx,
			`INSERT INTO audit_log (id, tenant_id, action, resource_type, resource_id, after, origin_node_id)
			 VALUES ($1, $2, 'note.create', 'note', $3, $4, $5)`,
			uuid.Must(uuid.NewV7()), tenantID, id, payload, r.nodeID); err != nil {
			return fmt.Errorf("insert audit: %w", err)
		}

		n = Note{ID: id, Body: body, CreatedAt: time.Now().UTC()}
		return nil
	})
	return n, err
}

// List returns the tenant's live notes (RLS also scopes this; the WHERE is belt-and-braces).
func (r *Repo) List(ctx context.Context, tenantID uuid.UUID) ([]Note, error) {
	out := []Note{}
	err := r.withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, body, created_at FROM note WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var n Note
			if err := rows.Scan(&n.ID, &n.Body, &n.CreatedAt); err != nil {
				return err
			}
			out = append(out, n)
		}
		return rows.Err()
	})
	return out, err
}

// nowHLC is a placeholder Hybrid Logical Clock — a real HLC arrives in M6 ([08]).
func nowHLC() string { return strconv.FormatInt(time.Now().UnixNano(), 10) }

// ---- HTTP handler ----

// Register mounts the notes routes. The caller supplies a router group already
// wrapped in the auth + tenant-context middleware (see cmd/node), so this slice only
// declares its endpoints — the seams are provided.
func Register(r chi.Router, pool *pgxpool.Pool, nodeID uuid.UUID) {
	repo := NewRepo(pool, nodeID)

	r.Get("/api/v1/notes", func(w http.ResponseWriter, req *http.Request) {
		notes, err := repo.List(req.Context(), httpx.TenantID(req.Context()))
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"notes": notes})
	})

	r.Post("/api/v1/notes", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			Body string `json:"body"`
		}
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.Body == "" {
			httpx.Error(w, http.StatusBadRequest, "body is required")
			return
		}
		n, err := repo.Create(req.Context(), httpx.TenantID(req.Context()), in.Body)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		httpx.JSON(w, http.StatusCreated, n)
	})
}
