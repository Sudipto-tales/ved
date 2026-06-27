// Package identity is the M1 slice: real login that resolves memberships and arms
// RLS (docs/plan/README.md M1, docs/database/02-identity-access.md). It is the first
// slice to exercise the auth + tenant seams for real.
//
// Identity is GLOBAL (users, no tenant_id, no RLS); access is TENANT-SCOPED
// (memberships, RLS). Login therefore performs one controlled cross-tenant read of a
// user's memberships via the `auth_memberships` SECURITY DEFINER function, then mints
// tokens. Tenant-scoped writes (the dev seed) follow the golden rule: row + outbox +
// audit in ONE transaction.
package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/weloin/ved/internal/platform/auth"
	"github.com/weloin/ved/internal/platform/credential"
	"github.com/weloin/ved/internal/platform/crypto"
	"github.com/weloin/ved/internal/platform/httpx"
)

// ---- Domain ---------------------------------------------------------------------

type user struct {
	ID           uuid.UUID
	Login        string
	PasswordHash string
	MustReset    bool
	Status       string
}

// MembershipDTO is the wire shape for a membership (login + /me/memberships). TenantName +
// Slug let the tenant app greet every persona with their school's name (sidebar, "Welcome
// to {School}") without an extra, admin-gated profile call — docs/24, docs/25.
type MembershipDTO struct {
	MembershipID uuid.UUID `json:"membership_id"`
	TenantID     uuid.UUID `json:"tenant_id"`
	UserType     string    `json:"user_type"`
	TenantName   string    `json:"tenant_name"`
	Slug         string    `json:"slug"`
}

// membership pairs the JWT-facing identity (auth.Membership) with the display fields the
// FE shows. The names ride the login JSON only — JWT claims stay lean.
type membership struct {
	auth.Membership
	TenantName string
	Slug       string
}

var (
	// ErrInvalidCredentials is deliberately vague (no user-enumeration).
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrUserNotActive blocks suspended/locked accounts.
	ErrUserNotActive = errors.New("account is not active")
)

// ---- Repository (the only layer that touches tables) ----------------------------

type Repo struct {
	pool   *pgxpool.Pool
	nodeID uuid.UUID
}

func NewRepo(pool *pgxpool.Pool, nodeID uuid.UUID) *Repo { return &Repo{pool: pool, nodeID: nodeID} }

// userByLogin reads a global user by login identifier (case-insensitive). `users`
// has no RLS, so no tenant context is needed.
func (r *Repo) userByLogin(ctx context.Context, login string) (user, error) {
	var u user
	err := r.pool.QueryRow(ctx,
		`SELECT id, login_identifier, password_hash, must_reset_password, status
		   FROM users
		  WHERE lower(login_identifier) = lower($1) AND deleted_at IS NULL`,
		login).Scan(&u.ID, &u.Login, &u.PasswordHash, &u.MustReset, &u.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return user{}, ErrInvalidCredentials
	}
	return u, err
}

func (r *Repo) userByID(ctx context.Context, id uuid.UUID) (user, error) {
	var u user
	err := r.pool.QueryRow(ctx,
		`SELECT id, login_identifier, password_hash, must_reset_password, status
		   FROM users WHERE id = $1 AND deleted_at IS NULL`, id).
		Scan(&u.ID, &u.Login, &u.PasswordHash, &u.MustReset, &u.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return user{}, ErrInvalidCredentials
	}
	return u, err
}

// memberships resolves a user's live ACTIVE memberships across every tenant, via the
// controlled SECURITY DEFINER seam (the one place RLS is bypassed, for login only).
func (r *Repo) memberships(ctx context.Context, userID uuid.UUID) ([]membership, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, tenant_id, user_type, status, tenant_name, tenant_slug FROM auth_memberships($1)`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []membership{}
	for rows.Next() {
		var m membership
		var status string
		if err := rows.Scan(&m.MembershipID, &m.TenantID, &m.UserType, &status, &m.TenantName, &m.Slug); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// activation resolves a LIVE magic-login token (by hash) to its tenant + user via the
// controlled SECURITY DEFINER bypass — the same narrow cross-tenant read pattern login
// uses (`users` has no tenant context on a public endpoint).
func (r *Repo) activation(ctx context.Context, tokenHash string) (tokenID, tenantID, userID uuid.UUID, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT id, tenant_id, user_id FROM auth_activation($1)`, tokenHash).
		Scan(&tokenID, &tenantID, &userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, uuid.Nil, uuid.Nil, ErrInvalidCredentials
	}
	return tokenID, tenantID, userID, err
}

