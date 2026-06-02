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

type AuthOTPCodeRepo struct {
	pool *pgxpool.Pool
}

func NewAuthOTPCodeRepo(pool *pgxpool.Pool) *AuthOTPCodeRepo {
	return &AuthOTPCodeRepo{pool: pool}
}

func (r *AuthOTPCodeRepo) CountRecent(ctx context.Context, purpose, identifier string, since time.Time) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM auth_otp_codes
		WHERE purpose = $1
		  AND identifier = $2
		  AND created_at >= $3
	`, purpose, identifier, since).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("auth otp repo count recent: %w", err)
	}
	return count, nil
}

func (r *AuthOTPCodeRepo) Create(ctx context.Context, record auth.OTPCodeRecord) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO auth_otp_codes (purpose, identifier, code_hash, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, record.Purpose, record.Identifier, record.CodeHash, record.ExpiresAt).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("auth otp repo create: %w", err)
	}
	return id, nil
}

func (r *AuthOTPCodeRepo) LatestActive(ctx context.Context, purpose, identifier string) (*auth.OTPCodeRecord, error) {
	record := &auth.OTPCodeRecord{}
	err := r.pool.QueryRow(ctx, `
		SELECT id, purpose, identifier, code_hash, expires_at, attempts
		FROM auth_otp_codes
		WHERE purpose = $1
		  AND identifier = $2
		  AND used_at IS NULL
		  AND expires_at > now()
		ORDER BY created_at DESC
		LIMIT 1
	`, purpose, identifier).Scan(&record.ID, &record.Purpose, &record.Identifier, &record.CodeHash, &record.ExpiresAt, &record.Attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("auth otp repo latest active: %w", err)
	}
	return record, nil
}

func (r *AuthOTPCodeRepo) IncrementAttempts(ctx context.Context, id string) (int, error) {
	var attempts int
	err := r.pool.QueryRow(ctx, `
		UPDATE auth_otp_codes
		SET attempts = attempts + 1
		WHERE id = $1
		RETURNING attempts
	`, id).Scan(&attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, fmt.Errorf("auth otp repo increment attempts: not found")
	}
	if err != nil {
		return 0, fmt.Errorf("auth otp repo increment attempts: %w", err)
	}
	return attempts, nil
}

func (r *AuthOTPCodeRepo) MarkUsed(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE auth_otp_codes
		SET used_at = now()
		WHERE id = $1 AND used_at IS NULL
	`, id)
	if err != nil {
		return fmt.Errorf("auth otp repo mark used: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("auth otp repo mark used: not found")
	}
	return nil
}

func (r *AuthOTPCodeRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM auth_otp_codes WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("auth otp repo delete: %w", err)
	}
	return nil
}
