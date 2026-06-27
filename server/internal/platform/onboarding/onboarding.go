// Package onboarding is the shared people-onboarding engine (docs/06-onboarding-credentials.md,
// docs/database/04-people.md "the shared pattern: identity + profile + onboarding"). It
// builds the GENERIC machinery once so every people slice — students (M3), teachers and
// staff (M5), guardians later — reuses it and only adds its own profile table + domain
// event.
//
// What the engine owns: the tenant-scoped transaction wrapper, the school-slug lookup,
// and CreateMember (generated login handle + one-time temp password + global users row +
// tenant membership + optional roles). What a SLICE owns: its profile row and the single
// domain event (student.enrolled / teacher.onboarded / …) + audit, written in the SAME
// transaction so the golden rule holds across the whole aggregate.
package onboarding

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/credential"
	"github.com/weloin/ved/internal/platform/crypto"
	"github.com/weloin/ved/internal/platform/hlc"
)

var (
	// ErrNoTenantSlug means the tenant has no tenant_profile.slug (not provisioned).
	ErrNoTenantSlug = errors.New("tenant has no slug configured")
	// ErrForeignRole means a requested role is not in this tenant.
	ErrForeignRole = errors.New("role not found in this tenant")
)

// Engine creates members inside tenant transactions. One per binary, shared by slices.
type Engine struct {
	pool   *pgxpool.Pool
	nodeID uuid.UUID
}

func NewEngine(pool *pgxpool.Pool, nodeID uuid.UUID) *Engine {
	return &Engine{pool: pool, nodeID: nodeID}
}

// NodeID exposes the engine's node id for slices stamping origin_node_id on profile rows.
func (e *Engine) NodeID() uuid.UUID { return e.nodeID }