// consumeActivation marks the token consumed in ONE tenant tx with its outbox + audit
// (the golden rule). A token can be consumed exactly once — a re-used link no-ops with
// ErrInvalidCredentials, so the magic link is genuinely single-use.
func (r *Repo) consumeActivation(ctx context.Context, tenantID, tokenID, userID uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return err
	}
	hlc := nowHLC()
	ct, err := tx.Exec(ctx,
		`UPDATE activation_token SET consumed_at=now(), updated_at=now(), version=version+1, hlc=$2
		  WHERE id=$1 AND consumed_at IS NULL AND deleted_at IS NULL`, tokenID, hlc)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrInvalidCredentials
	}
	payload, _ := json.Marshal(map[string]any{"token_id": tokenID, "user_id": userID})
	if _, err := tx.Exec(ctx,
		`INSERT INTO outbox (id, tenant_id, aggregate, aggregate_id, op, payload, hlc, origin_node_id)
		 VALUES ($1,$2,'activation_token',$3,'CONSUME',$4,$5,$6)`,
		uuid.Must(uuid.NewV7()), tenantID, tokenID, payload, hlc, r.nodeID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO audit_log (id, tenant_id, action, resource_type, resource_id, after, origin_node_id)
		 VALUES ($1,$2,'activation.consume','activation_token',$3,$4,$5)`,
		uuid.Must(uuid.NewV7()), tenantID, tokenID, payload, r.nodeID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// updatePassword sets a new hash and clears the must-reset flag (global users row).
func (r *Repo) updatePassword(ctx context.Context, userID uuid.UUID, newHash string) error {
	ct, err := r.pool.Exec(ctx,
		`UPDATE users
		    SET password_hash = $2, must_reset_password = false,
		        updated_at = now(), version = version + 1
		  WHERE id = $1 AND deleted_at IS NULL`,
		userID, newHash)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrInvalidCredentials
	}
	return nil
}

// ---- Service --------------------------------------------------------------------

type Service struct {
	repo *Repo
	jwt  *auth.Manager
}

func NewService(repo *Repo, jwt *auth.Manager) *Service { return &Service{repo: repo, jwt: jwt} }

// LoginResult is what a successful login returns to the handler.
type LoginResult struct {
	AccessToken  string          `json:"access_token"`
	RefreshToken string          `json:"refresh_token"`
	MustReset    bool            `json:"must_reset_password"`
	Login        string          `json:"login"` // the signed-in user's handle (account chip)
	Memberships  []MembershipDTO `json:"memberships"`
}

// Login verifies credentials, resolves memberships, and mints tokens.
func (s *Service) Login(ctx context.Context, login, password string) (LoginResult, error) {
	u, err := s.repo.userByLogin(ctx, login)
	if err != nil {
		return LoginResult{}, err
	}
	if err := crypto.VerifyPassword(password, u.PasswordHash); err != nil {
		return LoginResult{}, ErrInvalidCredentials
	}
	if u.Status != "ACTIVE" {
		return LoginResult{}, ErrUserNotActive
	}
	return s.issue(ctx, u)
}

// Refresh rotates the token pair from a valid refresh token. Memberships are
// re-resolved so revoked access takes effect on the next refresh.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (LoginResult, error) {
	claims, err := s.jwt.ParseRefresh(refreshToken)
	if err != nil {
		return LoginResult{}, ErrInvalidCredentials
	}
	uid, err := uuid.Parse(claims.Subject)
	if err != nil {
		return LoginResult{}, ErrInvalidCredentials
	}
	u, err := s.repo.userByID(ctx, uid)
	if err != nil {
		return LoginResult{}, err
	}
	if u.Status != "ACTIVE" {
		return LoginResult{}, ErrUserNotActive
	}
	return s.issue(ctx, u)
}

// ResetPassword performs the forced-first-login (or voluntary) password change. The
// caller proves possession of the current password before it is replaced.
func (s *Service) ResetPassword(ctx context.Context, userID uuid.UUID, current, next string) error {
	u, err := s.repo.userByID(ctx, userID)
	if err != nil {
		return err
	}
	if err := crypto.VerifyPassword(current, u.PasswordHash); err != nil {
		return ErrInvalidCredentials
	}
	if len(next) < 8 {
		return fmt.Errorf("new password must be at least 8 characters")
	}
	hash, err := crypto.HashPassword(next)
	if err != nil {
		return err
	}
	return s.repo.updatePassword(ctx, userID, hash)
}

// Activate consumes a one-time magic-login token and logs the user in (M11). The token
// replaces typing the temp credential: clicking the emailed link resolves + consumes the
// token, then issues the normal token pair. The provisioned admin still carries
// must_reset_password, so the FE routes them into setting a password.
func (s *Service) Activate(ctx context.Context, rawToken string) (LoginResult, error) {
	if rawToken == "" {
		return LoginResult{}, ErrInvalidCredentials
	}
	tokenID, tenantID, userID, err := s.repo.activation(ctx, credential.HashToken(rawToken))
	if err != nil {
		return LoginResult{}, err
	}
	if err := s.repo.consumeActivation(ctx, tenantID, tokenID, userID); err != nil {
		return LoginResult{}, err
	}
	u, err := s.repo.userByID(ctx, userID)
	if err != nil {
		return LoginResult{}, err
	}
	if u.Status != "ACTIVE" {
		return LoginResult{}, ErrUserNotActive
	}
	return s.issue(ctx, u)
}

// Memberships re-resolves a user's live memberships (with their school name + slug) from
// the DB — used by /me/memberships so a refresh carries the same display fields as login.
func (s *Service) Memberships(ctx context.Context, userID uuid.UUID) ([]MembershipDTO, error) {
	ms, err := s.repo.memberships(ctx, userID)
	if err != nil {
		return nil, err
	}
	return toDTOs(ms), nil
}

func (s *Service) issue(ctx context.Context, u user) (LoginResult, error) {
	ms, err := s.repo.memberships(ctx, u.ID)
	if err != nil {
		return LoginResult{}, err
	}
	authMs := make([]auth.Membership, len(ms))
	for i, m := range ms {
		authMs[i] = m.Membership
	}
	access, err := s.jwt.IssueAccess(u.ID, authMs, u.MustReset)
	if err != nil {
		return LoginResult{}, err
	}
	refresh, err := s.jwt.IssueRefresh(u.ID)
	if err != nil {
		return LoginResult{}, err
	}
	return LoginResult{
		AccessToken:  access,
		RefreshToken: refresh,
		MustReset:    u.MustReset,
		Login:        u.Login,
		Memberships:  toDTOs(ms),
	}, nil
}

func toDTOs(ms []membership) []MembershipDTO {
	out := make([]MembershipDTO, 0, len(ms))
	for _, m := range ms {
		out = append(out, MembershipDTO{
			MembershipID: m.MembershipID, TenantID: m.TenantID, UserType: m.UserType,
			TenantName: m.TenantName, Slug: m.Slug,
		})
	}
	return out
}

// ---- HTTP -----------------------------------------------------------------------

// RegisterPublic mounts the unauthenticated /auth/* endpoints.
func RegisterPublic(r chi.Router, svc *Service) {
	r.Post("/auth/login", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			LoginIdentifier string `json:"login_identifier"`
			Password        string `json:"password"`
		}
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.LoginIdentifier == "" || in.Password == "" {
			httpx.Error(w, http.StatusBadRequest, "login_identifier and password are required")
			return
		}
		res, err := svc.Login(req.Context(), in.LoginIdentifier, in.Password)
		if err != nil {
			writeAuthErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, res)
	})

	r.Post("/auth/activate", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.Token == "" {
			httpx.Error(w, http.StatusBadRequest, "token is required")
			return
		}
		res, err := svc.Activate(req.Context(), in.Token)
		if err != nil {
			writeAuthErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, res)
	})

	r.Post("/auth/refresh", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			RefreshToken string `json:"refresh_token"`
		}
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.RefreshToken == "" {
			httpx.Error(w, http.StatusBadRequest, "refresh_token is required")
			return
		}
		res, err := svc.Refresh(req.Context(), in.RefreshToken)
		if err != nil {
			writeAuthErr(w, err)
			return
		}
		httpx.JSON(w, http.StatusOK, res)
	})
}

// RegisterMe mounts the authenticated, identity-global endpoints (NO tenant
// required — these run before/around tenant selection).
func RegisterMe(r chi.Router, svc *Service) {
	r.Get("/api/v1/me/memberships", func(w http.ResponseWriter, req *http.Request) {
		ident, ok := httpx.IdentityFrom(req.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		ms, err := svc.Memberships(req.Context(), ident.UserID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not resolve memberships")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{
			"user_id":             ident.UserID,
			"must_reset_password": ident.MustReset,
			"memberships":         ms,
		})
	})

	r.Post("/auth/reset-password", func(w http.ResponseWriter, req *http.Request) {
		ident, ok := httpx.IdentityFrom(req.Context())
		if !ok {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		var in struct {
			CurrentPassword string `json:"current_password"`
			NewPassword     string `json:"new_password"`
		}
		if err := json.NewDecoder(req.Body).Decode(&in); err != nil || in.CurrentPassword == "" || in.NewPassword == "" {
			httpx.Error(w, http.StatusBadRequest, "current_password and new_password are required")
			return
		}
		if err := svc.ResetPassword(req.Context(), ident.UserID, in.CurrentPassword, in.NewPassword); err != nil {
			writeAuthErr(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func writeAuthErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalidCredentials):
		httpx.Error(w, http.StatusUnauthorized, "invalid credentials")
	case errors.Is(err, ErrUserNotActive):
		httpx.Error(w, http.StatusForbidden, "account is not active")
	default:
		httpx.Error(w, http.StatusInternalServerError, err.Error())
	}
}

func nowHLC() string { return strconv.FormatInt(time.Now().UnixNano(), 10) }
