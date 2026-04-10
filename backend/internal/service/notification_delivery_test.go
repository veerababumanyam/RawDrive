package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// fakeNotificationStore implements NotificationPersister for tests.
type fakeNotificationStore struct {
	mu          sync.Mutex
	created     []repository.Notification
	prefs       map[uuid.UUID][]repository.NotificationPreference
	createError error
}

func (f *fakeNotificationStore) Create(ctx context.Context, n *repository.Notification) error {
	if f.createError != nil {
		return f.createError
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	n.ID = uuid.New()
	n.CreatedAt = time.Now().UTC()
	f.created = append(f.created, *n)
	return nil
}

func (f *fakeNotificationStore) GetPreferences(ctx context.Context, userID uuid.UUID) ([]repository.NotificationPreference, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.prefs[userID], nil
}

// fakeProvider captures calls and lets tests inject errors.
type fakeProvider struct {
	mu       sync.Mutex
	channel  string
	calls    []DeliveryRequest
	failOnce bool
}

func (p *fakeProvider) Channel() string { return p.channel }

func (p *fakeProvider) Send(ctx context.Context, req DeliveryRequest) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls = append(p.calls, req)
	if p.failOnce {
		p.failOnce = false
		return errors.New("transient")
	}
	return nil
}

func (p *fakeProvider) callCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.calls)
}

// Test helpers

func testUserID() uuid.UUID  { return uuid.MustParse("11111111-1111-1111-1111-111111111111") }
func otherUserID() uuid.UUID { return uuid.MustParse("22222222-2222-2222-2222-222222222222") }

func testPrefs(emailEnabled, inAppEnabled bool) []repository.NotificationPreference {
	return []repository.NotificationPreference{
		{
			Category:     "payments",
			EmailEnabled: emailEnabled,
			InAppEnabled: inAppEnabled,
			PushEnabled:  false,
			DigestMode:   "none",
		},
	}
}

// TestNotificationDelivery_FansOutToEnabledChannelsOnly verifies that a single
// intent dispatches only to channels enabled in the user's preferences.
func TestNotificationDelivery_FansOutToEnabledChannelsOnly(t *testing.T) {
	store := &fakeNotificationStore{
		prefs: map[uuid.UUID][]repository.NotificationPreference{
			testUserID(): testPrefs(true, true), // email + in_app, NOT push
		},
	}
	emailProvider := &fakeProvider{channel: "email"}
	pushProvider := &fakeProvider{channel: "push"}
	svc := NewNotificationDeliveryService(store).
		WithProvider(emailProvider).
		WithProvider(pushProvider)

	intent := NotificationIntent{
		UserID:   testUserID(),
		Category: "payments",
		Title:    "Payment received",
		Body:     "Rs. 50,000 from Veera",
	}
	result, err := svc.Deliver(context.Background(), intent)
	if err != nil {
		t.Fatalf("Deliver returned error: %v", err)
	}

	if !result.InAppDelivered {
		t.Error("expected in-app to be delivered (record persisted)")
	}
	if emailProvider.callCount() != 1 {
		t.Errorf("email provider expected 1 call, got %d", emailProvider.callCount())
	}
	if pushProvider.callCount() != 0 {
		t.Errorf("push provider expected 0 calls (disabled), got %d", pushProvider.callCount())
	}
	if len(store.created) != 1 {
		t.Errorf("expected 1 in-app record persisted, got %d", len(store.created))
	}
}

// TestNotificationDelivery_DefaultPreferencesWhenNoneSet verifies that when
// a user has no preference row, the service uses sensible defaults (all
// channels enabled except whatsapp).
func TestNotificationDelivery_DefaultPreferencesWhenNoneSet(t *testing.T) {
	store := &fakeNotificationStore{
		prefs: map[uuid.UUID][]repository.NotificationPreference{},
	}
	emailProvider := &fakeProvider{channel: "email"}
	svc := NewNotificationDeliveryService(store).WithProvider(emailProvider)

	intent := NotificationIntent{
		UserID:   otherUserID(),
		Category: "bookings",
		Title:    "New booking",
		Body:     "You have a new booking inquiry.",
	}
	_, err := svc.Deliver(context.Background(), intent)
	if err != nil {
		t.Fatalf("Deliver returned error: %v", err)
	}
	if emailProvider.callCount() != 1 {
		t.Errorf("defaults should enable email, got %d calls", emailProvider.callCount())
	}
	if len(store.created) != 1 {
		t.Errorf("defaults should enable in-app, got %d records", len(store.created))
	}
}

