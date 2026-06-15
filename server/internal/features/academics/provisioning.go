package academics

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/weloin/ved/internal/platform/onboarding"
)

// SeedDefaultAcademicYear idempotently ensures the tenant has a current academic year so
// sections/exams can be created out of the box. Called both by the node dev seed and by
// control-plane tenant provisioning (every provisioned school needs a current year; the
// full tenant-setup slice — multiple years, terms, rooms — comes later). Golden rule on
// first insert.
func SeedDefaultAcademicYear(ctx context.Context, engine *onboarding.Engine, tenantID uuid.UUID) error {
	return engine.WithTenant(ctx, tenantID, func(tx pgx.Tx) error {
		var exists bool
		// Filter tenant_id explicitly (defence-in-depth): control-plane provisioning runs
		// as a superuser, which BYPASSES RLS — relying on app.tenant_id alone would match
		// another tenant's current year and wrongly skip the insert.
		err := tx.QueryRow(ctx, `SELECT true FROM academic_year WHERE tenant_id=$1 AND is_current AND deleted_at IS NULL`, tenantID).Scan(&exists)
		if err == nil {
			return nil // already have a current year
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		id := uuid.Must(uuid.NewV7())
		hlc := onboarding.NowHLC()
		if _, err := tx.Exec(ctx,
			`INSERT INTO academic_year (id, tenant_id, name, start_date, end_date, is_current, hlc, version, origin_node_id)
			 VALUES ($1,$2,'2026-27','2026-04-01','2027-03-31',true,$3,1,$4)`,
			id, tenantID, hlc, engine.NodeID()); err != nil {
			return fmt.Errorf("seed academic year: %w", err)
		}
		b, _ := json.Marshal(map[string]any{"id": id, "name": "2026-27"})
		return engine.WriteEventAndAudit(ctx, tx, tenantID, "academic_year", id, "academic_year.create", uuid.Nil, b, hlc)
	})
}
