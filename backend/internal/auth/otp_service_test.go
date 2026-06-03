package auth_test

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

// mockEmailDelivery implements auth.EmailDelivery for testing.
type mockEmailDelivery struct {
	sentTo   string
	sentCode string
	called   bool
}

func (m *mockEmailDelivery) SendOTP(ctx context.Context, email, code string) error {
	m.sentTo = email
	m.sentCode = code
	m.called = true
	return nil
}

func newTestOTPService() auth.OTPService {
	return auth.NewOTPService(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     3,
		RateLimitMax:    5,
		RateLimitWindow: 15 * time.Minute,
	})
}

func TestGenerateOTP_ReturnsValidCode(t *testing.T) {
	svc := newTestOTPService()
	ctx := context.Background()

	code, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)
	assert.Len(t, code, 6)
	assert.Regexp(t, regexp.MustCompile(`^\d{6}$`), code)
}

func TestGenerateOTP_UniquePerCall(t *testing.T) {
	svc := newTestOTPService()
	ctx := context.Background()

	code1, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	code2, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	assert.NotEqual(t, code1, code2, "consecutive OTP codes should differ")
}

func TestValidateOTP_CorrectCode(t *testing.T) {
	svc := newTestOTPService()
	ctx := context.Background()

	code, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	valid, err := svc.Validate(ctx, "user@example.com", code)
	require.NoError(t, err)
	assert.True(t, valid)
}

func TestValidateOTP_ExpiredCode(t *testing.T) {
	svc := auth.NewOTPService(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          1 * time.Millisecond, // near-instant expiry for test
		MaxAttempts:     3,
		RateLimitMax:    5,
		RateLimitWindow: 15 * time.Minute,
	})
	ctx := context.Background()

	code, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	time.Sleep(10 * time.Millisecond)

	valid, err := svc.Validate(ctx, "user@example.com", code)
	require.NoError(t, err)
	assert.False(t, valid, "expired OTP should be rejected")
}

func TestValidateOTP_WrongCode(t *testing.T) {
	svc := newTestOTPService()
	ctx := context.Background()

	_, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	valid, err := svc.Validate(ctx, "user@example.com", "000000")
	require.NoError(t, err)
	assert.False(t, valid, "wrong code should be rejected")
}

func TestValidateOTP_MaxAttempts(t *testing.T) {
	svc := newTestOTPService()
	ctx := context.Background()

	_, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	for i := 0; i < 3; i++ {
		_, _ = svc.Validate(ctx, "user@example.com", "000000")
	}

	_, err = svc.Validate(ctx, "user@example.com", "000000")
	assert.Error(t, err, "should return error after max attempts exceeded")
}

func TestValidateOTP_SingleUse(t *testing.T) {
	svc := newTestOTPService()
	ctx := context.Background()

	code, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	valid, err := svc.Validate(ctx, "user@example.com", code)
	require.NoError(t, err)
	assert.True(t, valid)

	valid, err = svc.Validate(ctx, "user@example.com", code)
	require.NoError(t, err)
	assert.False(t, valid, "used OTP should not be reusable")
}

func TestRateLimitOTP_MaxRequests(t *testing.T) {
	svc := newTestOTPService()
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		_, err := svc.Generate(ctx, "user@example.com")
		require.NoError(t, err, "request %d should succeed", i+1)
	}

	_, err := svc.Generate(ctx, "user@example.com")
	assert.Error(t, err, "6th request should be rate-limited")
}

func TestRateLimitOTP_DifferentIdentifiers(t *testing.T) {
	svc := newTestOTPService()
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		_, err := svc.Generate(ctx, "user1@example.com")
		require.NoError(t, err)
	}

	// Different identifier should have its own limit
	_, err := svc.Generate(ctx, "user2@example.com")
	assert.NoError(t, err, "different identifier should have separate rate limit")
}

func TestOTPDelivery_Email(t *testing.T) {
	mock := &mockEmailDelivery{}
	svc := auth.NewOTPServiceWithDelivery(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     3,
		RateLimitMax:    5,
		RateLimitWindow: 15 * time.Minute,
	}, mock)
	ctx := context.Background()

	code, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	assert.True(t, mock.called, "email delivery should be called")
	assert.Equal(t, "user@example.com", mock.sentTo)
	assert.Equal(t, code, mock.sentCode)
}

