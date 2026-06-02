package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/rawdrive/backend/internal/user"
)

type oauthUserStore struct {
	users user.Service
	db    *pgxpool.Pool
}

func newOAuthUserStore(users user.Service, db *pgxpool.Pool) *oauthUserStore {
	return &oauthUserStore{
		users: users,
		db:    db,
	}
}

func (s *oauthUserStore) FindByEmail(ctx context.Context, email string) (*auth.User, error) {
	record, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, user.ErrNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &auth.User{
		ID:            record.ID,
		Email:         record.Email,
		DisplayName:   record.DisplayName,
		AvatarURL:     record.AvatarURL,
		EmailVerified: record.EmailVerified,
	}, nil
}

func (s *oauthUserStore) FindByOAuth(ctx context.Context, provider, providerID string) (*auth.User, error) {
	row := s.db.QueryRow(ctx, `
		SELECT u.id, COALESCE(u.email,''), COALESCE(u.display_name,''), COALESCE(u.avatar_url,''), u.email_verified
		FROM user_auth_methods m
		JOIN users u ON u.id = m.user_id
		WHERE m.provider = $1 AND m.provider_subject = $2
	`, provider, providerID)

	record := &auth.User{}
	err := row.Scan(&record.ID, &record.Email, &record.DisplayName, &record.AvatarURL, &record.EmailVerified)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("oauth store find by oauth: %w", err)
	}
	return record, nil
}

func (s *oauthUserStore) Create(ctx context.Context, record *auth.User) (*auth.User, error) {
	created, err := s.users.Create(ctx, user.CreateUserInput{Email: record.Email})
	if err != nil {
		return nil, err
	}
	if record.EmailVerified {
		if _, err := s.db.Exec(ctx, `UPDATE users SET email_verified = TRUE, updated_at = now() WHERE id = $1`, created.ID); err != nil {
			return nil, fmt.Errorf("oauth store mark email verified: %w", err)
		}
		created.EmailVerified = true
	}

	update := user.UpdateUserInput{}
	var shouldUpdate bool
	if record.DisplayName != "" {
		update.DisplayName = &record.DisplayName
		shouldUpdate = true
	}
	if record.AvatarURL != "" {
		update.AvatarURL = &record.AvatarURL
		shouldUpdate = true
	}
	if shouldUpdate {
		if _, err := s.users.Update(ctx, created.ID, update); err != nil {
			return nil, err
		}
	}

	return &auth.User{
		ID:            created.ID,
		Email:         created.Email,
		DisplayName:   record.DisplayName,
		AvatarURL:     record.AvatarURL,
		EmailVerified: created.EmailVerified,
	}, nil
}

func (s *oauthUserStore) BackfillProfile(ctx context.Context, userID, displayName, avatarURL string) error {
	update := user.UpdateUserInput{}
	if displayName != "" {
		update.DisplayName = &displayName
	}
	if avatarURL != "" {
		update.AvatarURL = &avatarURL
	}
	_, err := s.users.Update(ctx, userID, update)
	return err
}

func (s *oauthUserStore) LinkOAuth(ctx context.Context, userID, provider, providerID string) error {
	tag, err := s.db.Exec(ctx, `
		INSERT INTO user_auth_methods (user_id, provider, provider_subject)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, userID, provider, providerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}

	var linkedUserID string
	err = s.db.QueryRow(ctx, `
		SELECT user_id
		FROM user_auth_methods
		WHERE provider = $1 AND provider_subject = $2
	`, provider, providerID).Scan(&linkedUserID)
	if err == nil {
		if linkedUserID == userID {
			return nil
		}
		return auth.ErrOAuthAccountConflict
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	var linkedSubject string
	err = s.db.QueryRow(ctx, `
		SELECT provider_subject
		FROM user_auth_methods
		WHERE user_id = $1 AND provider = $2
	`, userID, provider).Scan(&linkedSubject)
	if err == nil && linkedSubject != providerID {
		return auth.ErrOAuthAccountConflict
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	return auth.ErrOAuthAccountConflict
}
