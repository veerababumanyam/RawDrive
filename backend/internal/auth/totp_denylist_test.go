package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeCodeDenylist is an in-memory CodeDenylist for tests. It records
// keys in a map and can be configured to return errors.
type fakeCodeDenylist struct {
	used    map[string]bool
	forcErr error
}

func newFakeCodeDenylist() *fakeCodeDenylist {
	return &fakeCodeDenylist{used: make(map[string]bool)}
}

func (f *fakeCodeDenylist) MarkUsed(_ context.Context, key string, _ time.Duration) (bool, error) {
	if f.forcErr != nil {
		return false, f.forcErr
	}
	if f.used[key] {
		return false, nil
	}
	f.used[key] = true
	return true, nil
}

// TestTOTPVerify_ValkeyDenylist_PreventsReplay verifies that when a
// CodeDenylist is wired, a replayed code is rejected even when the
// in-process sync.Map has been reset (simulating the second node scenario).
func TestTOTPVerify_ValkeyDenylist_PreventsReplay(t *testing.T) {
	dl := newFakeCodeDenylist()
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"}, dl)

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	code, err := totp.GenerateCode(enrollment.Secret, time.Now())
	require.NoError(t, err)

	// First use succeeds.
	ok, err := svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	assert.True(t, ok, "first verification must succeed")

	// Second use on a freshly constructed service (same denylist) must fail.
	svc2 := NewTOTPService(TOTPConfig{Issuer: "RawDrive"}, dl)
	ok2, err2 := svc2.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err2)
	assert.False(t, ok2, "replay on second node (same denylist) must be rejected")
}

// TestTOTPVerify_ValkeyDenylist_FallsBackOnError ensures that when
// CodeDenylist.MarkUsed returns an error, Verify falls back to the
// in-process sync.Map and still enforces replay protection locally.
func TestTOTPVerify_ValkeyDenylist_FallsBackOnError(t *testing.T) {
	dl := newFakeCodeDenylist()
	dl.forcErr = errors.New("valkey unavailable")
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"}, dl).(*totpService)

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	code, err := totp.GenerateCode(enrollment.Secret, time.Now())
	require.NoError(t, err)

	// First call: denylist errors → sync.Map path records the entry.
	ok, err := svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	assert.True(t, ok, "first verification must succeed via sync.Map fallback")

	// Second call: same error → sync.Map rejects the replay.
	ok2, err2 := svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err2)
	assert.False(t, ok2, "replay must be rejected by sync.Map fallback even when denylist errors")
}

// TestTOTPVerify_NoDenylist_BackwardCompat confirms that NewTOTPService
// with no denylist argument behaves exactly as before (sync.Map replay protection).
func TestTOTPVerify_NoDenylist_BackwardCompat(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	code, err := totp.GenerateCode(enrollment.Secret, time.Now())
	require.NoError(t, err)

	ok, err := svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	assert.True(t, ok)

	// Immediate replay rejected by sync.Map.
	ok2, err2 := svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err2)
	assert.False(t, ok2, "replay must be rejected by sync.Map when no denylist configured")
}
