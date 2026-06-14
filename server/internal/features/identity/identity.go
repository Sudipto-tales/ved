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
	"github.com/weloin/ved/internal/platform/crypto"
	"github.com/weloin/ved/internal/platform/httpx"
)

// ---- Domain ---------------------------------------------------------------------

type user struct {
	ID           uuid.UUID
	PasswordHash string
	MustReset    bool
	Status       string
}

// MembershipDTO is the wire shape for a membership (login + /me/memberships).
type MembershipDTO struct {
	MembershipID uuid.UUID `json:"membership_id"`
	TenantID     uuid.UUID `json:"tenant_id"`
	UserType     string    `json:"user_type"`
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
		`SELECT id, password_hash, must_reset_password, status
		   FROM users
		  WHERE lower(login_identifier) = lower($1) AND deleted_at IS NULL`,
		login).Scan(&u.ID, &u.PasswordHash, &u.MustReset, &u.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return user{}, ErrInvalidCredentials
	}
	return u, err
}

func (r *Repo) userByID(ctx context.Context, id uuid.UUID) (user, error) {
	var u user
	err := r.pool.QueryRow(ctx,
		`SELECT id, password_hash, must_reset_password, status
		   FROM users WHERE id = $1 AND deleted_at IS NULL`, id).
		Scan(&u.ID, &u.PasswordHash, &u.MustReset, &u.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return user{}, ErrInvalidCredentials
	}
	return u, err
}

// memberships resolves a user's live ACTIVE memberships across every tenant, via the
// controlled SECURITY DEFINER seam (the one place RLS is bypassed, for login only).
func (r *Repo) memberships(ctx context.Context, userID uuid.UUID) ([]auth.Membership, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, tenant_id, user_type, status FROM auth_memberships($1)`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []auth.Membership{}
	for rows.Next() {
		var m auth.Membership
		var status string
		if err := rows.Scan(&m.MembershipID, &m.TenantID, &m.UserType, &status); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
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

func (s *Service) issue(ctx context.Context, u user) (LoginResult, error) {
	ms, err := s.repo.memberships(ctx, u.ID)
	if err != nil {
		return LoginResult{}, err
	}
	access, err := s.jwt.IssueAccess(u.ID, ms, u.MustReset)
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
		Memberships:  toDTOs(ms),
	}, nil
}

func toDTOs(ms []auth.Membership) []MembershipDTO {
	out := make([]MembershipDTO, 0, len(ms))
	for _, m := range ms {
		out = append(out, MembershipDTO{MembershipID: m.MembershipID, TenantID: m.TenantID, UserType: m.UserType})
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
		httpx.JSON(w, http.StatusOK, map[string]any{
			"user_id":             ident.UserID,
			"must_reset_password": ident.MustReset,
			"memberships":         toDTOs(ident.Memberships),
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
