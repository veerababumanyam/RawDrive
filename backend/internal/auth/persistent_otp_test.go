package auth_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeOTPCodeStore struct {
	mu      sync.Mutex
	nextID  int
	records map[string]*auth.OTPCodeRecord
	created map[string]time.Time
}

func newFakeOTPCodeStore() *fakeOTPCodeStore {
	return &fakeOTPCodeStore{
		records: map[string]*auth.OTPCodeRecord{},
		created: map[string]time.Time{},
	}
}

func (s *fakeOTPCodeStore) CountRecent(_ context.Context, purpose, identifier string, since time.Time) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	for id, rec := range s.records {
		if rec.Purpose == purpose && rec.Identifier == identifier && !s.created[id].Before(since) {
			count++
		}
	}
	return count, nil
}

func (s *fakeOTPCodeStore) Create(_ context.Context, record auth.OTPCodeRecord) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	id := time.Now().Format("20060102150405") + "-" + string(rune('a'+s.nextID))
	record.ID = id
	copy := record
	s.records[id] = &copy
	s.created[id] = time.Now()
	return id, nil
}

func (s *fakeOTPCodeStore) LatestActive(_ context.Context, purpose, identifier string) (*auth.OTPCodeRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var latest *auth.OTPCodeRecord
	var latestAt time.Time
	now := time.Now()
	for id, rec := range s.records {
		if rec.Purpose != purpose || rec.Identifier != identifier || now.After(rec.ExpiresAt) {
			continue
		}
		if s.created[id].After(latestAt) {
			copy := *rec
			latest = &copy
			latestAt = s.created[id]
		}
	}
	return latest, nil
}

func (s *fakeOTPCodeStore) IncrementAttempts(_ context.Context, id string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.records[id].Attempts++
	return s.records[id].Attempts, nil
}

func (s *fakeOTPCodeStore) MarkUsed(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.records, id)
	return nil
}

func (s *fakeOTPCodeStore) Delete(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.records, id)
	return nil
}

func TestPersistentOTP_SurvivesServiceRestartAndIsSingleUse(t *testing.T) {
	store := newFakeOTPCodeStore()
	delivery := &mockEmailDelivery{}
	cfg := auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     3,
		RateLimitMax:    5,
		RateLimitWindow: 15 * time.Minute,
	}
	first := auth.NewPersistentOTPServiceWithDelivery(cfg, delivery, store, "registration")

	code, err := first.Generate(context.Background(), "REGISTERED@example.com")
	require.NoError(t, err)
	require.Equal(t, code, delivery.sentCode)

	second := auth.NewPersistentOTPServiceWithDelivery(cfg, delivery, store, "registration")
	ok, err := second.Validate(context.Background(), "registered@example.com", code)
	require.NoError(t, err)
	assert.True(t, ok)

	replay, err := second.Validate(context.Background(), "registered@example.com", code)
	require.NoError(t, err)
	assert.False(t, replay)
}

func TestPersistentOTP_FailedSendDeletesUnsentCode(t *testing.T) {
	store := newFakeOTPCodeStore()
	cfg := auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     3,
		RateLimitMax:    1,
		RateLimitWindow: 15 * time.Minute,
	}
	svc := auth.NewPersistentOTPServiceWithDelivery(cfg, failingEmailDelivery{}, store, "registration")

	_, err := svc.Generate(context.Background(), "registered@example.com")
	require.Error(t, err, "Generate should surface the SMTP failure")

	active, err := store.LatestActive(context.Background(), "registration", "registered@example.com")
	require.NoError(t, err)
	assert.Nil(t, active, "failed send must delete the unsent OTP row")

	_, err = svc.Generate(context.Background(), "registered@example.com")
	require.Error(t, err)
	assert.NotEqual(t, "rate limit exceeded", err.Error(), "failed sends must not consume the resend quota")
}

func TestPasswordResetPersistentOTP_SurvivesServiceRestart(t *testing.T) {
	store := newFakeOTPCodeStore()
	notifier := &mockNotifier{}
	passwordStore := newMockPasswordStore()
	cfg := auth.PasswordConfig{ResetOTPExpiry: 15 * 60, MaxFailedAttempts: 5, LockoutDuration: 15 * 60}
	first := auth.NewPasswordServiceWithOTPStore(cfg, passwordStore, notifier, store)

	require.NoError(t, first.RequestReset(context.Background(), "registered@example.com"))
	require.Len(t, notifier.passwordResets, 1)
	code := notifier.passwordResets[0][len("registered@example.com: "):]

	second := auth.NewPasswordServiceWithOTPStore(cfg, passwordStore, notifier, store)
	require.NoError(t, second.ResetPassword(context.Background(), "registered@example.com", code, "NewPassword1"))

	err := second.ResetPassword(context.Background(), "registered@example.com", code, "NewPassword1")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid or expired OTP")
}
