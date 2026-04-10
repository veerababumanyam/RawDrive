package auth_test

import (
	"context"
	"testing"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockNotifier records security notifications.
type mockNotifier struct {
	notifications []string
}

func (m *mockNotifier) SendSecurityNotification(ctx context.Context, email, message string) error {
	m.notifications = append(m.notifications, email+": "+message)
	return nil
}

// mockPasswordStore simulates user/password persistence.
type mockPasswordStore struct {
	users          map[string]*auth.User
	failedAttempts map[string]int
	locked         map[string]bool
}

func newMockPasswordStore() *mockPasswordStore {
	return &mockPasswordStore{
		users: map[string]*auth.User{
			"registered@example.com": {ID: "user-1", Email: "registered@example.com"},
		},
		failedAttempts: map[string]int{},
		locked:         map[string]bool{},
	}
}

func (m *mockPasswordStore) FindByEmail(ctx context.Context, email string) (*auth.User, error) {
	if u, ok := m.users[email]; ok {
		return u, nil
	}
	return nil, nil
}

func (m *mockPasswordStore) UpdatePassword(ctx context.Context, email, hashedPassword string) error {
	return nil
}

func (m *mockPasswordStore) RecordFailedAttempt(ctx context.Context, email string) (int, error) {
	m.failedAttempts[email]++
	return m.failedAttempts[email], nil
}

func (m *mockPasswordStore) IsLocked(ctx context.Context, email string) (bool, error) {
	return m.locked[email], nil
}

func newTestPasswordService(notifier auth.SecurityNotifier) auth.PasswordService {
	store := newMockPasswordStore()
	return auth.NewPasswordService(auth.PasswordConfig{
		ResetOTPExpiry:    15 * 60, // 15 minutes in seconds
		MaxFailedAttempts: 5,
		LockoutDuration:   30 * 60, // 30 minutes in seconds
	}, store, notifier)
}

func TestRequestPasswordReset(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	ctx := context.Background()

	err := svc.RequestReset(ctx, "registered@example.com")
	require.NoError(t, err, "requesting reset for registered email should succeed")
}

func TestResetPassword_ValidOTP(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	// Deterministic OTP so the test can submit the matching code and exercise
	// the real verification path. See F-001 password_reset_test.go for the
	// audit context that forced this.
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "123456", nil
	})
	ctx := context.Background()

	err := svc.RequestReset(ctx, "registered@example.com")
	require.NoError(t, err)

	err = svc.ResetPassword(ctx, "registered@example.com", "123456", "NewStrongP@ss1")
	require.NoError(t, err)
}

func TestResetPassword_ExpiredOTP(t *testing.T) {
	notifier := &mockNotifier{}
	svc := auth.NewPasswordService(auth.PasswordConfig{
		ResetOTPExpiry:    0, // immediate expiry
		MaxFailedAttempts: 5,
		LockoutDuration:   30 * 60,
	}, newMockPasswordStore(), notifier)
	ctx := context.Background()

	_ = svc.RequestReset(ctx, "registered@example.com")

	err := svc.ResetPassword(ctx, "registered@example.com", "123456", "NewStrongP@ss1")
	assert.Error(t, err, "expired reset OTP should be rejected")
}

func TestPasswordComplexity(t *testing.T) {
	svc := newTestPasswordService(&mockNotifier{})

	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{"too short", "Ab1", true},
		{"no uppercase", "abcdefg1", true},
		{"no number", "Abcdefgh", true},
		{"no lowercase", "ABCDEFG1", true},
		{"valid password", "StrongP@ss1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.ValidatePassword(tt.password)
			if tt.wantErr {
				assert.Error(t, err, "password %q should be rejected", tt.password)
			} else {
				assert.NoError(t, err, "password %q should be accepted", tt.password)
			}
		})
	}
}

func TestAccountLockout(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		_ = svc.ResetPassword(ctx, "registered@example.com", "wrong-otp", "NewStrongP@ss1")
	}

	err := svc.ResetPassword(ctx, "registered@example.com", "any-code", "NewStrongP@ss1")
	assert.Error(t, err, "account should be locked after 5 failed attempts")
}

func TestEnumerationProtection(t *testing.T) {
	svc := newTestPasswordService(&mockNotifier{})
	ctx := context.Background()

	err1 := svc.RequestReset(ctx, "registered@example.com")
	err2 := svc.RequestReset(ctx, "nonexistent@example.com")

	// Both should return the same result (no error) to prevent enumeration
	assert.Equal(t, err1, err2, "response for registered and unregistered email must be identical")
}

func TestSecurityNotification(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	// Deterministic OTP — see TestResetPassword_ValidOTP comment.
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "123456", nil
	})
	ctx := context.Background()

	_ = svc.RequestReset(ctx, "registered@example.com")
	_ = svc.ResetPassword(ctx, "registered@example.com", "123456", "NewStrongP@ss1")

	assert.NotEmpty(t, notifier.notifications, "should send security notification on password change")
}
