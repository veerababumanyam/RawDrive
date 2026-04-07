package auth_test

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
		CodeLength:    6,
		Expiry:        5 * time.Minute,
		MaxAttempts:   3,
		RateLimitMax:  5,
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
		CodeLength:    6,
		Expiry:        1 * time.Millisecond, // near-instant expiry for test
		MaxAttempts:   3,
		RateLimitMax:  5,
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
		CodeLength:    6,
		Expiry:        5 * time.Minute,
		MaxAttempts:   3,
		RateLimitMax:  5,
		RateLimitWindow: 15 * time.Minute,
	}, mock)
	ctx := context.Background()

	code, err := svc.Generate(ctx, "user@example.com")
	require.NoError(t, err)

	assert.True(t, mock.called, "email delivery should be called")
	assert.Equal(t, "user@example.com", mock.sentTo)
	assert.Equal(t, code, mock.sentCode)
}
