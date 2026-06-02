package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/auth"
)

// RefreshSessionRepo is the DB-backed implementation of
// auth.RefreshSessionStore. F-006 Part B (audit 2026-04-10) — refresh
// session state used to live in process-local maps on the JWT service,
// so every service restart invalidated every active session.
//
// This repo writes to / reads from the refresh_sessions table (see
// migration 062_refresh_sessions.up.sql). Tokens are hashed with
// SHA-256 via auth.HashToken before persistence — the raw token never
// touches disk.
type RefreshSessionRepo struct {
	pool *pgxpool.Pool
}

// NewRefreshSessionRepo constructs the repo with a pgx pool. main.go
// wires this during bootstrap and passes the resulting repo to
// jwtService via jwtService.WithRefreshStore.
func NewRefreshSessionRepo(pool *pgxpool.Pool) *RefreshSessionRepo {
	return &RefreshSessionRepo{pool: pool}
}

// Create inserts a new refresh session row. The token is hashed before
// persistence. Returns a wrapped error on failure; callers log these at
// the JWT service layer.
func (r *RefreshSessionRepo) Create(ctx context.Context, entry auth.RefreshSessionEntry) error {
	if entry.RawToken == "" {
		return errors.New("refresh session repo: raw token is empty")
	}
	hash := auth.HashToken(entry.RawToken)
	_, err := r.pool.Exec(ctx,
		`INSERT INTO refresh_sessions (
		    token_hash, sub, family_id, workspace_id, role, platform_role, state_id,
		    expires_at, revoked, used, family_revoked, mfa_verified
		 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 ON CONFLICT (token_hash) DO NOTHING`,
		hash, entry.Sub, entry.FamilyID, entry.WorkspaceID, entry.Role,
		entry.PlatformRole, entry.StateID, entry.ExpiresAt,
		entry.Revoked, entry.Used, false, entry.MFAVerified,
	)
	if err != nil {
		return fmt.Errorf("refresh session repo: create: %w", err)
	}
	return nil
}

// Get returns the session for a raw token, wrapping ErrRefreshNotFound
// when the token is unknown so callers can use errors.Is. Never returns
// the raw token back to the caller.
func (r *RefreshSessionRepo) Get(ctx context.Context, rawToken string) (*auth.RefreshSessionEntry, error) {
	hash := auth.HashToken(rawToken)
	entry := &auth.RefreshSessionEntry{}
	var familyRevoked bool
	err := r.pool.QueryRow(ctx,
		`SELECT sub, family_id, workspace_id, role, platform_role, state_id,
		        expires_at, revoked, used, family_revoked, mfa_verified
		 FROM refresh_sessions WHERE token_hash = $1`,
		hash,
	).Scan(&entry.Sub, &entry.FamilyID, &entry.WorkspaceID, &entry.Role,
		&entry.PlatformRole, &entry.StateID, &entry.ExpiresAt,
		&entry.Revoked, &entry.Used, &familyRevoked, &entry.MFAVerified)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, auth.ErrRefreshNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("refresh session repo: get: %w", err)
	}
	// Roll up family revocation onto the per-row flag so callers that
	// only inspect entry.Revoked still see the correct state.
	if familyRevoked {
		entry.Revoked = true
	}
	return entry, nil
}

