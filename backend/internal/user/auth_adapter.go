package user

import (
	"context"
	"errors"
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
func (a *AuthAdapter) Create(ctx context.Context, email string) (string, error) {
	u, err := a.svc.Create(ctx, CreateUserInput{Email: email})
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
