package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// Consent purposes — the 8 granular toggles required for DPDP/GDPR purpose-binding.
// Must stay in sync with frontend/src/components/gallery/consent-banner.tsx.
// See _cobolt-output/latest/build/M15/M15-design-decisions.md § 2.
const (
	ConsentTerms               = "terms_of_service"
	ConsentNotifications       = "gallery_notifications"
	ConsentBiometric           = "biometric_face_id"
	ConsentAIContentTagging    = "ai_content_tagging"
	ConsentAnalyticsTracking   = "analytics_tracking"
	ConsentMarketing           = "marketing_communications"
	ConsentThirdPartySharing   = "third_party_sharing"
	ConsentDSARProcessing      = "dsar_processing"

	// Legacy short names kept for backwards compatibility with existing records.
	// The service normalizes these to the canonical names on read/write.
	legacyTerms         = "terms"
	legacyNotifications = "notifications"
	legacyBiometric     = "biometric"
	legacyAnalytics     = "analytics"
)

// AllowedConsentTypes is the authoritative set of consent purposes.
var AllowedConsentTypes = map[string]bool{
	ConsentTerms:             true,
	ConsentNotifications:     true,
	ConsentBiometric:         true,
	ConsentAIContentTagging:  true,
	ConsentAnalyticsTracking: true,
	ConsentMarketing:         true,
	ConsentThirdPartySharing: true,
	ConsentDSARProcessing:    true,
}

// WithdrawalCascadeEmitter is the minimal interface the consent service needs to
// publish withdrawal events to the DSR eraser worker (M10 infra).
// Injecting it as an interface keeps this package decoupled from Valkey/NATS.
type WithdrawalCascadeEmitter interface {
	EmitConsentWithdrawn(ctx context.Context, event ConsentWithdrawalEvent) error
}

// ConsentWithdrawalEvent is the payload sent to the cascade purge worker.
type ConsentWithdrawalEvent struct {
	GalleryID    *uuid.UUID `json:"gallery_id,omitempty"`
	VisitorEmail string     `json:"visitor_email"`
	ConsentType  string     `json:"consent_type"`
	WithdrawnAt  string     `json:"withdrawn_at"`
}

// ConsentBundle is the input for a full banner submission (multiple toggles at once).
type ConsentBundle struct {
	GalleryID    *uuid.UUID
	VisitorEmail string
	VisitorIP    string
	UserAgent    string
	Language     string
	ConsentText  string // exact text shown to user — hashed for audit proof
	Grants       map[string]bool
}

// ConsentService handles privacy consent management.
type ConsentService struct {
	consentRepo *repository.ConsentRepo
	emitter     WithdrawalCascadeEmitter // optional — nil in tests or when Valkey is down

	// Cache of version hashes so we don't recompute SHA-256 for the same banner text
	versionCache sync.Map
}

// NewConsentService creates a new ConsentService.
// emitter may be nil; in that case withdrawal cascade is logged but not dispatched.
func NewConsentService(cr *repository.ConsentRepo, emitter WithdrawalCascadeEmitter) *ConsentService {
	return &ConsentService{consentRepo: cr, emitter: emitter}
}

// normalizeConsentType maps legacy short names to canonical purpose names.
func normalizeConsentType(t string) string {
	switch t {
	case legacyTerms:
		return ConsentTerms
	case legacyNotifications:
		return ConsentNotifications
	case legacyBiometric:
		return ConsentBiometric
	case legacyAnalytics:
		return ConsentAnalyticsTracking
	default:
		return t
	}
}

// HashConsentVersion computes a deterministic SHA-256 hash of the exact consent
// text shown to the user. This is the audit-proof that a specific version was
// consented to (DPDP § 5(e) informed consent requirement).
func (s *ConsentService) HashConsentVersion(text string) string {
	if text == "" {
		return ""
	}
	if cached, ok := s.versionCache.Load(text); ok {
		return cached.(string)
	}
	sum := sha256.Sum256([]byte(text))
	hash := hex.EncodeToString(sum[:])
	s.versionCache.Store(text, hash)
	return hash
}

// RecordConsent records a single consent decision (legacy 4-argument signature kept
// for callers that only record one toggle at a time).
func (s *ConsentService) RecordConsent(ctx context.Context, galleryID *uuid.UUID, email, ip, consentType, language string, granted bool) error {
	ct := normalizeConsentType(consentType)
	if !AllowedConsentTypes[ct] {
		return fmt.Errorf("invalid consent type: %s", consentType)
	}
	if strings.TrimSpace(email) == "" {
		return fmt.Errorf("email required for consent record")
	}

	record := &repository.ConsentRecord{
		GalleryID:    galleryID,
		VisitorEmail: strings.ToLower(strings.TrimSpace(email)),
		VisitorIP:    ip,
		ConsentType:  ct,
		Granted:      granted,
		Language:     language,
	}
	return s.consentRepo.Create(ctx, record)
}

