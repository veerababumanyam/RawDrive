package user

import (
	"context"
	"errors"

	"golang.org/x/crypto/bcrypt"

	"github.com/rawdrive/backend/internal/auth"
)

// AuthAdapter adapts user.Service to the auth.UserService interface.
// auth.UserService expects: Create(ctx, email) (string, error)
//                           FindByEmail(ctx, email) (string, bool, error)
type AuthAdapter struct {
	svc Service
}

// NewAuthAdapter wraps a user.Service for use by auth handlers.
func NewAuthAdapter(svc Service) *AuthAdapter {
	return &AuthAdapter{svc: svc}
}

// Create creates a new user and returns the user ID. stateID is the
// mandatory Indian state selection from the register form; it is
// persisted directly in the INSERT so the user row never has a NULL
// state_id even if onboarding is skipped or interrupted.
//
// Phone-uniqueness collisions come back from the repo as
// user.ErrPhoneTaken. We translate those to auth.ErrPhoneTaken so the
// auth package can recognize the condition and respond 409 without
// needing to import this package (which would create a cycle —
// user already imports auth for UserProfile).
func (a *AuthAdapter) Create(ctx context.Context, email, password, displayName, phone string, stateID int) (string, error) {
	u, err := a.svc.Create(ctx, CreateUserInput{Email: email, Password: password, DisplayName: displayName, Phone: phone, StateID: stateID})
	if err != nil {
		if errors.Is(err, ErrPhoneTaken) {
			return "", auth.ErrPhoneTaken
		}
		return "", err
	}
	return u.ID, nil
}

// FindByEmail returns (userID, exists, error).
func (a *AuthAdapter) FindByEmail(ctx context.Context, email string) (string, bool, error) {
	u, err := a.svc.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return u.ID, true, nil
}

// VerifyPassword returns (userID, email_verified, exists, error)
func (a *AuthAdapter) VerifyPassword(ctx context.Context, email, password string) (string, bool, bool, error) {
	u, err := a.svc.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return "", false, false, nil
		}
		return "", false, false, err
	}
	if u.PasswordHash == nil {
		return "", false, false, errors.New("user has no password set")
	}
	
	err = bcrypt.CompareHashAndPassword([]byte(*u.PasswordHash), []byte(password))
	if err != nil {
		return "", false, false, nil // password mismatch is not an error, just means no match
	}
	return u.ID, u.EmailVerified, true, nil
}

func (a *AuthAdapter) MarkEmailVerified(ctx context.Context, userID string) error {
	return a.svc.MarkEmailVerified(ctx, userID)
}

// GetProfileByID returns (profile, exists, error). ErrNotFound translates
// to (nil, false, nil) so GET /auth/me can render a clean 404 without
// logging. Added 2026-04-12 to back the dashboard's current-user call.
func (a *AuthAdapter) GetProfileByID(ctx context.Context, userID string) (*auth.UserProfile, bool, error) {
	u, err := a.svc.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return &auth.UserProfile{
		ID:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		AvatarURL:   u.AvatarURL,
	}, true, nil
}
