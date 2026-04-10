package auth_test

import (
	"context"
	"testing"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Tests for F-001 (audit 2026-04-10): password reset must enforce exact,
// constant-time OTP comparison. Previously the ResetPassword path accepted any
// present+unexpired entry, which allowed full account takeover.
//
// The tests below use auth.SetPasswordServiceCodeGeneratorForTest to inject a
// deterministic OTP generator so the test can submit the "right" value to
// ResetPassword — the previous test file worked around this by disabling the
// check entirely, which is how the hole shipped.

func TestResetPassword_WrongOTPRejected(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "654321", nil
	})
	ctx := context.Background()

	require.NoError(t, svc.RequestReset(ctx, "registered@example.com"))

	err := svc.ResetPassword(ctx, "registered@example.com", "000000", "NewStrongP@ss1")
	assert.Error(t, err, "wrong OTP must be rejected")
	assert.Empty(t, notifier.notifications,
		"wrong OTP must not trigger a password-change notification")
}

func TestResetPassword_CorrectOTPSucceeds(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "654321", nil
	})
	ctx := context.Background()

	require.NoError(t, svc.RequestReset(ctx, "registered@example.com"))

	err := svc.ResetPassword(ctx, "registered@example.com", "654321", "NewStrongP@ss1")
	assert.NoError(t, err, "correct OTP must succeed")
	assert.NotEmpty(t, notifier.notifications,
		"successful reset must trigger a password-change notification")
}

func TestResetPassword_ReplayedOTPRejected(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "654321", nil
	})
	ctx := context.Background()

	require.NoError(t, svc.RequestReset(ctx, "registered@example.com"))
	require.NoError(t, svc.ResetPassword(ctx, "registered@example.com", "654321", "NewStrongP@ss1"))

	// Second attempt with the same (already-consumed) OTP must be rejected —
	// consuming the reset entry is part of the one-time-use contract.
	err := svc.ResetPassword(ctx, "registered@example.com", "654321", "AnotherP@ss2")
	assert.Error(t, err, "replayed OTP must be rejected after one-time use")
}

func TestResetPassword_WrongOTPIncrementsFailedAttempts(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "654321", nil
	})
	ctx := context.Background()

	require.NoError(t, svc.RequestReset(ctx, "registered@example.com"))

	// 5 wrong attempts should consume the lockout budget.
	for i := 0; i < 5; i++ {
		_ = svc.ResetPassword(ctx, "registered@example.com", "000000", "NewStrongP@ss1")
	}

	// 6th attempt — even with the correct OTP — must be rejected because the
	// account is locked. This prevents an attacker from guessing past lockout
	// by eventually hitting the real code.
	err := svc.ResetPassword(ctx, "registered@example.com", "654321", "NewStrongP@ss1")
	assert.Error(t, err, "wrong OTPs must count toward lockout budget")
}

func TestResetPassword_LengthMismatchRejected(t *testing.T) {
	notifier := &mockNotifier{}
	svc := newTestPasswordService(notifier)
	auth.SetPasswordServiceCodeGeneratorForTest(svc, func(int) (string, error) {
		return "654321", nil
	})
	ctx := context.Background()

	require.NoError(t, svc.RequestReset(ctx, "registered@example.com"))

	// Empty and differing-length OTPs must be rejected without any special
	// casing — constant-time comparison returns 0 immediately on length
	// mismatch, which is the correct behavior here.
	err1 := svc.ResetPassword(ctx, "registered@example.com", "", "NewStrongP@ss1")
	assert.Error(t, err1, "empty OTP must be rejected")

	err2 := svc.ResetPassword(ctx, "registered@example.com", "6543", "NewStrongP@ss1")
	assert.Error(t, err2, "shorter OTP must be rejected")
}
