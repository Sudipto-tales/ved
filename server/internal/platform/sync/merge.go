// Conflict resolution — pillar 5 of no-data-loss sync (docs/08-offline-sync.md §5).
//
// VED is single-writer per school: one node owns its tenant's operational data, so true
// write-write conflicts are rare. Two places still need a deterministic merge:
//   - cloud→node config push-down (license/catalog/tenant config) — full-row snapshots, and
//   - a future second campus / node↔node replication.
//
// For both, the rule is row-level Last-Writer-Wins by HLC plus tombstone-aware deletes.
// Money/attendance/marks are NOT merged this way — they are append-only event ledgers (M5),
// so a payment can never be lost to an LWW overwrite.
//
// Granularity note: each row carries ONE hlc, so the merge is row-level LWW (the whole row
// the latest writer wrote wins). True per-field LWW would need a clock per column; that is a
// deliberate future refinement, not needed while schools are single-writer.
package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/weloin/ved/internal/platform/hlc"
)

// Action is what a merge decided to do with an inbound event.
type Action string

const (
	ActionInsert    Action = "INSERT"    // row absent → create it
	ActionUpdate    Action = "UPDATE"    // newer than stored → overwrite
	ActionTombstone Action = "TOMBSTONE" // newer DELETE → soft-delete
	ActionSkip      Action = "SKIP"      // older/equal HLC → keep what we have (LWW loser)
)

// Resolve is the pure LWW + tombstone decision. `found` is whether the row already exists
// locally; storedHLC its current stamp (ignored when !found); op the inbound operation.
// An inbound event only wins if its HLC is strictly greater than the stored one — equal
// stamps are treated as already-applied (idempotent), so a redelivery is a no-op.
func Resolve(found bool, storedHLC, incomingHLC, op string) Action {
	if !found {
		if op == "DELETE" {
			return ActionSkip // nothing to delete; a tombstone for an unknown row is a no-op
		}
		return ActionInsert
	}
	if hlc.Compare(incomingHLC, storedHLC) <= 0 {
		return ActionSkip // stale or duplicate → the local (later) write wins
	}
	if op == "DELETE" {
		return ActionTombstone
	}
	return ActionUpdate
}

// RowSpec describes a table that participates in row-level sync. Table + Columns must be
// trusted identifiers (a code-defined registry, never user input) — they are interpolated
// into SQL after an identifier check.
type RowSpec struct {
	Table   string   // e.g. "tenant_profile"
	Columns []string // the mutable columns carried as a full-row snapshot in the payload
}

var identRe = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

func (s RowSpec) validate() error {
	if !identRe.MatchString(s.Table) {
		return fmt.Errorf("unsafe table identifier %q", s.Table)
	}
	for _, c := range s.Columns {
		if !identRe.MatchString(c) {
			return fmt.Errorf("unsafe column identifier %q", c)
		}
	}
	return nil
}

// ApplyRow merges one full-row-snapshot event into the local table per LWW + tombstone, and
// returns what it did. The caller runs it inside the inbox transaction (after the inbox
// dedupe insert), with app.tenant_id already set so RLS scopes the read/write. The payload
// must be a JSON object whose keys include every column in spec.Columns (a full-row snapshot
// — this path is for config push-down / node↔node, NOT the sparse domain events that flow
// node→cloud as history).
func ApplyRow(ctx context.Context, tx pgx.Tx, spec RowSpec, env Envelope) (Action, error) {
	if err := spec.validate(); err != nil {
		return ActionSkip, err
	}

	var storedHLC string
	var found bool
	err := tx.QueryRow(ctx,
		fmt.Sprintf(`SELECT hlc FROM %s WHERE id = $1`, spec.Table), env.AggregateID).
		Scan(&storedHLC)
	switch {
	case err == nil:
		found = true
	case err == pgx.ErrNoRows:
		found = false
	default:
		return ActionSkip, fmt.Errorf("read stored row: %w", err)
	}

	action := Resolve(found, storedHLC, env.HLC, env.Op)
	switch action {
	case ActionSkip:
		return action, nil

	case ActionTombstone:
		if _, err := tx.Exec(ctx,
			fmt.Sprintf(`UPDATE %s SET deleted_at = now(), hlc = $2, version = version + 1 WHERE id = $1`, spec.Table),
			env.AggregateID, env.HLC); err != nil {
			return ActionSkip, fmt.Errorf("tombstone: %w", err)
		}
		return action, nil

	case ActionInsert, ActionUpdate:
		vals, err := decodeColumns(env.Payload, spec.Columns)
		if err != nil {
			return ActionSkip, err
		}
		if action == ActionInsert {
			return action, insertRow(ctx, tx, spec, env, vals)
		}
		return action, updateRow(ctx, tx, spec, env, vals)
	}
	return ActionSkip, nil
}

func decodeColumns(payload json.RawMessage, cols []string) (map[string]any, error) {
	var m map[string]any
	if err := json.Unmarshal(payload, &m); err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}
	out := make(map[string]any, len(cols))
	for _, c := range cols {
		v, ok := m[c]
		if !ok {
			return nil, fmt.Errorf("payload missing column %q (not a full-row snapshot)", c)
		}
		out[c] = v
	}
	return out, nil
}

func insertRow(ctx context.Context, tx pgx.Tx, spec RowSpec, env Envelope, vals map[string]any) error {
	cols := []string{"id", "tenant_id"}
	args := []any{env.AggregateID, env.TenantID}
	for _, c := range spec.Columns {
		cols = append(cols, c)
		args = append(args, vals[c])
	}
	cols = append(cols, "hlc", "origin_node_id")
	args = append(args, env.HLC, env.OriginNodeID)

	ph := make([]string, len(args))
	for i := range args {
		ph[i] = fmt.Sprintf("$%d", i+1)
	}
	sql := fmt.Sprintf(`INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (id) DO NOTHING`,
		spec.Table, strings.Join(cols, ", "), strings.Join(ph, ", "))
	if _, err := tx.Exec(ctx, sql, args...); err != nil {
		return fmt.Errorf("insert row: %w", err)
	}
	return nil
}

func updateRow(ctx context.Context, tx pgx.Tx, spec RowSpec, env Envelope, vals map[string]any) error {
	set := make([]string, 0, len(spec.Columns)+3)
	args := make([]any, 0, len(spec.Columns)+2)
	args = append(args, env.AggregateID) // $1 = id
	i := 2
	for _, c := range spec.Columns {
		set = append(set, fmt.Sprintf("%s = $%d", c, i))
		args = append(args, vals[c])
		i++
	}
	set = append(set, fmt.Sprintf("hlc = $%d", i))
	args = append(args, env.HLC)
	// A newer non-delete write resurrects a tombstoned row (LWW: the latest writer wins).
	set = append(set, "deleted_at = NULL", "version = version + 1")
	sql := fmt.Sprintf(`UPDATE %s SET %s WHERE id = $1`, spec.Table, strings.Join(set, ", "))
	if _, err := tx.Exec(ctx, sql, args...); err != nil {
		return fmt.Errorf("update row: %w", err)
	}
	return nil
}
