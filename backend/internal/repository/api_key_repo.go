package repository

// api_key_repo.go — Postgres-backed API key storage. Table created in
// migration 042_m14_commerce_analytics_api.up.sql.
//
// API keys are stored as a SHA-256 hash plus an unhashed "prefix" (first 8
// chars of the cleartext key) so we can do fast O(1) lookup on the prefix
// then constant-time hash comparison on the remainder. This matches the
// industry pattern (Stripe, GitHub, Cloudflare) and means a database leak
// cannot expose live keys.

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// APIKey is the persisted API key record. KeyHash is never returned to
// callers — only the prefix is shown after creation, alongside the
// full cleartext key (which is shown ONCE at creation time).
type APIKey struct {
	ID          uuid.UUID
	WorkspaceID uuid.UUID
	Name        string
	KeyHash     string
	KeyPrefix   string
	Scopes      []string
	RateLimit   int
	LastUsedAt  *time.Time
	ExpiresAt   *time.Time
	IsActive    bool
	CreatedBy   *uuid.UUID
	CreatedAt   time.Time
}

// APIKeyRepo handles api_keys persistence.
type APIKeyRepo struct {
	pool *pgxpool.Pool
}

// NewAPIKeyRepo creates a new APIKeyRepo.
func NewAPIKeyRepo(pool *pgxpool.Pool) *APIKeyRepo {
	return &APIKeyRepo{pool: pool}
}

// Create inserts a new API key. ID and CreatedAt are set if blank.
func (r *APIKeyRepo) Create(ctx context.Context, k *APIKey) error {
	if k.ID == uuid.Nil {
		k.ID = uuid.New()
	}
	if k.CreatedAt.IsZero() {
		k.CreatedAt = time.Now().UTC()
	}
	if k.RateLimit <= 0 {
		k.RateLimit = 1000
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO api_keys (id, workspace_id, name, key_hash, key_prefix, scopes,
		                       rate_limit, expires_at, is_active, created_by, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		k.ID, k.WorkspaceID, k.Name, k.KeyHash, k.KeyPrefix, k.Scopes,
		k.RateLimit, k.ExpiresAt, k.IsActive, k.CreatedBy, k.CreatedAt)
	if err != nil {
		return fmt.Errorf("api key repo create: %w", err)
	}
	return nil
}

// FindByPrefix returns the active API key matching the given prefix, or
// (nil, nil) when no key exists. The caller must verify the cleartext
// key against KeyHash using constant-time comparison.
func (r *APIKeyRepo) FindByPrefix(ctx context.Context, prefix string) (*APIKey, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, name, key_hash, key_prefix, scopes,
		        rate_limit, last_used_at, expires_at, is_active, created_by, created_at
		 FROM api_keys
		 WHERE key_prefix = $1 AND is_active = true`, prefix)

	var k APIKey
	err := row.Scan(&k.ID, &k.WorkspaceID, &k.Name, &k.KeyHash, &k.KeyPrefix, &k.Scopes,
		&k.RateLimit, &k.LastUsedAt, &k.ExpiresAt, &k.IsActive, &k.CreatedBy, &k.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("api key repo find: %w", err)
	}
	return &k, nil
}

// ListByWorkspace returns all keys for a workspace, including inactive
// ones, so the dashboard can show revocation history.
func (r *APIKeyRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*APIKey, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, name, key_hash, key_prefix, scopes,
		        rate_limit, last_used_at, expires_at, is_active, created_by, created_at
		 FROM api_keys
		 WHERE workspace_id = $1
		 ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("api key repo list: %w", err)
	}
	defer rows.Close()

	var out []*APIKey
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.WorkspaceID, &k.Name, &k.KeyHash, &k.KeyPrefix, &k.Scopes,
			&k.RateLimit, &k.LastUsedAt, &k.ExpiresAt, &k.IsActive, &k.CreatedBy, &k.CreatedAt); err != nil {
			return nil, fmt.Errorf("api key repo scan: %w", err)
		}
		out = append(out, &k)
	}
	return out, rows.Err()
}

// Revoke marks an API key as inactive. Inactive keys are kept for the
// audit trail but cannot be used for authentication.
func (r *APIKeyRepo) Revoke(ctx context.Context, id, workspaceID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE api_keys SET is_active = false WHERE id = $1 AND workspace_id = $2`,
		id, workspaceID)
	if err != nil {
		return fmt.Errorf("api key repo revoke: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// TouchLastUsed updates the last_used_at timestamp. Best-effort, called
// from the auth middleware on each successful request. Errors are
// logged by the caller, not returned, so a slow update query never
// blocks the request path.
func (r *APIKeyRepo) TouchLastUsed(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, id)
	return err
}