// MarkUsed flips the used flag for a token. Returns ErrRefreshNotFound
// wrapping when the token is unknown.
func (r *RefreshSessionRepo) MarkUsed(ctx context.Context, rawToken string) error {
	hash := auth.HashToken(rawToken)
	tag, err := r.pool.Exec(ctx,
		`UPDATE refresh_sessions SET used = TRUE WHERE token_hash = $1`,
		hash,
	)
	if err != nil {
		return fmt.Errorf("refresh session repo: mark used: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return auth.ErrRefreshNotFound
	}
	return nil
}

func (r *RefreshSessionRepo) Rotate(ctx context.Context, oldRawToken, newRawToken string, newExpiresAt time.Time) (*auth.RefreshSessionEntry, error) {
	if newRawToken == "" {
		return nil, errors.New("refresh session repo: new raw token is empty")
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("refresh session repo: begin rotate: %w", err)
	}
	defer tx.Rollback(ctx)

	oldHash := auth.HashToken(oldRawToken)
	entry := &auth.RefreshSessionEntry{}
	var familyRevoked bool
	err = tx.QueryRow(ctx,
		`SELECT sub, family_id, workspace_id, role, platform_role, state_id,
		        expires_at, revoked, used, family_revoked, mfa_verified
		 FROM refresh_sessions
		 WHERE token_hash = $1
		 FOR UPDATE`,
		oldHash,
	).Scan(&entry.Sub, &entry.FamilyID, &entry.WorkspaceID, &entry.Role,
		&entry.PlatformRole, &entry.StateID, &entry.ExpiresAt,
		&entry.Revoked, &entry.Used, &familyRevoked, &entry.MFAVerified)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, auth.ErrRefreshNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("refresh session repo: rotate select: %w", err)
	}

	if entry.Revoked || entry.Used || familyRevoked {
		if _, revokeErr := tx.Exec(ctx,
			`UPDATE refresh_sessions
			 SET family_revoked = TRUE, revoked = TRUE
			 WHERE family_id = $1`,
			entry.FamilyID,
		); revokeErr != nil {
			return nil, fmt.Errorf("refresh session repo: rotate revoke family: %w", revokeErr)
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("refresh session repo: rotate commit revoke: %w", err)
		}
		entry.Revoked = true
		return entry, auth.ErrRefreshReuseDetected
	}

	if time.Now().After(entry.ExpiresAt) {
		return entry, auth.ErrRefreshExpired
	}

	if _, err := tx.Exec(ctx,
		`UPDATE refresh_sessions SET used = TRUE WHERE token_hash = $1`,
		oldHash,
	); err != nil {
		return nil, fmt.Errorf("refresh session repo: rotate mark used: %w", err)
	}

	newHash := auth.HashToken(newRawToken)
	_, err = tx.Exec(ctx,
		`INSERT INTO refresh_sessions (
		    token_hash, sub, family_id, workspace_id, role, platform_role, state_id,
		    expires_at, revoked, used, family_revoked, mfa_verified
		 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, FALSE, FALSE, $9)`,
		newHash, entry.Sub, entry.FamilyID, entry.WorkspaceID, entry.Role,
		entry.PlatformRole, entry.StateID, newExpiresAt, entry.MFAVerified,
	)
	if err != nil {
		return nil, fmt.Errorf("refresh session repo: rotate create replacement: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("refresh session repo: rotate commit: %w", err)
	}

	entry.Used = true
	return entry, nil
}

// RevokeFamily marks every row in the given family as revoked. Does not
// error if the family has no rows — idempotency matters here because
// the jwtService re-revokes a family on reuse detection.
func (r *RefreshSessionRepo) RevokeFamily(ctx context.Context, familyID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE refresh_sessions SET family_revoked = TRUE, revoked = TRUE
		 WHERE family_id = $1`,
		familyID,
	)
	if err != nil {
		return fmt.Errorf("refresh session repo: revoke family: %w", err)
	}
	return nil
}

// IsFamilyRevoked reports whether the family has any revoked rows. A
// single revoked row is sufficient to consider the whole family dead.
func (r *RefreshSessionRepo) IsFamilyRevoked(ctx context.Context, familyID string) (bool, error) {
	var revoked bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (
		     SELECT 1 FROM refresh_sessions
		     WHERE family_id = $1 AND family_revoked = TRUE
		 )`,
		familyID,
	).Scan(&revoked)
	if err != nil {
		return false, fmt.Errorf("refresh session repo: is family revoked: %w", err)
	}
	return revoked, nil
}

// CountActiveFamiliesForUser counts distinct families for a user where
// the family is not revoked and at least one token hasn't expired. The
// jwtService uses this for the MaxSessions concurrent-session limit.
func (r *RefreshSessionRepo) CountActiveFamiliesForUser(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(DISTINCT family_id) FROM refresh_sessions
		 WHERE sub = $1
		   AND revoked = FALSE
		   AND family_revoked = FALSE
		   AND expires_at > now()`,
		userID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("refresh session repo: count families: %w", err)
	}
	return count, nil
}

// UserHasFamily reports whether the user has at least one non-revoked,
// non-expired row in the given family. Used so rotating a token within
// an existing family does NOT count as a new session.
func (r *RefreshSessionRepo) UserHasFamily(ctx context.Context, userID, familyID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (
		     SELECT 1 FROM refresh_sessions
		     WHERE sub = $1 AND family_id = $2
		       AND revoked = FALSE
		       AND family_revoked = FALSE
		 )`,
		userID, familyID,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("refresh session repo: user has family: %w", err)
	}
	return exists, nil
}
