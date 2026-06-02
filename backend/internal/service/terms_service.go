package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// activeVersionTTL bounds how long a published terms version is cached in
// memory. Version changes are rare (an admin/migration action), so a short TTL
// keeps the active-version lookup off the hot upload path while still letting a
// newly published version propagate to all instances within the window.
const activeVersionTTL = 60 * time.Second

// termsStore is the narrow slice of repository.TermsRepo the service needs.
// Declaring it here lets unit tests inject an in-memory fake; the concrete
// *repository.TermsRepo satisfies it structurally.
type termsStore interface {
	GetActiveVersion(ctx context.Context) (*repository.TermsVersion, error)
	GetUserTermsPointer(ctx context.Context, userID uuid.UUID) (string, *time.Time, error)
	RecordAcceptance(ctx context.Context, a *repository.TermsAcceptance) error
}

// TermsStatus is the acceptance state for one user relative to the active version.
type TermsStatus struct {
	NeedsAcceptance bool       `json:"needs_acceptance"`
	AcceptedVersion string     `json:"accepted_version,omitempty"`
	AcceptedAt      *time.Time `json:"accepted_at,omitempty"`
	CurrentVersion  string     `json:"current_version"`
}

// TermsService manages photographer Terms-of-Service / copyright acceptance.
// It is the gate the upload path consults and the recorder of the immutable
// acceptance ledger (IT Act §10A clickwrap evidence / DPDP record-keeping).
type TermsService struct {
	store    termsStore
	auditLog *AuditLogService // optional — nil in tests / when auditing is off
	logger   *slog.Logger

	mu        sync.RWMutex
	cached    *repository.TermsVersion
	cachedAt  time.Time
	hashCache sync.Map // terms_text -> sha256 hex
}

// NewTermsService constructs a TermsService. auditLog may be nil.
func NewTermsService(store termsStore, auditLog *AuditLogService) *TermsService {
	return &TermsService{
		store:    store,
		auditLog: auditLog,
		logger:   slog.Default().With("component", "terms"),
	}
}

// hashText returns the SHA-256 (hex) of the exact text shown to the user. This
// is the audit-proof of which version's text was accepted, mirroring the
// consent-service pattern. Computed from terms_text so it can never drift from
// what the catalog stores.
func (s *TermsService) hashText(text string) string {
	if text == "" {
		return ""
	}
	if cached, ok := s.hashCache.Load(text); ok {
		return cached.(string)
	}
	sum := sha256.Sum256([]byte(text))
	h := hex.EncodeToString(sum[:])
	s.hashCache.Store(text, h)
	return h
}

// ActiveVersion returns the current active (non-revoked) terms version, cached
// for activeVersionTTL.
func (s *TermsService) ActiveVersion(ctx context.Context) (*repository.TermsVersion, error) {
	s.mu.RLock()
	if s.cached != nil && time.Since(s.cachedAt) < activeVersionTTL {
		v := s.cached
		s.mu.RUnlock()
		return v, nil
	}
	s.mu.RUnlock()

	v, err := s.store.GetActiveVersion(ctx)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.cached = v
	s.cachedAt = time.Now()
	s.mu.Unlock()
	return v, nil
}

// HasAcceptedActive reports whether the user has accepted the currently active
// version. The activeVersion return is always populated (when resolvable) so
// callers can surface it in a 403 payload. It reads the denormalized users
// pointer — an O(1) indexed lookup suitable for the upload hot path.
func (s *TermsService) HasAcceptedActive(ctx context.Context, userID uuid.UUID) (accepted bool, activeVersion string, err error) {
	active, err := s.ActiveVersion(ctx)
	if err != nil {
		return false, "", err
	}
	ptrVersion, _, err := s.store.GetUserTermsPointer(ctx, userID)
	if err != nil {
		// A missing user row should not masquerade as "accepted".
		if errors.Is(err, repository.ErrNotFound) {
			return false, active.Version, nil
		}
		return false, active.Version, err
	}
	return ptrVersion == active.Version, active.Version, nil
}