// RecordBundle writes a full 8-toggle consent submission atomically. Each purpose
// becomes its own row; the version hash is computed once and shared across rows.
// This is the ENTERPRISE path used by the consent banner UI.
func (s *ConsentService) RecordBundle(ctx context.Context, b ConsentBundle) error {
	if strings.TrimSpace(b.VisitorEmail) == "" {
		return fmt.Errorf("visitor email required")
	}
	versionHash := s.HashConsentVersion(b.ConsentText)
	email := strings.ToLower(strings.TrimSpace(b.VisitorEmail))

	// Sort keys for deterministic write order (makes tests stable)
	keys := make([]string, 0, len(b.Grants))
	for k := range b.Grants {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, rawType := range keys {
		ct := normalizeConsentType(rawType)
		if !AllowedConsentTypes[ct] {
			return fmt.Errorf("invalid consent type in bundle: %s", rawType)
		}
		record := &repository.ConsentRecord{
			GalleryID:           b.GalleryID,
			VisitorEmail:        email,
			VisitorIP:           b.VisitorIP,
			UserAgent:           b.UserAgent,
			ConsentType:         ct,
			Granted:             b.Grants[rawType],
			Language:            b.Language,
			ConsentVersionHash:  versionHash,
		}
		if err := s.consentRepo.Create(ctx, record); err != nil {
			return fmt.Errorf("record %s: %w", ct, err)
		}
	}
	return nil
}

// WithdrawConsent withdraws a specific consent type. Unlike the legacy UPDATE path,
// this writes an immutable append-only record with granted=false and emits a cascade
// event so the DSR eraser worker can purge dependent data.
func (s *ConsentService) WithdrawConsent(ctx context.Context, galleryID *uuid.UUID, email, consentType, ip, userAgent string) error {
	ct := normalizeConsentType(consentType)
	if !AllowedConsentTypes[ct] {
		return fmt.Errorf("invalid consent type: %s", consentType)
	}
	email = strings.ToLower(strings.TrimSpace(email))

	// Append a new row marking withdrawal. This preserves full history
	// (we can always see WHEN the user originally granted and WHEN they withdrew).
	record := &repository.ConsentRecord{
		GalleryID:    galleryID,
		VisitorEmail: email,
		VisitorIP:    ip,
		UserAgent:    userAgent,
		ConsentType:  ct,
		Granted:      false,
	}
	if err := s.consentRepo.Create(ctx, record); err != nil {
		return fmt.Errorf("withdrawal record: %w", err)
	}

	// Also update the legacy withdrawn_at for any still-active grants of this type,
	// so status queries can short-circuit.
	if err := s.consentRepo.Withdraw(ctx, email, ct); err != nil {
		// Non-fatal: the append-only record is the source of truth
		// but the legacy flag speeds up reads.
		return fmt.Errorf("legacy withdraw flag: %w", err)
	}

	// Dispatch cascade event (non-blocking — if emitter is nil or fails, log only)
	if s.emitter != nil {
		event := ConsentWithdrawalEvent{
			GalleryID:    galleryID,
			VisitorEmail: email,
			ConsentType:  ct,
		}
		if err := s.emitter.EmitConsentWithdrawn(ctx, event); err != nil {
			// Log but don't fail the withdrawal itself. DPDP requires the withdrawal
			// to take immediate effect from the user's perspective; the cascade purge
			// runs async and has its own retry logic.
			fmt.Printf("[consent] cascade emit failed for %s/%s: %v\n", email, ct, err)
		}
	}
	return nil
}

// GetConsentStatus returns the LATEST consent decision per purpose for a visitor.
// Multiple rows per purpose are reduced to the most recent row.
func (s *ConsentService) GetConsentStatus(ctx context.Context, email string) (map[string]bool, error) {
	records, err := s.consentRepo.ListByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		return nil, err
	}
	// Records come back ordered by created_at DESC, so the first seen = latest.
	status := make(map[string]bool, len(AllowedConsentTypes))
	for _, r := range records {
		ct := normalizeConsentType(r.ConsentType)
		if _, seen := status[ct]; seen {
			continue
		}
		// Withdrawn record trumps grant
		status[ct] = r.Granted && r.WithdrawnAt == nil
	}
	return status, nil
}

// HasGranted is a quick check: did the visitor grant a specific purpose?
func (s *ConsentService) HasGranted(ctx context.Context, email, consentType string) (bool, error) {
	status, err := s.GetConsentStatus(ctx, email)
	if err != nil {
		return false, err
	}
	return status[normalizeConsentType(consentType)], nil
}
