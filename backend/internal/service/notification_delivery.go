package service

// NotificationDeliveryService fans out a single NotificationIntent across
// the channels enabled in a user's preferences (in-app, email, SMS, push,
// whatsapp) using pluggable Provider implementations. It honors quiet hours,
// retries transient failures with exponential backoff, and persists an
// in-app record so the user can see the notification in the UI later.
//
// Design notes:
//
//   - The service depends on a narrow NotificationPersister interface rather
//     than the concrete *repository.NotificationRepo. This lets tests inject
//     a fake store without spinning up Postgres, and lets the service compose
//     freely (e.g. a write-behind cache).
//
//   - Providers implement the Provider interface. The service iterates its
//     registered providers and dispatches to those whose Channel() matches
//     an enabled channel for the user's category preference. Missing
//     providers are skipped silently — the system degrades gracefully when,
//     for example, the SMS provider isn't configured.
//
//   - The "security" category always bypasses quiet hours and digest mode.
//     A login from a new location must not sit in a digest.
//
//   - In-app delivery is always attempted regardless of quiet hours — the
//     record exists, the user just won't be pinged during quiet window.

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// NotificationPersister is the narrow slice of repository.NotificationRepo
// this service depends on. Both the real repo and test fakes satisfy it.
type NotificationPersister interface {
	Create(ctx context.Context, n *repository.Notification) error
	GetPreferences(ctx context.Context, userID uuid.UUID) ([]repository.NotificationPreference, error)
}

// NotificationIntent describes a notification the caller wants delivered.
// Category must be one of: bookings, payments, gallery_updates, team_activity,
// marketing, security. Any other value is rejected.
type NotificationIntent struct {
	UserID      uuid.UUID
	WorkspaceID *uuid.UUID
	Category    string
	Title       string
	Body        string
	ActionURL   string
	// EmailTo and PhoneE164 are resolved by the caller when available; if
	// empty, the email/SMS providers log a warning and skip delivery.
	EmailTo   string
	PhoneE164 string
	// Metadata is an optional key/value bag for provider templates.
	Metadata map[string]any
}

// DeliveryRequest is what a Provider.Send receives. It is a lightweight
// projection of NotificationIntent plus resolved fields.
type DeliveryRequest struct {
	UserID    uuid.UUID
	Category  string
	Title     string
	Body      string
	ActionURL string
	EmailTo   string
	PhoneE164 string
	Metadata  map[string]any
}

// DeliveryResult reports which channels were attempted and which succeeded.
type DeliveryResult struct {
	InAppDelivered bool
	Channels       map[string]bool
	Errors         map[string]error
}

// ChannelDelivered returns true if the named channel succeeded.
func (r *DeliveryResult) ChannelDelivered(ch string) bool {
	if r == nil || r.Channels == nil {
		return false
	}
	return r.Channels[ch]
}

// Provider sends a single notification on one channel. Implementations MUST
// be safe for concurrent use.
type Provider interface {
	Channel() string
	Send(ctx context.Context, req DeliveryRequest) error
}

// RetryConfig tunes the exponential-backoff retry loop for provider calls.
type RetryConfig struct {
	MaxAttempts    int
	InitialBackoff time.Duration
}

// DefaultRetryConfig returns sane defaults (3 attempts, 200ms → 400ms → 800ms).
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{MaxAttempts: 3, InitialBackoff: 200 * time.Millisecond}
}

// NotificationDeliveryService orchestrates notification delivery.
type NotificationDeliveryService struct {
	store     NotificationPersister
	providers map[string]Provider
	retry     RetryConfig
	now       func() time.Time
	mu        sync.RWMutex
}

// NewNotificationDeliveryService constructs the service. Providers are
// registered separately via WithProvider so tests can compose freely.
func NewNotificationDeliveryService(store NotificationPersister) *NotificationDeliveryService {
	return &NotificationDeliveryService{
		store:     store,
		providers: make(map[string]Provider),
		retry:     DefaultRetryConfig(),
		now:       time.Now,
	}
}

// WithProvider registers a provider for one channel. Returns the service for
// fluent chaining.
func (s *NotificationDeliveryService) WithProvider(p Provider) *NotificationDeliveryService {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.providers[p.Channel()] = p
	return s
}

// WithRetryConfig overrides retry settings.
func (s *NotificationDeliveryService) WithRetryConfig(rc RetryConfig) *NotificationDeliveryService {
	s.mu.Lock()
	defer s.mu.Unlock()
	if rc.MaxAttempts < 1 {
		rc.MaxAttempts = 1
	}
	if rc.InitialBackoff <= 0 {
		rc.InitialBackoff = time.Millisecond
	}
	s.retry = rc
	return s
}