// StatusForUser returns the full acceptance status for a user, for /auth/me and
// the terms status endpoint. ErrNotFound on the user row is treated as
// "never accepted" rather than an error so a fresh token never breaks bootstrap.
func (s *TermsService) StatusForUser(ctx context.Context, userID uuid.UUID) (TermsStatus, error) {
	active, err := s.ActiveVersion(ctx)
	if err != nil {
		return TermsStatus{}, err
	}
	ptrVersion, acceptedAt, err := s.store.GetUserTermsPointer(ctx, userID)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return TermsStatus{CurrentVersion: active.Version}, err
	}
	return TermsStatus{
		NeedsAcceptance: ptrVersion != active.Version,
		AcceptedVersion: ptrVersion,
		AcceptedAt:      acceptedAt,
		CurrentVersion:  active.Version,
	}, nil
}

// TermsStatusForUser is a primitive-tuple variant of StatusForUser. It exists so
// the auth package can depend on a small locally-defined interface without
// importing this package (service imports auth, so the reverse would cycle).
func (s *TermsService) TermsStatusForUser(ctx context.Context, userID uuid.UUID) (needsAcceptance bool, acceptedVersion string, acceptedAt *time.Time, currentVersion string, err error) {
	st, err := s.StatusForUser(ctx, userID)
	return st.NeedsAcceptance, st.AcceptedVersion, st.AcceptedAt, st.CurrentVersion, err
}

// AcceptTerms records a user's acceptance of the active version. Idempotent: if
// the user has already accepted the active version it is a no-op success. The
// declared method conveys the surface ("registration", "first_upload",
// "oauth_signup", "admin_backfill"); when an upload-surface acceptance is in
// fact a re-acceptance of a newer version (the user previously accepted an older
// one) it is reclassified as "re_acceptance" so the ledger reads correctly.
// Returns the accepted version string.
func (s *TermsService) AcceptTerms(ctx context.Context, userID uuid.UUID, method, ip, ua string) (string, error) {
	active, err := s.ActiveVersion(ctx)
	if err != nil {
		return "", err
	}

	priorVersion, _, ptrErr := s.store.GetUserTermsPointer(ctx, userID)
	if ptrErr != nil && !errors.Is(ptrErr, repository.ErrNotFound) {
		return "", ptrErr
	}
	if priorVersion == active.Version {
		// Already accepted the active version — nothing to record.
		return active.Version, nil
	}
	if priorVersion != "" && method == "first_upload" {
		method = "re_acceptance"
	}

	hash := s.hashText(active.TermsText)
	acceptance := &repository.TermsAcceptance{
		UserID:           userID,
		TermsVersion:     active.Version,
		VersionHash:      hash,
		AcceptedAt:       time.Now().UTC(),
		IPAddress:        ip,
		UserAgent:        ua,
		AcceptanceMethod: method,
		LegalBasis:       "contract",
		DocumentTypes:    active.DocumentTypes,
	}
	if err := s.store.RecordAcceptance(ctx, acceptance); err != nil {
		return "", err
	}

	s.emitAudit(userID, active.Version, hash, method, ip, ua)
	return active.Version, nil
}

// emitAudit writes an immutable audit_logs entry mirroring the acceptance. The
// ledger is the legal source of truth; this gives the security/admin audit
// surface a uniform record alongside every other privileged action.
func (s *TermsService) emitAudit(userID uuid.UUID, version, hash, method, ip, ua string) {
	if s.auditLog == nil {
		if s.logger != nil {
			s.logger.Debug("terms.audit_skipped_no_sink",
				slog.String("user_id", userID.String()),
				slog.String("terms_version", version),
				slog.String("method", method),
			)
		}
		return
	}
	meta, _ := json.Marshal(map[string]any{
		"terms_version": version,
		"version_hash":  hash,
		"method":        method,
		"document_type": "terms_of_service+privacy_policy",
	})
	entry := repository.AuditLogCreate{
		ActorID:      userID,
		ActorType:    "user",
		Action:       "user.terms.accepted",
		ResourceType: "user",
		ResourceID:   userID.String(),
		Metadata:     meta,
		Severity:     "info",
	}
	if ip != "" {
		entry.IPAddress = &ip
	}
	if ua != "" {
		entry.UserAgent = &ua
	}
	s.auditLog.RecordAction(context.Background(), entry)
}
