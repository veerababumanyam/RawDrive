package user

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
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
	return pg.Code == "23505" && pg.ConstraintName == "users_phone_key"
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
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email, phone, display_name, avatar_url, password_hash, email_verified, platform_role, state_id)
		 VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8)
		 RETURNING id`,
		u.Email, u.Phone, u.DisplayName, u.AvatarURL, u.PasswordHash, u.EmailVerified, u.PlatformRole, u.StateID,
	).Scan(&u.ID)
	if err != nil {
		if isPhoneUniqueViolation(err) {
			return nil, ErrPhoneTaken
		}
		return nil, fmt.Errorf("user repo create: %w", err)
	}
	return u, nil
}

func (r *PgRepo) GetByID(ctx context.Context, id string) (*User, error) {
	u := &User{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, COALESCE(email,''), COALESCE(phone,''), COALESCE(display_name,''), COALESCE(avatar_url,''), password_hash, email_verified, COALESCE(platform_role,'photographer'), COALESCE(must_change_password, false)
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.Phone, &u.DisplayName, &u.AvatarURL, &u.PasswordHash, &u.EmailVerified, &u.PlatformRole, &u.MustChangePassword)
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
		`SELECT id, COALESCE(email,''), COALESCE(phone,''), COALESCE(display_name,''), COALESCE(avatar_url,''), password_hash, email_verified, COALESCE(platform_role,'photographer'), COALESCE(must_change_password, false)
		 FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.Phone, &u.DisplayName, &u.AvatarURL, &u.PasswordHash, &u.EmailVerified, &u.PlatformRole, &u.MustChangePassword)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("user repo get by email: %w", err)
	}
	return u, nil
}

func (r *PgRepo) Update(ctx context.Context, u *User) (*User, error) {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET display_name = $1, avatar_url = $2, phone = NULLIF($3, ''), updated_at = now() WHERE id = $4`,
		u.DisplayName, u.AvatarURL, u.Phone, u.ID,
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