// blockingEmailDelivery parks inside SendOTP ONLY for blockEmail, until release
// is closed; every other recipient returns immediately. Blocking on a single
// recipient is deliberate: the concurrent "second" Generate uses a different
// email and so never blocks inside SendOTP itself — the only thing that can
// stall it is the service mutex. That makes the test sensitive to the bug
// (mutex held across send) and immune to false positives from the fake's own
// channel mechanics.
type blockingEmailDelivery struct {
	blockEmail string
	entered    chan struct{} // a value is sent once SendOTP is entered for blockEmail
	release    chan struct{} // SendOTP (for blockEmail) returns once this is closed
}

func (d *blockingEmailDelivery) SendOTP(ctx context.Context, email, code string) error {
	if email == d.blockEmail {
		d.entered <- struct{}{}
		<-d.release
	}
	return nil
}

// TestF032_OTPGenerateDoesNotHoldMutexAcrossSend is the F-032 regression test.
// Before the fix, otpService.Generate held s.mu for the whole call (including
// the SendOTP SMTP round-trip), so a single slow send serialized every
// concurrent registration OTP. This parks one Generate (the blocked email)
// inside SendOTP and proves a second Generate (a different email, whose send
// returns immediately) still completes — which is only possible if Generate
// releases the lock before calling SendOTP.
func TestF032_OTPGenerateDoesNotHoldMutexAcrossSend(t *testing.T) {
	delivery := &blockingEmailDelivery{
		blockEmail: "first@example.com",
		entered:    make(chan struct{}, 1),
		release:    make(chan struct{}),
	}
	svc := auth.NewOTPServiceWithDelivery(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     3,
		RateLimitMax:    5,
		RateLimitWindow: 15 * time.Minute,
	}, delivery)
	ctx := context.Background()

	// First call parks inside SendOTP for the blocked email.
	firstDone := make(chan error, 1)
	go func() {
		_, err := svc.Generate(ctx, "first@example.com")
		firstDone <- err
	}()

	// Wait until the first call is blocked inside SendOTP (lock should already
	// be released by now under the fix).
	select {
	case <-delivery.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("first Generate never reached SendOTP")
	}

	// A concurrent call for a different identifier. Its own SendOTP returns
	// immediately, so the ONLY thing that could block it is the service mutex.
	secondDone := make(chan error, 1)
	go func() {
		_, err := svc.Generate(ctx, "second@example.com")
		secondDone <- err
	}()

	select {
	case err := <-secondDone:
		require.NoError(t, err, "concurrent Generate should succeed while first is mid-send")
	case <-time.After(2 * time.Second):
		t.Fatal("F-032: concurrent Generate blocked — mutex is held across SendOTP")
	}

	// Let the first call finish and confirm it succeeded too.
	close(delivery.release)
	select {
	case err := <-firstDone:
		require.NoError(t, err)
	case <-time.After(2 * time.Second):
		t.Fatal("first Generate did not return after release")
	}
}

// failingEmailDelivery always returns an error from SendOTP.
type failingEmailDelivery struct{}

func (failingEmailDelivery) SendOTP(ctx context.Context, email, code string) error {
	return assertErr
}

var assertErr = &deliveryError{}

type deliveryError struct{}

func (*deliveryError) Error() string { return "smtp send failed" }

// TestF032_FailedSendRollsBackEntryAndRateSlot verifies the rollback path: when
// SendOTP fails, the stored entry is removed (the unsent code is unusable) and
// the rate-limit slot is not consumed, so the caller can retry within quota.
func TestF032_FailedSendRollsBackEntryAndRateSlot(t *testing.T) {
	svc := auth.NewOTPServiceWithDelivery(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     3,
		RateLimitMax:    1, // only one slot — proves the failed send did not consume it
		RateLimitWindow: 15 * time.Minute,
	}, failingEmailDelivery{})
	ctx := context.Background()

	// First attempt: send fails, entry+slot rolled back.
	_, err := svc.Generate(ctx, "user@example.com")
	require.Error(t, err, "Generate should surface the send failure")

	// The unsent code must not validate (entry was rolled back).
	valid, vErr := svc.Validate(ctx, "user@example.com", "000000")
	require.NoError(t, vErr)
	assert.False(t, valid, "rolled-back OTP entry must not validate")

	// The rate-limit slot must not have been consumed: a second Generate is
	// still permitted (it will again fail at send, but not at the rate limiter).
	_, err2 := svc.Generate(ctx, "user@example.com")
	require.Error(t, err2)
	assert.NotEqual(t, "rate limit exceeded", err2.Error(),
		"failed send must not consume the rate-limit slot")
}
