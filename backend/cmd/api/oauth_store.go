package main

import (
	"context"
	"errors"

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
		ID:          record.ID,
		Email:       record.Email,
		DisplayName: record.DisplayName,
		AvatarURL:   record.AvatarURL,
		// S1-G1 / AREA-AUTH-4: expose verification state so the OAuth callback
		// refuses to auto-link a Google identity onto an unverified local
		// account (pre-registration account-takeover defense).
		EmailVerified: record.EmailVerified,
	}, nil
}

// FindByProviderSubject resolves the local account already linked to a given
// (provider, provider_subject) pair via the user_auth_methods join. Returns
// (nil, nil) when no link exists. This is the PRIMARY identity resolution for
// repeat OAuth logins (S1-G2 / AREA-AUTH-3): the stable Google "sub", not the
// mutable email, decides who is logging in.
func (s *oauthUserStore) FindByProviderSubject(ctx context.Context, provider, providerSubject string) (*auth.User, error) {
	var userID string
	err := s.db.QueryRow(ctx, `
		SELECT user_id
		FROM user_auth_methods
		WHERE provider = $1 AND provider_subject = $2
		LIMIT 1
	`, provider, providerSubject).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	record, err := s.users.GetByID(ctx, userID)
	if err != nil {
		// A dangling link (auth method present, user row gone) must not block
		// login resolution — treat it as "not found" so the caller falls back
		// to email-based first-time linking.
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

// MarkEmailVerified flips users.email_verified to TRUE. The OAuth callback
// calls this for accounts it creates from a Google-verified identity so the
// resulting local account is born activated (Google proved email ownership).
func (s *oauthUserStore) MarkEmailVerified(ctx context.Context, userID string) error {
	return s.users.MarkEmailVerified(ctx, userID)
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
	// Migration 133 adds UNIQUE (provider, provider_subject) and
	// UNIQUE (user_id, provider). ON CONFLICT DO NOTHING makes re-linking the
	// same identity idempotent and race-safe (the prior WHERE NOT EXISTS guard
	// was a check-then-insert TOCTOU). The constraint also prevents one Google
	// subject from being attached to a second local account.
	_, err := s.db.Exec(ctx, `
		INSERT INTO user_auth_methods (user_id, provider, provider_subject)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, userID, provider, providerID)
	return err
}
