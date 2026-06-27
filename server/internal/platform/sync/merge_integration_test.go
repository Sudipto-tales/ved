//go:build integration

// Integration tests for the pillar-5 row applier against a real table (the demo `note`,
// which has the full sync column shape: id/tenant_id/hlc/version/deleted_at). They prove
// row-level LWW + tombstone end to end: newer wins, older is a no-op, a delete tombstones,
// a newer write resurrects, and a stale delete can't bury a live row.
//
// Run: ./ved.sh test   (or: go test -tags=integration ./internal/platform/sync/...)
package sync

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/weloin/ved/internal/platform/hlc"
	"github.com/weloin/ved/internal/platform/testdb"
)

func noteEnv(tenant, id, node uuid.UUID, op, body, h string) Envelope {
	payload, _ := json.Marshal(map[string]any{"body": body})
	return Envelope{
		EventID: uuid.Must(uuid.NewV7()), TenantID: tenant, Aggregate: "note",
		AggregateID: id, Op: op, Payload: payload, HLC: h, OriginNodeID: node,
	}
}

func apply(t *testing.T, pool *pgxpool.Pool, tenant uuid.UUID, env Envelope) Action {
	t.Helper()
	var act Action
	err := testdb.InTenant(context.Background(), pool, tenant, func(tx pgx.Tx) error {
		a, e := ApplyRow(context.Background(), tx, RowSpec{Table: "note", Columns: []string{"body"}}, env)
		act = a
		return e
	})
	require.NoError(t, err)
	return act
}

func readNote(t *testing.T, pool *pgxpool.Pool, tenant, id uuid.UUID) (body string, deleted bool) {
	t.Helper()
	err := testdb.InTenant(context.Background(), pool, tenant, func(tx pgx.Tx) error {
		var del *string
		if err := tx.QueryRow(context.Background(),
			`SELECT body, deleted_at::text FROM note WHERE id=$1`, id).Scan(&body, &del); err != nil {
			return err
		}
		deleted = del != nil
		return nil
	})
	require.NoError(t, err)
	return
}

func TestApplyRow_LWWAndTombstone(t *testing.T) {
	pool := testdb.Pool(t)
	node := uuid.Must(uuid.NewV7())
	tn := testdb.NewTenant(t, pool, node)
	id := uuid.Must(uuid.NewV7())

	at := func(phys int64) string {
		return hlc.Timestamp{Physical: phys, Counter: 0, Node: node}.String()
	}

	// CREATE at t=200.
	require.Equal(t, ActionInsert, apply(t, pool, tn.ID, noteEnv(tn.ID, id, node, "CREATE", "v2", at(200))))
	body, del := readNote(t, pool, tn.ID, id)
	require.Equal(t, "v2", body)
	require.False(t, del)

	// Stale UPDATE at t=100 → skipped, body unchanged.
	require.Equal(t, ActionSkip, apply(t, pool, tn.ID, noteEnv(tn.ID, id, node, "UPDATE", "v1", at(100))))
	body, _ = readNote(t, pool, tn.ID, id)
	require.Equal(t, "v2", body)

	// Newer UPDATE at t=300 → wins.
	require.Equal(t, ActionUpdate, apply(t, pool, tn.ID, noteEnv(tn.ID, id, node, "UPDATE", "v3", at(300))))
	body, _ = readNote(t, pool, tn.ID, id)
	require.Equal(t, "v3", body)

	// Stale DELETE at t=100 → cannot bury the live row.
	require.Equal(t, ActionSkip, apply(t, pool, tn.ID, noteEnv(tn.ID, id, node, "DELETE", "", at(100))))
	_, del = readNote(t, pool, tn.ID, id)
	require.False(t, del)

	// Newer DELETE at t=400 → tombstone.
	require.Equal(t, ActionTombstone, apply(t, pool, tn.ID, noteEnv(tn.ID, id, node, "DELETE", "", at(400))))
	_, del = readNote(t, pool, tn.ID, id)
	require.True(t, del)

	// Even-newer UPDATE at t=500 → resurrects (LWW: latest writer wins).
	require.Equal(t, ActionUpdate, apply(t, pool, tn.ID, noteEnv(tn.ID, id, node, "UPDATE", "v5", at(500))))
	body, del = readNote(t, pool, tn.ID, id)
	require.Equal(t, "v5", body)
	require.False(t, del)
}
