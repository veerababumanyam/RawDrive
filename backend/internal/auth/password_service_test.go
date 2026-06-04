package auth_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

// mockNotifier records security notifications.
type mockNotifier struct {
	notifications  []string
	passwordResets []string // recorded by SendPasswordResetOTP, format "email: code"
}

func (m *mockNotifier) SendSecurityNotification(ctx context.Context, email, message string) error {
	m.notifications = append(m.notifications, email+": "+message)
	return nil
}

func (m *mockNotifier) SendPasswordResetOTP(ctx context.Context, email, code string, expirySeconds int) error {
	m.passwordResets = append(m.passwordResets, email+": "+code)
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
		// Password policy unified at a 12-char floor (public-pages review
		// 2026-06-04, P0 #3). An 11-char password that previously satisfied the
		// old 8-char minimum must now be rejected so registration matches the
		// reset/admin floor. The complexity cases use 12+ chars so they exercise
		// the upper/lower/digit branches rather than tripping the length gate.
		{"11 chars rejected", "StrongP@ss1", true},
		{"no uppercase", "abcdefg12345", true},
		{"no number", "Abcdefghijkl", true},
		{"no lowercase", "ABCDEFG12345", true},
		{"too long", "Aa1!" + strings.Repeat("x", 69), true},
		{"valid password", "StrongP@ss12", false},
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

func TestResetPassword_RejectsOverlongPasswordBeforeHash(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "123456", nil
	})
	ctx := context.Background()

	require.NoError(t, svc.RequestReset(ctx, "registered@example.com"))
	err := svc.ResetPassword(ctx, "registered@example.com", "123456", "Aa1!"+strings.Repeat("x", 69))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "at most 72")
	assert.Empty(t, notifier.notifications, "overlong password must be rejected before password update/security notification")
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

// blockingNotifier parks inside exactly one of its two methods (selected via
// blockReset / blockSecurity) and only for blockEmail, until release is closed.
// Every other path/recipient returns immediately. Gating on a single method +
// recipient is deliberate: the concurrent "second" caller uses a different
// email, so it never parks inside the notifier itself — the only thing that can
// stall it is the service mutex. It also lets the ResetPassword test seed a
// reset entry via RequestReset without deadlocking on SendPasswordResetOTP.
type blockingNotifier struct {
	blockEmail    string
	entered       chan struct{}
	release       chan struct{}
	blockReset    bool // park inside SendPasswordResetOTP (for blockEmail)
	blockSecurity bool // park inside SendSecurityNotification (for blockEmail)
}

func (n *blockingNotifier) SendSecurityNotification(ctx context.Context, email, message string) error {
	if n.blockSecurity && email == n.blockEmail {
		n.entered <- struct{}{}
		<-n.release
	}
	return nil
}

func (n *blockingNotifier) SendPasswordResetOTP(ctx context.Context, email, code string, expirySeconds int) error {
	if n.blockReset && email == n.blockEmail {
		n.entered <- struct{}{}
		<-n.release
	}
	return nil
}

// TestF031_RequestResetDoesNotHoldMutexAcrossSend is the F-031 regression test
// for RequestReset. Before the fix, RequestReset held s.mu across FindByEmail
// (DB) and SendPasswordResetOTP (SMTP), so a single slow send serialized every
// concurrent reset request. This parks one RequestReset inside the blocking
// notifier and proves a second RequestReset can still complete.
func TestF031_RequestResetDoesNotHoldMutexAcrossSend(t *testing.T) {
	notifier := &blockingNotifier{
		blockEmail: "registered@example.com",
		entered:    make(chan struct{}, 1),
		release:    make(chan struct{}),
		blockReset: true,
	}
	svc := newTestPasswordService(notifier)
	ctx := context.Background()

	firstDone := make(chan error, 1)
	go func() {
		firstDone <- svc.RequestReset(ctx, "registered@example.com")
	}()

	select {
	case <-notifier.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("first RequestReset never reached the notifier")
	}

	secondDone := make(chan error, 1)
	go func() {
		// Different (unregistered) email so the second call does not itself
		// invoke the blocking notifier — it must still return promptly.
		secondDone <- svc.RequestReset(ctx, "someoneelse@example.com")
	}()

	select {
	case err := <-secondDone:
		require.NoError(t, err, "concurrent RequestReset should succeed while first is mid-send")
	case <-time.After(2 * time.Second):
		t.Fatal("F-031: concurrent RequestReset blocked — mutex is held across SendPasswordResetOTP")
	}

	close(notifier.release)
	select {
	case err := <-firstDone:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("first RequestReset did not return after release")
	}
}

