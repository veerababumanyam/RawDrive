package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// F-007 (M17 wave 2): user MFA recovery codes repository.
//
// Stores bcrypt-hashed one-time recovery codes. The plaintext codes are
// shown to the user exactly once at enrollment (and at regeneration) and
// then discarded — only the hash lives in the DB. Consumption is one-way:
// once consumed_at is non-null, the code can never be used again.

// UserMFARecoveryCode is the DB row shape for user_mfa_recovery_codes.
type UserMFARecoveryCode struct {
	ID         uuid.UUID  `json:"id"`
	UserID     uuid.UUID  `json:"user_id"`
	CodeHash   string     `json:"-"`
	ConsumedAt *time.Time `json:"consumed_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// UserMFARecoveryCodesRepo persists one-time recovery codes.
type UserMFARecoveryCodesRepo struct {
	pool *pgxpool.Pool
}

// NewUserMFARecoveryCodesRepo constructs the repo. Accepts nil pool for
// unit-test constructor verification.
func NewUserMFARecoveryCodesRepo(pool *pgxpool.Pool) *UserMFARecoveryCodesRepo {
	return &UserMFARecoveryCodesRepo{pool: pool}
}

// BulkInsert persists a batch of bcrypt hashes for a user. Each hash
// becomes a new active recovery code. Callers pass the output of
// auth.RecoveryCodeService.Generate().Hashes directly.
//
// Batches are small (10 rows by default) so a single multi-value INSERT
// is cheaper than opening a transaction or CopyFrom stream.
func (r *UserMFARecoveryCodesRepo) BulkInsert(ctx context.Context, userID uuid.UUID, hashes []string) error {
	if userID == uuid.Nil {
		return errors.New("user_mfa_recovery_codes: user_id required")
	}
	if len(hashes) == 0 {
		return errors.New("user_mfa_recovery_codes: at least one hash required")
	}
	args := make([]any, 0, len(hashes)*2)
	placeholders := make([]string, 0, len(hashes))
	for i, h := range hashes {
		if h == "" {
			return errors.New("user_mfa_recovery_codes: empty hash in batch")
		}
		placeholders = append(placeholders, fmt.Sprintf("($%d, $%d)", i*2+1, i*2+2))
		args = append(args, userID, h)
	}
	sql := "INSERT INTO user_mfa_recovery_codes (user_id, code_hash) VALUES " +
		strings.Join(placeholders, ", ")
	if _, err := r.pool.Exec(ctx, sql, args...); err != nil {
		return fmt.Errorf("user_mfa_recovery_codes: bulk insert: %w", err)
	}
	return nil
}

// ListActive returns every non-consumed recovery code for a user. Used
// at recovery time — callers iterate and Verify each hash via
// auth.RecoveryCodeService.Verify, then MarkConsumed on a match.
func (r *UserMFARecoveryCodesRepo) ListActive(ctx context.Context, userID uuid.UUID) ([]UserMFARecoveryCode, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, code_hash, consumed_at, created_at
		 FROM user_mfa_recovery_codes
		 WHERE user_id = $1 AND consumed_at IS NULL
		 ORDER BY created_at ASC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("user_mfa_recovery_codes: list active: %w", err)
	}
	defer rows.Close()

	var out []UserMFARecoveryCode
	for rows.Next() {
		var c UserMFARecoveryCode
		if err := rows.Scan(&c.ID, &c.UserID, &c.CodeHash, &c.ConsumedAt, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("user_mfa_recovery_codes: scan: %w", err)
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("user_mfa_recovery_codes: rows err: %w", err)
	}
	return out, nil
}

// MarkConsumed stamps consumed_at on a specific code row. Call this
// immediately after a successful recovery-code verification so a parallel
// request cannot reuse the same code.
func (r *UserMFARecoveryCodesRepo) MarkConsumed(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE user_mfa_recovery_codes
		 SET consumed_at = now()
		 WHERE id = $1 AND consumed_at IS NULL`,
		id,
	)
	if err != nil {
		return fmt.Errorf("user_mfa_recovery_codes: mark consumed: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user_mfa_recovery_codes: already consumed or not found")
	}
	return nil
}

// CountActive returns the number of unused recovery codes for a user.
// Callers surface this in settings ("you have N codes remaining").
func (r *UserMFARecoveryCodesRepo) CountActive(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM user_mfa_recovery_codes
		 WHERE user_id = $1 AND consumed_at IS NULL`,
		userID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("user_mfa_recovery_codes: count active: %w", err)
	}
	return count, nil
}

// DeleteAll removes every recovery code for a user. Called at
// regenerate time so the old codes are invalidated before new ones are
// inserted via BulkInsert.
func (r *UserMFARecoveryCodesRepo) DeleteAll(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM user_mfa_recovery_codes WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("user_mfa_recovery_codes: delete all: %w", err)
	}
	return nil
}