// WithClock overrides the time source (used by quiet-hours logic). Tests use
// this to make quiet-hours behavior deterministic.
func (s *NotificationDeliveryService) WithClock(now func() time.Time) *NotificationDeliveryService {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.now = now
	return s
}

// Deliver dispatches the intent to all enabled channels. It persists an
// in-app notification record unless in-app is explicitly disabled by the
// user's preferences. Per-channel failures are captured in the result but
// do NOT fail the overall call — the caller gets a full report and can
// decide how to react.
func (s *NotificationDeliveryService) Deliver(ctx context.Context, intent NotificationIntent) (*DeliveryResult, error) {
	if intent.UserID == uuid.Nil {
		return nil, errors.New("notification: user_id required")
	}
	if intent.Title == "" {
		return nil, errors.New("notification: title required")
	}
	if !validCategory(intent.Category) {
		return nil, errors.New("notification: invalid category: " + intent.Category)
	}

	pref := s.resolvePreference(ctx, intent.UserID, intent.Category)

	result := &DeliveryResult{
		Channels: make(map[string]bool),
		Errors:   make(map[string]error),
	}

	// Security category is critical: bypass quiet hours and digest.
	criticalCategory := intent.Category == "security"
	inQuiet := !criticalCategory && s.isInQuietHours(pref)

	// 1) In-app: always persist (record must exist even during quiet hours).
	if pref.InAppEnabled {
		rec := &repository.Notification{
			UserID:           intent.UserID,
			WorkspaceID:      intent.WorkspaceID,
			NotificationType: intent.Category,
			Title:            intent.Title,
			Body:             ptrOrNil(intent.Body),
			ActionURL:        ptrOrNil(intent.ActionURL),
			Channel:          "in_app",
		}
		if err := s.store.Create(ctx, rec); err != nil {
			result.Errors["in_app"] = err
			log.Printf("notification: in-app persist failed user=%s category=%s err=%v",
				intent.UserID, intent.Category, err)
		} else {
			result.InAppDelivered = true
			result.Channels["in_app"] = true
		}
	}

	// 2) External channels are suppressed during quiet hours (except security).
	if inQuiet {
		return result, nil
	}

	req := DeliveryRequest{
		UserID:    intent.UserID,
		Category:  intent.Category,
		Title:     intent.Title,
		Body:      intent.Body,
		ActionURL: intent.ActionURL,
		EmailTo:   intent.EmailTo,
		PhoneE164: intent.PhoneE164,
		Metadata:  intent.Metadata,
	}

	s.dispatchIf(ctx, "email", pref.EmailEnabled, req, result)
	s.dispatchIf(ctx, "push", pref.PushEnabled, req, result)
	s.dispatchIf(ctx, "whatsapp", pref.WhatsappEnabled, req, result)
	// SMS is provided but not tied to a per-category toggle — opt-in via
	// workspace settings, out of scope for this service.

	return result, nil
}

// dispatchIf invokes the provider for the channel if one is registered and
// the preference is enabled. Per-channel failures land in result.Errors.
func (s *NotificationDeliveryService) dispatchIf(ctx context.Context, channel string, enabled bool, req DeliveryRequest, result *DeliveryResult) {
	if !enabled {
		return
	}
	s.mu.RLock()
	p, ok := s.providers[channel]
	retry := s.retry
	s.mu.RUnlock()
	if !ok {
		// Provider not registered — degrade gracefully, do not error.
		return
	}
	if err := s.sendWithRetry(ctx, p, req, retry); err != nil {
		result.Errors[channel] = err
		log.Printf("notification: %s delivery failed user=%s category=%s err=%v",
			channel, req.UserID, req.Category, err)
		return
	}
	result.Channels[channel] = true
}