// TestF031_ResetPasswordDoesNotHoldMutexAcrossSend is the F-031 regression test
// for ResetPassword. Before the fix, ResetPassword held s.mu across the slow
// bcrypt hash, UpdatePassword (DB), and SendSecurityNotification (SMTP), so a
// successful reset blocked every other concurrent reset for that whole window.
//
// The test parks the first (successful) ResetPassword inside the blocking
// security notifier, then asserts a concurrent reset for a different account
// returns promptly. Under the bug the second call blocks on s.mu.Lock() until
// the first releases (after the notifier returns); under the fix the lock is
// released right after OTP verification, so the second call returns immediately.
//
// We do NOT gate on the first call reaching the notifier with a tight deadline:
// production bcrypt cost 12 takes ~2.8s under the race detector, all of it
// AFTER the lock is released in the fixed code, so a small budget there would
// be a false negative. Generous budgets bound the slow-but-correct path; the
// short budget on the concurrent call is the discriminating assertion.
func TestF031_ResetPasswordDoesNotHoldMutexAcrossSend(t *testing.T) {
	notifier := &blockingNotifier{
		blockEmail:    "registered@example.com",
		entered:       make(chan struct{}, 1),
		release:       make(chan struct{}),
		blockSecurity: true, // park only on the ResetPassword security notification
	}
	svc := newTestPasswordService(notifier)
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "123456", nil
	})
	ctx := context.Background()

	// Seed a valid reset entry, then drive ResetPassword to success so it parks
	// inside SendSecurityNotification (holding the lock the whole time, pre-fix).
	require.NoError(t, svc.RequestReset(ctx, "registered@example.com"))

	firstDone := make(chan error, 1)
	go func() {
		firstDone <- svc.ResetPassword(ctx, "registered@example.com", "123456", "NewStrongP@ss1")
	}()

	// Wait until the first call has reached the notifier. This is the point at
	// which, in the BUGGY code, the lock is still held (the notifier runs inside
	// the locked region pre-fix); in the FIXED code the lock is already free.
	// Either way, once we are here the discriminating second call is meaningful.
	// 10s comfortably exceeds bcrypt-cost-12-under-race (~2.8s).
	select {
	case <-notifier.entered:
	case err := <-firstDone:
		t.Fatalf("first ResetPassword returned before reaching SendSecurityNotification: %v", err)
	case <-time.After(10 * time.Second):
		t.Fatal("first ResetPassword never reached SendSecurityNotification")
	}

	// A concurrent reset for a different account must not block on the mutex.
	// It fails OTP verification (no reset entry) but must return promptly. Under
	// the bug it blocks until notifier.release is closed; under the fix it is
	// immediate. A 2s budget cleanly separates the two.
	secondDone := make(chan error, 1)
	go func() {
		secondDone <- svc.ResetPassword(ctx, "nonexistent@example.com", "000000", "AnotherP@ss1")
	}()

	select {
	case <-secondDone:
		// Returning at all (regardless of the OTP error) proves it wasn't blocked.
	case <-time.After(2 * time.Second):
		t.Fatal("F-031: concurrent ResetPassword blocked — mutex is held across I/O")
	}

	close(notifier.release)
	select {
	case err := <-firstDone:
		require.NoError(t, err)
	case <-time.After(10 * time.Second):
		t.Fatal("first ResetPassword did not return after release")
	}
}
