package main

import (
	"context"
	"errors"

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
		ID:          record.ID,
		Email:       record.Email,
		DisplayName: record.DisplayName,
		AvatarURL:   record.AvatarURL,
	}, nil
}

func (s *oauthUserStore) Create(ctx context.Context, record *auth.User) (*auth.User, error) {
	created, err := s.users.Create(ctx, user.CreateUserInput{Email: record.Email})
	if err != nil {
		return nil, err
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
		ID:          created.ID,
		Email:       created.Email,
		DisplayName: record.DisplayName,
		AvatarURL:   record.AvatarURL,
	}, nil
}

func (s *oauthUserStore) LinkOAuth(ctx context.Context, userID, provider, providerID string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO user_auth_methods (user_id, provider, provider_subject)
		SELECT $1, $2, $3
		WHERE NOT EXISTS (
			SELECT 1
			FROM user_auth_methods
			WHERE user_id = $1 AND provider = $2 AND provider_subject = $3
		)
	`, userID, provider, providerID)
	return err
}