// sendWithRetry retries transient failures with exponential backoff.
func (s *NotificationDeliveryService) sendWithRetry(ctx context.Context, p Provider, req DeliveryRequest, rc RetryConfig) error {
	var lastErr error
	backoff := rc.InitialBackoff
	for attempt := 1; attempt <= rc.MaxAttempts; attempt++ {
		if err := p.Send(ctx, req); err != nil {
			lastErr = err
			if attempt == rc.MaxAttempts {
				break
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			backoff *= 2
			continue
		}
		return nil
	}
	return lastErr
}

// resolvePreference returns the user's preference for the category, or a
// default if none is stored.
func (s *NotificationDeliveryService) resolvePreference(ctx context.Context, userID uuid.UUID, category string) repository.NotificationPreference {
	prefs, err := s.store.GetPreferences(ctx, userID)
	if err != nil {
		log.Printf("notification: GetPreferences failed user=%s err=%v — using defaults", userID, err)
		return defaultPreference(category)
	}
	for _, p := range prefs {
		if p.Category == category {
			return p
		}
	}
	return defaultPreference(category)
}

// defaultPreference mirrors the "sane default" for a brand-new user: email +
// in-app + push enabled, whatsapp off, no quiet hours, no digest.
func defaultPreference(category string) repository.NotificationPreference {
	return repository.NotificationPreference{
		Category:        category,
		EmailEnabled:    true,
		PushEnabled:     true,
		InAppEnabled:    true,
		WhatsappEnabled: false,
		DigestMode:      "none",
	}
}

// isInQuietHours returns true when the user has quiet hours configured and
// the current time falls within the window. The window may wrap midnight
// (e.g. 22:00–07:00); we compare clock times, not calendar times.
func (s *NotificationDeliveryService) isInQuietHours(pref repository.NotificationPreference) bool {
	if pref.QuietHoursStart == nil || pref.QuietHoursEnd == nil {
		return false
	}
	startT, okS := parseClock(*pref.QuietHoursStart)
	endT, okE := parseClock(*pref.QuietHoursEnd)
	if !okS || !okE {
		return false
	}
	nowT := clockTimeOf(s.now())

	// Non-wrapping window: start <= now < end
	if startT <= endT {
		return nowT >= startT && nowT < endT
	}
	// Wrapping window: e.g. 22:00 → 07:00 next day
	return nowT >= startT || nowT < endT
}

// parseClock parses "HH:MM" or "HH:MM:SS" into a minute-of-day count.
// Returns (minutes, true) on success.
func parseClock(s string) (int, bool) {
	if len(s) < 5 {
		return 0, false
	}
	h := (int(s[0]-'0'))*10 + int(s[1]-'0')
	m := (int(s[3]-'0'))*10 + int(s[4]-'0')
	if h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

// clockTimeOf returns the minute-of-day count for a Time, in the local zone.
// Seconds are truncated (matches TIME column precision used elsewhere).
func clockTimeOf(t time.Time) int {
	return t.Hour()*60 + t.Minute()
}

// validCategory guards against typos that would silently drop notifications.
func validCategory(c string) bool {
	switch c {
	case "bookings", "payments", "gallery_updates", "team_activity", "marketing", "security":
		return true
	}
	return false
}

func ptrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ─── Log-only providers ────────────────────────────────────────────────
//
// Production deployments will register real providers for email (Resend,
// SES), SMS (Twilio, AWS SNS), push (FCM, APNs). Until those are wired in
// main.go via environment configuration, these log-only stubs let the
// notification service run safely in dev and CI — they record the call
// without actually sending anything.

// LogEmailProvider logs email sends. Wire a real provider (Resend, SES) in
// production via main.go.
type LogEmailProvider struct{}

func (LogEmailProvider) Channel() string { return "email" }
func (LogEmailProvider) Send(_ context.Context, req DeliveryRequest) error {
	if req.EmailTo == "" {
		log.Printf("email[stub]: no address for user=%s category=%s — skipping", req.UserID, req.Category)
		return nil
	}
	log.Printf("email[stub]: to=%s subject=%q category=%s", req.EmailTo, req.Title, req.Category)
	return nil
}

// LogSMSProvider logs SMS sends. Wire Twilio/SNS in production.
type LogSMSProvider struct{}

func (LogSMSProvider) Channel() string { return "sms" }
func (LogSMSProvider) Send(_ context.Context, req DeliveryRequest) error {
	if req.PhoneE164 == "" {
		return nil
	}
	log.Printf("sms[stub]: to=%s title=%q", req.PhoneE164, req.Title)
	return nil
}

// LogPushProvider logs push sends. Wire FCM/APNs in production.
type LogPushProvider struct{}

func (LogPushProvider) Channel() string { return "push" }
func (LogPushProvider) Send(_ context.Context, req DeliveryRequest) error {
	log.Printf("push[stub]: user=%s title=%q", req.UserID, req.Title)
	return nil
}

// LogWhatsAppProvider logs WhatsApp sends. Wire WhatsApp Business API in
// production.
type LogWhatsAppProvider struct{}

func (LogWhatsAppProvider) Channel() string { return "whatsapp" }
func (LogWhatsAppProvider) Send(_ context.Context, req DeliveryRequest) error {
	if req.PhoneE164 == "" {
		return nil
	}
	log.Printf("whatsapp[stub]: to=%s title=%q", req.PhoneE164, req.Title)
	return nil
}
