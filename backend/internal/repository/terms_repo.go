package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TermsVersion is a row from the immutable terms_versions catalog (migration
// 144). The active version is the single non-revoked row; acceptance is always
// recorded against it.
type TermsVersion struct {
	Version       string     `json:"version"`
	DocumentTypes []string   `json:"document_types"`
	TermsText     string     `json:"terms_text"`
	TextSHA256    string     `json:"text_sha256"`
	EffectiveAt   time.Time  `json:"effective_at"`
	PublishedAt   time.Time  `json:"published_at"`
	RevokedAt     *time.Time `json:"revoked_at,omitempty"`
	Notes         string     `json:"notes,omitempty"`
}

// TermsAcceptance is one row in the append-only user_terms_acceptances ledger.
// This is the authoritative legal record (IT Act §10A clickwrap evidence /
// DPDP record-keeping). user_id intentionally carries no FK so the proof
// survives account deletion, mirroring audit_logs.actor_id.
type TermsAcceptance struct {
	ID               uuid.UUID `json:"id"`
	UserID           uuid.UUID `json:"user_id"`
	TermsVersion     string    `json:"terms_version"`
	VersionHash      string    `json:"version_hash"`
	AcceptedAt       time.Time `json:"accepted_at"`
	IPAddress        string    `json:"ip_address,omitempty"`
	UserAgent        string    `json:"user_agent,omitempty"`
	AcceptanceMethod string    `json:"acceptance_method"`
	LegalBasis       string    `json:"legal_basis"`
	DocumentTypes    []string  `json:"document_types"`
	CreatedAt        time.Time `json:"created_at"`
}

// TermsRepo persists Terms-of-Service versions and acceptances.
type TermsRepo struct {
	pool *pgxpool.Pool
}

// NewTermsRepo creates a new TermsRepo.
func NewTermsRepo(pool *pgxpool.Pool) *TermsRepo {
	return &TermsRepo{pool: pool}
}

// GetActiveVersion returns the newest non-revoked terms version that is already
// effective. Future-dated terms can be published ahead of time without gating
// uploads until their effective_at timestamp arrives.
// Returns ErrNotFound when no active version is seeded.
func (r *TermsRepo) GetActiveVersion(ctx context.Context) (*TermsVersion, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT version, document_types, terms_text, text_sha256,
		       effective_at, published_at, revoked_at, COALESCE(notes, '')
		FROM terms_versions
		WHERE revoked_at IS NULL
		  AND effective_at <= now()
		ORDER BY effective_at DESC, published_at DESC
		LIMIT 1`)

	var v TermsVersion
	if err := row.Scan(
		&v.Version, &v.DocumentTypes, &v.TermsText, &v.TextSHA256,
		&v.EffectiveAt, &v.PublishedAt, &v.RevokedAt, &v.Notes,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("terms active version: %w", err)
	}
	return &v, nil
}

// CreateAcceptance appends a new acceptance row. Append-only — there is no
// update path. History is preserved so the audit trail can prove exactly when
// each version was accepted, from which IP, and with what user-agent.
func (r *TermsRepo) CreateAcceptance(ctx context.Context, a *TermsAcceptance) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	if a.AcceptedAt.IsZero() {
		a.AcceptedAt = time.Now().UTC()
	}
	if a.LegalBasis == "" {
		a.LegalBasis = "contract"
	}
	if len(a.DocumentTypes) == 0 {
		a.DocumentTypes = []string{"terms_of_service", "privacy_policy"}
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_terms_acceptances
			(id, user_id, terms_version, version_hash, accepted_at,
			 ip_address, user_agent, acceptance_method, legal_basis, document_types)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		a.ID, a.UserID, a.TermsVersion, a.VersionHash, a.AcceptedAt,
		nullIfEmpty(a.IPAddress), nullIfEmpty(a.UserAgent), a.AcceptanceMethod,
		a.LegalBasis, a.DocumentTypes,
	)
	if err != nil {
		return fmt.Errorf("terms acceptance create: %w", err)
	}
	return nil
}

// RecordAcceptance appends the acceptance row AND refreshes the denormalized
// users pointer in a single transaction, so the legal ledger and the fast-path
// cache can never disagree (a pointer that lags the ledger would keep the
// upload gate blocking a user who has, in fact, accepted).
func (r *TermsRepo) RecordAcceptance(ctx context.Context, a *TermsAcceptance) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	if a.AcceptedAt.IsZero() {
		a.AcceptedAt = time.Now().UTC()
	}
	if a.LegalBasis == "" {
		a.LegalBasis = "contract"
	}
	if len(a.DocumentTypes) == 0 {
		a.DocumentTypes = []string{"terms_of_service", "privacy_policy"}
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("terms acceptance begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit

	if _, err := tx.Exec(ctx, `
		INSERT INTO user_terms_acceptances
			(id, user_id, terms_version, version_hash, accepted_at,
			 ip_address, user_agent, acceptance_method, legal_basis, document_types)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		a.ID, a.UserID, a.TermsVersion, a.VersionHash, a.AcceptedAt,
		nullIfEmpty(a.IPAddress), nullIfEmpty(a.UserAgent), a.AcceptanceMethod,
		a.LegalBasis, a.DocumentTypes,
	); err != nil {
		return fmt.Errorf("terms acceptance insert: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE users
		SET terms_accepted_version = $2, terms_accepted_at = $3
		WHERE id = $1`,
		a.UserID, a.TermsVersion, a.AcceptedAt,
	); err != nil {
		return fmt.Errorf("terms acceptance pointer update: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("terms acceptance commit: %w", err)
	}
	return nil
}

// GetLatestAcceptance returns a user's most recent acceptance, or ErrNotFound.
func (r *TermsRepo) GetLatestAcceptance(ctx context.Context, userID uuid.UUID) (*TermsAcceptance, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, terms_version, version_hash, accepted_at,
		       COALESCE(ip_address, ''), COALESCE(user_agent, ''),
		       acceptance_method, legal_basis, document_types, created_at
		FROM user_terms_acceptances
		WHERE user_id = $1
		ORDER BY accepted_at DESC
		LIMIT 1`, userID)

	var a TermsAcceptance
	if err := row.Scan(
		&a.ID, &a.UserID, &a.TermsVersion, &a.VersionHash, &a.AcceptedAt,
		&a.IPAddress, &a.UserAgent, &a.AcceptanceMethod, &a.LegalBasis,
		&a.DocumentTypes, &a.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("terms latest acceptance: %w", err)
	}
	return &a, nil
}

// UpdateUserTermsPointer refreshes the denormalized fast-path columns on users.
// Best-effort cache of the authoritative ledger; the gate and /auth/me read it
// to avoid a join on every upload.
func (r *TermsRepo) UpdateUserTermsPointer(ctx context.Context, userID uuid.UUID, version string, acceptedAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users
		SET terms_accepted_version = $2, terms_accepted_at = $3
		WHERE id = $1`,
		userID, version, acceptedAt)
	if err != nil {
		return fmt.Errorf("terms pointer update: %w", err)
	}
	return nil
}

// GetUserTermsPointer reads the denormalized acceptance pointer for a user.
// Returns empty version + nil time when the user has never accepted.
func (r *TermsRepo) GetUserTermsPointer(ctx context.Context, userID uuid.UUID) (version string, acceptedAt *time.Time, err error) {
	row := r.pool.QueryRow(ctx, `
		SELECT COALESCE(terms_accepted_version, ''), terms_accepted_at
		FROM users
		WHERE id = $1`, userID)
	if scanErr := row.Scan(&version, &acceptedAt); scanErr != nil {
		if errors.Is(scanErr, pgx.ErrNoRows) {
			return "", nil, ErrNotFound
		}
		return "", nil, fmt.Errorf("terms pointer read: %w", scanErr)
	}
	return version, acceptedAt, nil
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
