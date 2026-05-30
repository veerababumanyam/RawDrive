package user_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/rawdrive/backend/internal/user"
)

// TestAuthAdapter_Create_TranslatesPhoneTaken pins the cross-package
// contract that keeps the auth handler off the 500 path for phone
// collisions. user.ErrPhoneTaken from the repo must come back out of
// the adapter as auth.ErrPhoneTaken — the handler only imports auth,
// so this translation is the only way it can recognize the condition
// without creating a cycle.
func TestAuthAdapter_Create_TranslatesPhoneTaken(t *testing.T) {
	svc := user.NewService(newMockUserRepo())
	ctx := context.Background()

	// First register claims the phone.
	_, err := user.NewAuthAdapter(svc).Create(
		ctx, "first@example.com", "Secret12345", "First", "+919876543210", nil, "",
	)
	require.NoError(t, err)

	// Second register with the same phone must surface as
	// auth.ErrPhoneTaken, NOT user.ErrPhoneTaken (cycle-safe) and NOT
	// a generic wrapped error.
	_, err = user.NewAuthAdapter(svc).Create(
		ctx, "second@example.com", "Secret12345", "Second", "+919876543210", nil, "",
	)
	require.Error(t, err)
	assert.True(t, errors.Is(err, auth.ErrPhoneTaken),
		"adapter must translate user.ErrPhoneTaken → auth.ErrPhoneTaken; got %v", err)
}

// TestAuthAdapter_Create_PropagatesOtherErrors guards against
// over-translation — a non-phone error from the service layer must
// pass through untouched so the handler logs it and returns a 500
// with a meaningful server-side log line.
func TestAuthAdapter_Create_PropagatesOtherErrors(t *testing.T) {
	svc := user.NewService(newMockUserRepo())
	ctx := context.Background()

	// Seed an email.
	_, err := user.NewAuthAdapter(svc).Create(
		ctx, "dup@example.com", "Secret12345", "First", "", nil, "",
	)
	require.NoError(t, err)

	// Duplicate email comes back as user.ErrConflict (handled upstream
	// by the register handler's FindByEmail pre-check, but the adapter
	// must not translate it to auth.ErrPhoneTaken).
	_, err = user.NewAuthAdapter(svc).Create(
		ctx, "dup@example.com", "Secret12345", "Dup", "", nil, "",
	)
	require.Error(t, err)
	assert.False(t, errors.Is(err, auth.ErrPhoneTaken),
		"non-phone error must not translate to auth.ErrPhoneTaken; got %v", err)
	assert.True(t, errors.Is(err, user.ErrConflict),
		"duplicate email must propagate as user.ErrConflict; got %v", err)
}