// WithTenant runs fn in a transaction with app.tenant_id set so RLS filters every
// statement — the one place a slice's onboard mutation is committed.
func (e *Engine) WithTenant(ctx context.Context, tenantID uuid.UUID, fn func(pgx.Tx) error) error {
	tx, err := e.pool.Begin(ctx)
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

// SchoolSlug reads the tenant's login-handle slug (tenant_profile) inside a tx.
func SchoolSlug(ctx context.Context, tx pgx.Tx) (string, error) {
	var slug string
	err := tx.QueryRow(ctx, `SELECT slug FROM tenant_profile WHERE deleted_at IS NULL`).Scan(&slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNoTenantSlug
	}
	return slug, err
}

// MemberInput drives CreateMember.
type MemberInput struct {
	TenantID   uuid.UUID
	Actor      uuid.UUID // creating staff membership (created_by); uuid.Nil if none
	Name       string
	UserType   string // STUDENT | TEACHER | EMPLOYEE | GUARDIAN
	SchoolSlug string
	RoleIDs    []uuid.UUID
	RealEmail  string // optional real inbox for reset/notices
	HLC        string // shared HLC for the aggregate (pass NowHLC())
}

// Member is the created identity + the one-time credentials to hand over (docs/06).
type Member struct {
	UserID       uuid.UUID
	MembershipID uuid.UUID
	Login        string
	TempPassword string
}

// CreateMember generates a unique login handle + temp password and writes the global
// users row, the tenant membership, and any role assignments — all inside the provided
// (tenant-scoped) transaction. The slice then adds its profile row + domain event in the
// same tx. The temp password is returned in cleartext ONCE; only its hash is stored.
func (e *Engine) CreateMember(ctx context.Context, tx pgx.Tx, in MemberInput) (Member, error) {
	handle, err := credential.GenerateHandle(in.Name, in.UserType, in.SchoolSlug, func(candidate string) (bool, error) {
		var exists bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM users WHERE lower(login_identifier) = lower($1))`, candidate).Scan(&exists); err != nil {
			return false, err
		}
		return exists, nil
	})
	if err != nil {
		return Member{}, err
	}
	tempPW, err := credential.TempPassword()
	if err != nil {
		return Member{}, err
	}
	hash, err := crypto.HashPassword(tempPW)
	if err != nil {
		return Member{}, err
	}

	userID := uuid.Must(uuid.NewV7())
	membershipID := uuid.Must(uuid.NewV7())
	var actor *uuid.UUID
	if in.Actor != uuid.Nil {
		actor = &in.Actor
	}
	var realEmail *string
	if in.RealEmail != "" {
		realEmail = &in.RealEmail
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO users (id, login_identifier, password_hash, must_reset_password, real_contact_email, status, hlc, version, origin_node_id)
		 VALUES ($1, $2, $3, true, $4, 'ACTIVE', $5, 1, $6)`,
		userID, handle, hash, realEmail, in.HLC, e.nodeID); err != nil {
		return Member{}, fmt.Errorf("insert user: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO memberships (id, tenant_id, user_id, user_type, status, created_by, hlc, version, origin_node_id)
		 VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, 1, $7)`,
		membershipID, in.TenantID, userID, in.UserType, actor, in.HLC, e.nodeID); err != nil {
		return Member{}, fmt.Errorf("insert membership: %w", err)
	}
	for _, rid := range in.RoleIDs {
		// Validate the role belongs to THIS tenant (explicit tenant_id, not RLS-only).
		var ok bool
		err := tx.QueryRow(ctx,
			`SELECT true FROM roles WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`, rid, in.TenantID).Scan(&ok)
		if errors.Is(err, pgx.ErrNoRows) {
			return Member{}, fmt.Errorf("%w: %s", ErrForeignRole, rid)
		}
		if err != nil {
			return Member{}, err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by, hlc, origin_node_id)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			in.TenantID, membershipID, rid, actor, in.HLC, e.nodeID); err != nil {
			return Member{}, fmt.Errorf("insert membership role: %w", err)
		}
	}
	return Member{UserID: userID, MembershipID: membershipID, Login: handle, TempPassword: tempPW}, nil
}

// WriteEventAndAudit appends the single domain event + audit row for an onboarding
// aggregate, in the same tx (the golden rule for the whole aggregate).
func (e *Engine) WriteEventAndAudit(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID, aggregate string, aggID uuid.UUID, action string, actor uuid.UUID, payload []byte, hlc string) error {
	var actorPtr *uuid.UUID
	if actor != uuid.Nil {
		actorPtr = &actor
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
		 VALUES ($1, $2, $3, $4, 'CREATE', $5, $6, $7)`,
		uuid.Must(uuid.NewV7()), tenantID, aggregate, aggID, payload, hlc, e.nodeID); err != nil {
		return fmt.Errorf("insert outbox: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO audit_log (id, tenant_id, actor_membership_id, action, resource_type, resource_id, after, origin_node_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		uuid.Must(uuid.NewV7()), tenantID, actorPtr, action, aggregate, aggID, payload, e.nodeID); err != nil {
		return fmt.Errorf("insert audit: %w", err)
	}
	return nil
}

// MissingRequiredFields enforces the tenant's dynamic onboarding template (M10): it returns
// the labels of fields the School Admin marked visible+required for this person_type that the
// caller did NOT supply. `present` maps a field_key → whether the input carried a value. If
// the tenant has no template rows (un-customized), nothing extra is required (core fields like
// name/admission_no are still enforced in code by each slice). Runs inside the onboard tx, so
// RLS already scopes the query to the tenant.
func (e *Engine) MissingRequiredFields(ctx context.Context, tx pgx.Tx, personType string, present map[string]bool) ([]string, error) {
	rows, err := tx.Query(ctx,
		`SELECT field_key, label FROM onboarding_field_config
		  WHERE person_type = $1 AND visible AND required AND deleted_at IS NULL
		  ORDER BY ordinal`, personType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var missing []string
	for rows.Next() {
		var key, label string
		if err := rows.Scan(&key, &label); err != nil {
			return nil, err
		}
		if !present[key] {
			missing = append(missing, label)
		}
	}
	return missing, rows.Err()
}

// NowHLC returns a fresh Hybrid Logical Clock stamp shared by an aggregate's onboarding
// writes (docs/08 pillar 5). It delegates to the process-global clock (hlc.SetNode is
// called at node startup with the node id), so every write is causally ordered and stamps
// compare correctly across nodes during sync.
func NowHLC() string { return hlc.Now() }
