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

// F-007 (M17 wave 2): user MFA enrollment repository.
//
// Persists TOTP enrollments to user_mfa_enrollments (migration 063). The
// TOTP secret is stored as envelope-encrypted ciphertext using the F-005
// KEK/DEK pattern — this repo stores whatever bytes the caller hands it
// and does NOT know the plaintext. Decryption happens at verify time in
// the auth handler after reading the enrollment back out.

// UserMFAEnrollment is the DB row shape for user_mfa_enrollments.
//
// The TOTP secret is stored as an envelope-encrypted blob pair:
//   - TOTPSecretCT: ciphertext produced by Envelope.Encrypt
//   - TOTPSecretDEKWrapped: the per-row DEK wrapped with the long-lived KEK
//
// Callers fetch both, pass them to Envelope.Decrypt, and get the plaintext
// TOTP secret back. This repo never sees the plaintext.
type UserMFAEnrollment struct {
	ID                   uuid.UUID  `json:"id"`
	UserID               uuid.UUID  `json:"user_id"`
	TOTPSecretCT         []byte     `json:"-"` // envelope ciphertext
	TOTPSecretDEKWrapped []byte     `json:"-"` // KEK-wrapped DEK
	TOTPIssuer           string     `json:"totp_issuer"`
	EnrolledAt           time.Time  `json:"enrolled_at"`
	LastVerifiedAt       *time.Time `json:"last_verified_at,omitempty"`
	DisabledAt           *time.Time `json:"disabled_at,omitempty"`
}

// ErrMFAEnrollmentNotFound is returned by GetByUserID when the user has
// not enrolled an authenticator. Callers use errors.Is so they can
// distinguish "not enrolled" from transient DB failures.
var ErrMFAEnrollmentNotFound = errors.New("user_mfa_enrollments: not found")

// UserMFAEnrollmentsRepo persists TOTP enrollments.
type UserMFAEnrollmentsRepo struct {
	pool *pgxpool.Pool
}

// NewUserMFAEnrollmentsRepo constructs the repo. Accepts nil pool for
// unit-test constructor verification, matching the existing repo pattern
// in this package.
func NewUserMFAEnrollmentsRepo(pool *pgxpool.Pool) *UserMFAEnrollmentsRepo {
	return &UserMFAEnrollmentsRepo{pool: pool}
}

// Create inserts a new enrollment row. Enforces UNIQUE(user_id) at the DB
// level — re-enrolling requires an explicit Delete first (or the caller
// can call UpsertOnConflict semantics via the DO UPDATE path, kept simple
// here for now).
func (r *UserMFAEnrollmentsRepo) Create(ctx context.Context, e *UserMFAEnrollment) error {
	if e == nil {
		return errors.New("user_mfa_enrollments: nil enrollment")
	}
	if e.UserID == uuid.Nil {
		return errors.New("user_mfa_enrollments: user_id required")
	}
	if len(e.TOTPSecretCT) == 0 {
		return errors.New("user_mfa_enrollments: totp_secret_ct required")
	}
	if len(e.TOTPSecretDEKWrapped) == 0 {
		return errors.New("user_mfa_enrollments: totp_secret_dek_wrapped required")
	}
	if e.TOTPIssuer == "" {
		return errors.New("user_mfa_enrollments: totp_issuer required")
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO user_mfa_enrollments (
		    user_id, totp_secret_ct, totp_secret_dek_wrapped, totp_issuer
		 ) VALUES ($1, $2, $3, $4)`,
		e.UserID, e.TOTPSecretCT, e.TOTPSecretDEKWrapped, e.TOTPIssuer,
	)
	if err != nil {
		return fmt.Errorf("user_mfa_enrollments: create: %w", err)
	}
	return nil
}

// GetByUserID returns the enrollment for a user, or ErrMFAEnrollmentNotFound
// when the user has not enrolled. Rows with disabled_at set are still
// returned — callers decide whether to honor a soft-disabled enrollment.
func (r *UserMFAEnrollmentsRepo) GetByUserID(ctx context.Context, userID uuid.UUID) (*UserMFAEnrollment, error) {
	e := &UserMFAEnrollment{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, totp_secret_ct, totp_secret_dek_wrapped, totp_issuer,
		        enrolled_at, last_verified_at, disabled_at
		 FROM user_mfa_enrollments WHERE user_id = $1`,
		userID,
	).Scan(&e.ID, &e.UserID, &e.TOTPSecretCT, &e.TOTPSecretDEKWrapped, &e.TOTPIssuer,
		&e.EnrolledAt, &e.LastVerifiedAt, &e.DisabledAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMFAEnrollmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("user_mfa_enrollments: get: %w", err)
	}
	return e, nil
}

// UpdateLastVerified stamps the most recent successful TOTP verify time.
// Used to surface a "last used" indicator in user settings.
func (r *UserMFAEnrollmentsRepo) UpdateLastVerified(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE user_mfa_enrollments SET last_verified_at = now() WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("user_mfa_enrollments: update last_verified: %w", err)
	}
	return nil
}

// Disable soft-disables an enrollment without losing the audit trail.
// Disabled enrollments still return from GetByUserID so the caller can
// surface the disabled state in UI / audit reports.
func (r *UserMFAEnrollmentsRepo) Disable(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE user_mfa_enrollments SET disabled_at = now() WHERE user_id = $1 AND disabled_at IS NULL`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("user_mfa_enrollments: disable: %w", err)
	}
	return nil
}

// Delete hard-removes the enrollment row. Use sparingly — Disable is
// preferred so the audit trail survives.
func (r *UserMFAEnrollmentsRepo) Delete(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM user_mfa_enrollments WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("user_mfa_enrollments: delete: %w", err)
	}
	return nil
}
