package user

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/phone"
)

// isPhoneUniqueViolation recognizes Postgres 23505 (unique_violation)
// specifically on the users_phone_key constraint. Other unique
// violations (e.g. users_email_key) surface as generic errors; the
// register handler's FindByEmail pre-check already catches the email
// case, so phone is the only one that reaches this path.
func isPhoneUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	if !errors.As(err, &pg) {
		return false
	}
	// Two constraints can guard phone identity depending on which migrations
	// have applied: the legacy global users_phone_key (migration 002) and the
	// partial unique index users_phone_normalized_free_unique (migration 173,
	// "one free account per normalized phone"). Recognize both so a duplicate
	// surfaces as ErrPhoneTaken in either deployment state.
	return pg.Code == "23505" &&
		(pg.ConstraintName == "users_phone_key" ||
			pg.ConstraintName == "users_phone_normalized_free_unique")
}

// PgRepo implements Repository using PostgreSQL.
type PgRepo struct {
	pool *pgxpool.Pool
}

// NewPgRepo creates a new PostgreSQL-backed user repository.
func NewPgRepo(pool *pgxpool.Pool) *PgRepo {
	return &PgRepo{pool: pool}
}

func (r *PgRepo) Create(ctx context.Context, u *User) (*User, error) {
	if u.PlatformRole == "" {
		u.PlatformRole = "photographer"
	}
	// state_id is mandatory at registration per CLAUDE.md. When the
	// caller sets it (> 0), we persist it in the same INSERT that
	// creates the user row. This closes the gap where state_id was
	// validated in the register handler but only written during
	// onboarding — users who skipped onboarding ended up with NULL.
	// Write-through the canonical phone identity alongside the raw phone so
	// phone_normalized is correct for every new account from the moment it is
	// created (the phone-reuse uniqueness rule is enforced on this column, not
	// the raw input). NULLIF coerces "" -> NULL so phoneless accounts stay NULL.
	// phone_reuse_state defaults to 'free' when the caller leaves it empty
	// (COALESCE of NULLIF), matching the column DEFAULT and the CHECK constraint.
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email, phone, phone_normalized, phone_reuse_state, display_name, avatar_url, password_hash, email_verified, platform_role, state_id, district)
		 VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), COALESCE(NULLIF($4, ''), 'free'), NULLIF($5, ''), NULLIF($6, ''), $7, $8, $9, $10, NULLIF($11, ''))
		 RETURNING id`,
		u.Email, u.Phone, phone.Normalize(u.Phone), u.PhoneReuseState, u.DisplayName, u.AvatarURL, u.PasswordHash, u.EmailVerified, u.PlatformRole, u.StateID, nilStrVal(u.District),
	).Scan(&u.ID)
	if err != nil {
		if isPhoneUniqueViolation(err) {
			return nil, ErrPhoneTaken
		}
		return nil, fmt.Errorf("user repo create: %w", err)
	}
	return u, nil
}

// ExistsByNormalizedPhone reports whether any account already holds the given
// canonical phone identity (any reuse state). Backs the registration
// free-vs-paid_pending routing decision. Uses idx_users_phone_normalized
// (migration 171) for an index-only lookup.
func (r *PgRepo) ExistsByNormalizedPhone(ctx context.Context, normalized string) (bool, error) {
	if normalized == "" {
		return false, nil
	}
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE phone_normalized = $1)`, normalized,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("user repo exists by normalized phone: %w", err)
	}
	return exists, nil
}

func (r *PgRepo) GetByID(ctx context.Context, id string) (*User, error) {
	u := &User{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, COALESCE(email,''), COALESCE(phone,''), COALESCE(display_name,''), COALESCE(avatar_url,''), password_hash, email_verified, COALESCE(platform_role,'photographer'), COALESCE(must_change_password, false), state_id, district
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.Phone, &u.DisplayName, &u.AvatarURL, &u.PasswordHash, &u.EmailVerified, &u.PlatformRole, &u.MustChangePassword, &u.StateID, &u.District)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("user repo get by id: %w", err)
	}
	return u, nil
}

func (r *PgRepo) GetByEmail(ctx context.Context, email string) (*User, error) {
	u := &User{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, COALESCE(email,''), COALESCE(phone,''), COALESCE(display_name,''), COALESCE(avatar_url,''), password_hash, email_verified, COALESCE(platform_role,'photographer'), COALESCE(must_change_password, false), state_id, district
		 FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.Phone, &u.DisplayName, &u.AvatarURL, &u.PasswordHash, &u.EmailVerified, &u.PlatformRole, &u.MustChangePassword, &u.StateID, &u.District)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("user repo get by email: %w", err)
	}
	return u, nil
}

// nilStrVal dereferences a *string for SQL params; returns "" when nil so
// NULLIF($n, ”) coerces it to SQL NULL.
func nilStrVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (r *PgRepo) Update(ctx context.Context, u *User) (*User, error) {
	// Keep phone_normalized in lockstep with any raw phone change so the
	// canonical identity never drifts from the displayed number.
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET display_name = $1, avatar_url = $2, phone = NULLIF($3, ''), phone_normalized = NULLIF($4, ''), state_id = $5, district = NULLIF($6, ''), updated_at = now() WHERE id = $7`,
		u.DisplayName, u.AvatarURL, u.Phone, phone.Normalize(u.Phone), u.StateID, nilStrVal(u.District), u.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("user repo update: %w", err)
	}
	return u, nil
}

func (r *PgRepo) MarkEmailVerified(ctx context.Context, id string) error {
	cmdTag, err := r.pool.Exec(ctx, `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("user repo mark email verified: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PgRepo) UpdatePasswordByID(ctx context.Context, id, hashedPassword string, mustChange bool) error {
	cmdTag, err := r.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1, must_change_password = $2, updated_at = now() WHERE id = $3`,
		hashedPassword, mustChange, id,
	)
	if err != nil {
		return fmt.Errorf("user repo update password by id: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
