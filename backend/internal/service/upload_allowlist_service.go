package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E50-S2: Upload allowlist token service.
//
// Backs the super-admin FP override flow (FR-UPS-040..042). Tokens are issued
// against a specific manifest_hash + workspace and are single-use with a TTL.
// An admin issues a token to unblock a false-positive upload; the client
// attaches it to the next TUS session create; Tier D validation calls
// Consume() to verify the token is live, not expired, not already used, and
// bound to the manifest being attempted.
//
// Storage: upload_allowlist_tokens table (migration 056).
//   token           BYTEA PRIMARY KEY
//   manifest_hash   TEXT NOT NULL
//   workspace_id    UUID NOT NULL
//   issued_by       UUID NOT NULL
//   justification   TEXT NOT NULL
//   issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   expires_at      TIMESTAMPTZ NOT NULL
//   used_at         TIMESTAMPTZ NULL
//
// Design notes:
//   - Token bytes are 32 cryptographically-random bytes. The raw bytes are
//     the primary key; callers base64-encode for transport. We intentionally
//     do NOT store a hash of the token — this is a one-time token with a 24h
//     TTL, not a long-lived credential, so the threat model allows plaintext
//     lookup for simpler admin debugging.
//   - The repo interface is kept narrow (3 methods) so unit tests can stub
//     without a DB, matching the pattern used by other M16 services.
// ─────────────────────────────────────────────────────────────────────────────

// UploadAllowlistToken mirrors a row from upload_allowlist_tokens.
type UploadAllowlistToken struct {
	Token         []byte     `json:"-"` // never serialized to clients
	ManifestHash  string     `json:"manifest_hash"`
	WorkspaceID   uuid.UUID  `json:"workspace_id"`
	IssuedBy      uuid.UUID  `json:"issued_by"`
	Justification string     `json:"justification"`
	IssuedAt      time.Time  `json:"issued_at"`
	ExpiresAt     time.Time  `json:"expires_at"`
	UsedAt        *time.Time `json:"used_at,omitempty"`
}

// UploadAllowlistRepo is the minimal persistence interface needed by the
// service. Implemented by PgUploadAllowlistRepo for production and by
// inMemoryAllowlistRepo for unit tests.
type UploadAllowlistRepo interface {
	Store(ctx context.Context, token UploadAllowlistToken) error
	FindByToken(ctx context.Context, raw []byte) (*UploadAllowlistToken, error)
	MarkUsed(ctx context.Context, raw []byte, usedAt time.Time) error
}

// UploadAllowlistService issues and consumes FP override tokens.
type UploadAllowlistService struct {
	repo UploadAllowlistRepo
	now  func() time.Time // clock seam for tests
}

// NewUploadAllowlistService constructs the service.
func NewUploadAllowlistService(repo UploadAllowlistRepo) *UploadAllowlistService {
	return &UploadAllowlistService{
		repo: repo,
		now:  time.Now,
	}
}

// IssueAllowlistInput carries the fields needed to mint a new token.
type IssueAllowlistInput struct {
	ManifestHash  string
	WorkspaceID   uuid.UUID
	IssuedBy      uuid.UUID
	Justification string
	TTL           time.Duration
}

// Sentinel errors returned by Consume(). Handlers map these to specific
// HTTP status codes and user-facing messages.
var (
	ErrAllowlistTokenNotFound    = errors.New("ALLOWLIST_TOKEN_NOT_FOUND")
	ErrAllowlistTokenExpired     = errors.New("ALLOWLIST_TOKEN_EXPIRED")
	ErrAllowlistTokenAlreadyUsed = errors.New("ALLOWLIST_TOKEN_ALREADY_USED")
	ErrAllowlistManifestMismatch = errors.New("ALLOWLIST_MANIFEST_MISMATCH")
)

