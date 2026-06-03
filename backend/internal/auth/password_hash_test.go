package auth_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/rawdrive/backend/internal/auth"
)

// Regression for F-001 (audit 2026-05-30): ResetPassword previously passed the
// raw newPassword straight to PasswordStore.UpdatePassword, which writes its
// argument verbatim into users.password_hash — storing the plaintext password
// on every forgot-password reset. The store value must be a bcrypt hash of the
// plaintext, never the plaintext itself.

// capturingPasswordStore records the exact value handed to UpdatePassword so
// the test can assert it was hashed before persistence.
type capturingPasswordStore struct {
	stored map[string]string
}

func newCapturingPasswordStore() *capturingPasswordStore {
	return &capturingPasswordStore{stored: map[string]string{}}
}

func (m *capturingPasswordStore) FindByEmail(ctx context.Context, email string) (*auth.User, error) {
	return &auth.User{ID: "user-1", Email: email}, nil
}

func (m *capturingPasswordStore) UpdatePassword(ctx context.Context, email, hashedPassword string) error {
	m.stored[email] = hashedPassword
	return nil
}

func (m *capturingPasswordStore) RecordFailedAttempt(ctx context.Context, email string) (int, error) {
	return 0, nil
}

func (m *capturingPasswordStore) IsLocked(ctx context.Context, email string) (bool, error) {
	return false, nil
}

func TestResetPassword_StoresBcryptHashNotPlaintext(t *testing.T) {
	const (
		email     = "registered@example.com"
		otp       = "654321"
		plaintext = "NewStrongP@ss1"
	)

	store := newCapturingPasswordStore()
	svc := auth.NewPasswordService(auth.PasswordConfig{
		ResetOTPExpiry:    15 * 60,
		MaxFailedAttempts: 5,
		LockoutDuration:   30 * 60,
	}, store, &mockNotifier{})
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return otp, nil
	})
	ctx := context.Background()

	require.NoError(t, svc.RequestReset(ctx, email))
	require.NoError(t, svc.ResetPassword(ctx, email, otp, plaintext))

	stored, ok := store.stored[email]
	require.True(t, ok, "ResetPassword must persist the new password")

	// The value written to password_hash must NOT be the raw plaintext.
	assert.NotEqual(t, plaintext, stored,
		"ResetPassword stored the plaintext password — it must be hashed (F-001)")

	// And it must be a bcrypt hash that verifies against the plaintext, so the
	// user can still authenticate with the password they chose.
	assert.NoError(t, bcrypt.CompareHashAndPassword([]byte(stored), []byte(plaintext)),
		"stored value must be a bcrypt hash of the new password")
}