// TestNotificationDelivery_RetriesTransientFailure verifies a failing provider
// is retried at least once before being treated as failed.
func TestNotificationDelivery_RetriesTransientFailure(t *testing.T) {
	store := &fakeNotificationStore{
		prefs: map[uuid.UUID][]repository.NotificationPreference{
			testUserID(): testPrefs(true, false),
		},
	}
	flaky := &fakeProvider{channel: "email", failOnce: true}
	svc := NewNotificationDeliveryService(store).
		WithProvider(flaky).
		WithRetryConfig(RetryConfig{MaxAttempts: 3, InitialBackoff: time.Millisecond})

	intent := NotificationIntent{
		UserID:   testUserID(),
		Category: "payments",
		Title:    "Retry test",
	}
	result, err := svc.Deliver(context.Background(), intent)
	if err != nil {
		t.Fatalf("Deliver returned error: %v", err)
	}
	if !result.ChannelDelivered("email") {
		t.Error("email should have been delivered on retry")
	}
	if flaky.callCount() != 2 {
		t.Errorf("expected 2 provider calls (1 fail + 1 retry), got %d", flaky.callCount())
	}
}

// TestNotificationDelivery_QuietHoursSuppressesEmailButKeepsInApp verifies
// that during a user's quiet hours, push/email are suppressed while in-app
// still records the notification for later viewing.
func TestNotificationDelivery_QuietHoursSuppressesEmailButKeepsInApp(t *testing.T) {
	// Build a quiet-hours window that definitely contains "now" by using
	// a wide 23-hour window starting one hour before current time.
	now := time.Now()
	start := now.Add(-1 * time.Hour).Format("15:04:05")
	end := now.Add(22 * time.Hour).Format("15:04:05")

	store := &fakeNotificationStore{
		prefs: map[uuid.UUID][]repository.NotificationPreference{
			testUserID(): {{
				Category:        "marketing",
				EmailEnabled:    true,
				InAppEnabled:    true,
				PushEnabled:     true,
				DigestMode:      "none",
				QuietHoursStart: &start,
				QuietHoursEnd:   &end,
			}},
		},
	}
	emailProvider := &fakeProvider{channel: "email"}
	svc := NewNotificationDeliveryService(store).WithProvider(emailProvider).WithClock(func() time.Time { return now })

	intent := NotificationIntent{
		UserID:   testUserID(),
		Category: "marketing",
		Title:    "Flash sale",
	}
	_, err := svc.Deliver(context.Background(), intent)
	if err != nil {
		t.Fatalf("Deliver returned error: %v", err)
	}
	if emailProvider.callCount() != 0 {
		t.Errorf("quiet hours: expected email suppressed, got %d calls", emailProvider.callCount())
	}
	if len(store.created) != 1 {
		t.Errorf("quiet hours: in-app should still persist, got %d", len(store.created))
	}
}

// TestNotificationDelivery_SecurityCategoryBypassesQuietHours verifies the
// security category is critical and always delivered.
func TestNotificationDelivery_SecurityCategoryBypassesQuietHours(t *testing.T) {
	now := time.Now()
	start := now.Add(-1 * time.Hour).Format("15:04:05")
	end := now.Add(22 * time.Hour).Format("15:04:05")

	store := &fakeNotificationStore{
		prefs: map[uuid.UUID][]repository.NotificationPreference{
			testUserID(): {{
				Category:        "security",
				EmailEnabled:    true,
				InAppEnabled:    true,
				DigestMode:      "none",
				QuietHoursStart: &start,
				QuietHoursEnd:   &end,
			}},
		},
	}
	emailProvider := &fakeProvider{channel: "email"}
	svc := NewNotificationDeliveryService(store).WithProvider(emailProvider).WithClock(func() time.Time { return now })

	_, err := svc.Deliver(context.Background(), NotificationIntent{
		UserID:   testUserID(),
		Category: "security",
		Title:    "New login from Delhi",
	})
	if err != nil {
		t.Fatalf("Deliver returned error: %v", err)
	}
	if emailProvider.callCount() != 1 {
		t.Errorf("security category should bypass quiet hours, got %d email calls", emailProvider.callCount())
	}
}
