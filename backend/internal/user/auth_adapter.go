package user

import (
	"context"
	"errors"

	"golang.org/x/crypto/bcrypt"
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

// Create creates a new user and returns the user ID.
func (a *AuthAdapter) Create(ctx context.Context, email, password string) (string, error) {
	u, err := a.svc.Create(ctx, CreateUserInput{Email: email, Password: password})
	if err != nil {
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
