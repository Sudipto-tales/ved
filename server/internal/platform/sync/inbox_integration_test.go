//go:build integration

// Integration test for the cloud→node config apply path (docs/08 pillars 4+5): a config
// snapshot the cloud pushed is applied to tenant_profile via the inbox + LWW merge. Proves
// (1) a newer snapshot wins, (2) a redelivered event is an idempotent no-op (inbox dedupe),
// and (3) an out-of-order older snapshot loses (LWW), all against a real RLS-scoped pool.
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

func TestApplyConfigEvent_InboxDedupeAndLWW(t *testing.T) {
	pool := testdb.Pool(t)
	node := uuid.Must(uuid.NewV7())
	tn := testdb.NewTenant(t, pool, node) // seeds tenant_profile (display_name "Test School")

	reg := Registry{"tenant_profile": {Table: "tenant_profile", Columns: []string{"display_name", "slug"}}}

	// The tenant_profile PK is its own id, not the tenant_id — fetch it, then read names.
	profileID := profileFieldUUID(t, pool, tn.ID, "id")
	name := func() string { return profileFieldStr(t, pool, tn.ID, profileID, "display_name") }

	cfgEnv := func(op, display string, phys int64) Envelope {
		payload, _ := json.Marshal(map[string]any{"display_name": display, "slug": tn.Slug})
		return Envelope{
			EventID: uuid.Must(uuid.NewV7()), TenantID: tn.ID, Aggregate: "tenant_profile",
			AggregateID: profileID, Op: op, Payload: payload,
			HLC: hlc.Timestamp{Physical: phys, Node: node}.String(), OriginNodeID: node,
		}
	}

	// Newer snapshot (far-future physical beats the legacy-nanos seed) → applied.
	newer := cfgEnv("UPDATE", "Renamed By Cloud", 9_999_999_999_999)
	act, err := ApplyConfigEvent(context.Background(), pool, reg, newer)
	require.NoError(t, err)
	require.Equal(t, ActionUpdate, act)
	require.Equal(t, "Renamed By Cloud", name())

	// Redeliver the SAME event → inbox dedupe → no-op.
	act, err = ApplyConfigEvent(context.Background(), pool, reg, newer)
	require.NoError(t, err)
	require.Equal(t, ActionSkip, act)
	require.Equal(t, "Renamed By Cloud", name())

	// A DIFFERENT, older snapshot (physical=1) → inbox accepts it but LWW rejects the merge.
	older := cfgEnv("UPDATE", "Stale Name", 1)
	act, err = ApplyConfigEvent(context.Background(), pool, reg, older)
	require.NoError(t, err)
	require.Equal(t, ActionSkip, act)
	require.Equal(t, "Renamed By Cloud", name())
}

func profileFieldUUID(t *testing.T, pool *pgxpool.Pool, tenant uuid.UUID, col string) uuid.UUID {
	t.Helper()
	var v uuid.UUID
	require.NoError(t, testdb.InTenant(context.Background(), pool, tenant, func(tx pgx.Tx) error {
		return tx.QueryRow(context.Background(),
			`SELECT `+col+` FROM tenant_profile WHERE tenant_id=$1`, tenant).Scan(&v)
	}))
	return v
}

func profileFieldStr(t *testing.T, pool *pgxpool.Pool, tenant, id uuid.UUID, col string) string {
	t.Helper()
	var v string
	require.NoError(t, testdb.InTenant(context.Background(), pool, tenant, func(tx pgx.Tx) error {
		return tx.QueryRow(context.Background(),
			`SELECT `+col+` FROM tenant_profile WHERE id=$1`, id).Scan(&v)
	}))
	return v
}