// Issue mints a fresh token and persists it. Returns the raw token bytes.
// Callers are responsible for transport encoding (typically base64url) and
// for binding the token to the target admin audit event.
func (s *UploadAllowlistService) Issue(ctx context.Context, in IssueAllowlistInput) ([]byte, error) {
	if in.ManifestHash == "" {
		return nil, fmt.Errorf("manifest_hash is required")
	}
	if in.TTL <= 0 {
		in.TTL = 24 * time.Hour
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("generating token: %w", err)
	}

	now := s.now()
	token := UploadAllowlistToken{
		Token:         raw,
		ManifestHash:  in.ManifestHash,
		WorkspaceID:   in.WorkspaceID,
		IssuedBy:      in.IssuedBy,
		Justification: in.Justification,
		IssuedAt:      now,
		ExpiresAt:     now.Add(in.TTL),
	}

	if err := s.repo.Store(ctx, token); err != nil {
		return nil, fmt.Errorf("storing token: %w", err)
	}
	return raw, nil
}

// Consume validates a presented token against the target manifest hash.
// On success the token is marked used (single-use semantics). On failure
// one of the sentinel errors above is returned.
func (s *UploadAllowlistService) Consume(ctx context.Context, raw []byte, manifestHash string) error {
	if len(raw) == 0 {
		return ErrAllowlistTokenNotFound
	}

	stored, err := s.repo.FindByToken(ctx, raw)
	if err != nil {
		return fmt.Errorf("looking up token: %w", err)
	}
	if stored == nil {
		return ErrAllowlistTokenNotFound
	}
	if stored.UsedAt != nil {
		return ErrAllowlistTokenAlreadyUsed
	}
	if s.now().After(stored.ExpiresAt) {
		return ErrAllowlistTokenExpired
	}
	if stored.ManifestHash != manifestHash {
		return ErrAllowlistManifestMismatch
	}

	if err := s.repo.MarkUsed(ctx, raw, s.now()); err != nil {
		return fmt.Errorf("marking token used: %w", err)
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// PgUploadAllowlistRepo — production implementation backed by *sql.DB.
//
// Uses database/sql for symmetry with the other M16 services (WorkspacePolicyService,
// UploadPolicyCatalog). main.go wires this via stdlib.OpenDBFromPool(dbPool).
// ─────────────────────────────────────────────────────────────────────────────

// PgUploadAllowlistRepo persists upload allowlist tokens in Postgres.
type PgUploadAllowlistRepo struct {
	db *sql.DB
}

// NewPgUploadAllowlistRepo constructs the repo.
func NewPgUploadAllowlistRepo(db *sql.DB) *PgUploadAllowlistRepo {
	return &PgUploadAllowlistRepo{db: db}
}

// Store inserts a new token row.
func (r *PgUploadAllowlistRepo) Store(ctx context.Context, token UploadAllowlistToken) error {
	const q = `
		INSERT INTO upload_allowlist_tokens
			(token, manifest_hash, workspace_id, issued_by, justification, issued_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := r.db.ExecContext(ctx, q,
		token.Token,
		token.ManifestHash,
		token.WorkspaceID,
		token.IssuedBy,
		token.Justification,
		token.IssuedAt,
		token.ExpiresAt,
	)
	return err
}

// FindByToken looks up an active or used token by its raw bytes.
// Returns (nil, nil) when no row exists.
func (r *PgUploadAllowlistRepo) FindByToken(ctx context.Context, raw []byte) (*UploadAllowlistToken, error) {
	const q = `
		SELECT token, manifest_hash, workspace_id, issued_by, justification,
		       issued_at, expires_at, used_at
		FROM upload_allowlist_tokens
		WHERE token = $1
		LIMIT 1
	`
	var t UploadAllowlistToken
	var usedAt sql.NullTime
	err := r.db.QueryRowContext(ctx, q, raw).Scan(
		&t.Token,
		&t.ManifestHash,
		&t.WorkspaceID,
		&t.IssuedBy,
		&t.Justification,
		&t.IssuedAt,
		&t.ExpiresAt,
		&usedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if usedAt.Valid {
		u := usedAt.Time
		t.UsedAt = &u
	}
	return &t, nil
}

// MarkUsed stamps the used_at column for a token.
func (r *PgUploadAllowlistRepo) MarkUsed(ctx context.Context, raw []byte, usedAt time.Time) error {
	const q = `UPDATE upload_allowlist_tokens SET used_at = $1 WHERE token = $2`
	result, err := r.db.ExecContext(ctx, q, usedAt, raw)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return ErrAllowlistTokenNotFound
	}
	return nil
}
