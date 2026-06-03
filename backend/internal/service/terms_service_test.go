package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// fakeTermsStore is an in-memory termsStore for unit tests — no Postgres pool.
type fakeTermsStore struct {
	active      *repository.TermsVersion
	activeErr   error
	pointers    map[uuid.UUID]string // user -> accepted version
	pointerTime map[uuid.UUID]*time.Time
	recorded    []*repository.TermsAcceptance
	recordErr   error
}

func newFakeStore(active *repository.TermsVersion) *fakeTermsStore {
	return &fakeTermsStore{
		active:      active,
		pointers:    map[uuid.UUID]string{},
		pointerTime: map[uuid.UUID]*time.Time{},
	}
}

func (f *fakeTermsStore) GetActiveVersion(ctx context.Context) (*repository.TermsVersion, error) {
	if f.activeErr != nil {
		return nil, f.activeErr
	}
	return f.active, nil
}

func (f *fakeTermsStore) GetUserTermsPointer(ctx context.Context, userID uuid.UUID) (string, *time.Time, error) {
	v, ok := f.pointers[userID]
	if !ok {
		return "", nil, nil // user exists, never accepted
	}
	return v, f.pointerTime[userID], nil
}

func (f *fakeTermsStore) RecordAcceptance(ctx context.Context, a *repository.TermsAcceptance) error {
	if f.recordErr != nil {
		return f.recordErr
	}
	f.recorded = append(f.recorded, a)
	// Simulate the transactional pointer update so idempotency holds on re-call.
	f.pointers[a.UserID] = a.TermsVersion
	t := a.AcceptedAt
	f.pointerTime[a.UserID] = &t
	return nil
}

func sampleVersion() *repository.TermsVersion {
	text := "RawDrive Terms v1 — you warrant you own all uploaded content."
	sum := sha256.Sum256([]byte(text))
	return &repository.TermsVersion{
		Version:       "tos-privacy/2026-04",
		DocumentTypes: []string{"terms_of_service", "privacy_policy"},
		TermsText:     text,
		TextSHA256:    hex.EncodeToString(sum[:]),
		EffectiveAt:   time.Now(),
		PublishedAt:   time.Now(),
	}
}

func TestTermsService_AcceptTerms_FirstTime(t *testing.T) {
	store := newFakeStore(sampleVersion())
	svc := NewTermsService(store, nil)
	uid := uuid.New()

	version, err := svc.AcceptTerms(context.Background(), uid, "registration", "1.2.3.4", "UA/1")
	if err != nil {
		t.Fatalf("AcceptTerms: %v", err)
	}
	if version != "tos-privacy/2026-04" {
		t.Fatalf("version = %q", version)
	}
	if len(store.recorded) != 1 {
		t.Fatalf("expected 1 acceptance recorded, got %d", len(store.recorded))
	}
	rec := store.recorded[0]
	if rec.AcceptanceMethod != "registration" {
		t.Errorf("method = %q, want registration", rec.AcceptanceMethod)
	}
	if rec.IPAddress != "1.2.3.4" || rec.UserAgent != "UA/1" {
		t.Errorf("ip/ua not captured: %q / %q", rec.IPAddress, rec.UserAgent)
	}
	// version_hash must be the SHA-256 of the exact text shown (audit proof).
	if rec.VersionHash != store.active.TextSHA256 {
		t.Errorf("version_hash = %q, want %q", rec.VersionHash, store.active.TextSHA256)
	}
	if rec.LegalBasis != "contract" {
		t.Errorf("legal_basis = %q, want contract", rec.LegalBasis)
	}
}

func TestTermsService_AcceptTerms_Idempotent(t *testing.T) {
	store := newFakeStore(sampleVersion())
	svc := NewTermsService(store, nil)
	uid := uuid.New()

	if _, err := svc.AcceptTerms(context.Background(), uid, "registration", "", ""); err != nil {
		t.Fatalf("first accept: %v", err)
	}
	// Second accept of the same active version must be a no-op (no new row).
	if _, err := svc.AcceptTerms(context.Background(), uid, "first_upload", "", ""); err != nil {
		t.Fatalf("second accept: %v", err)
	}
	if len(store.recorded) != 1 {
		t.Fatalf("idempotent accept wrote %d rows, want 1", len(store.recorded))
	}
}

func TestTermsService_AcceptTerms_ReacceptanceOnVersionBump(t *testing.T) {
	store := newFakeStore(sampleVersion())
	svc := NewTermsService(store, nil)
	uid := uuid.New()
	// User previously accepted an older version.
	store.pointers[uid] = "tos-privacy/2025-01"

	if _, err := svc.AcceptTerms(context.Background(), uid, "first_upload", "", ""); err != nil {
		t.Fatalf("AcceptTerms: %v", err)
	}
	if len(store.recorded) != 1 {
		t.Fatalf("expected 1 row, got %d", len(store.recorded))
	}
	if store.recorded[0].AcceptanceMethod != "re_acceptance" {
		t.Errorf("method = %q, want re_acceptance (upload-surface re-accept of a newer version)",
			store.recorded[0].AcceptanceMethod)
	}
}

func TestTermsService_HasAcceptedActive(t *testing.T) {
	store := newFakeStore(sampleVersion())
	svc := NewTermsService(store, nil)
	uid := uuid.New()

	accepted, active, err := svc.HasAcceptedActive(context.Background(), uid)
	if err != nil {
		t.Fatalf("HasAcceptedActive: %v", err)
	}
	if accepted {
		t.Error("fresh user must not be considered accepted")
	}
	if active != "tos-privacy/2026-04" {
		t.Errorf("active = %q", active)
	}

	store.pointers[uid] = "tos-privacy/2026-04"
	accepted, _, err = svc.HasAcceptedActive(context.Background(), uid)
	if err != nil {
		t.Fatalf("HasAcceptedActive(2): %v", err)
	}
	if !accepted {
		t.Error("user who accepted active version must pass the gate")
	}

	// A user who only accepted an older version is NOT accepted (re-prompt).
	store.pointers[uid] = "tos-privacy/2025-01"
	accepted, _, _ = svc.HasAcceptedActive(context.Background(), uid)
	if accepted {
		t.Error("stale-version acceptance must NOT pass the active gate")
	}
}

func TestTermsService_StatusForUser(t *testing.T) {
	store := newFakeStore(sampleVersion())
	svc := NewTermsService(store, nil)
	uid := uuid.New()

	st, err := svc.StatusForUser(context.Background(), uid)
	if err != nil {
		t.Fatalf("StatusForUser: %v", err)
	}
	if !st.NeedsAcceptance {
		t.Error("fresh user needs acceptance")
	}
	if st.CurrentVersion != "tos-privacy/2026-04" {
		t.Errorf("current = %q", st.CurrentVersion)
	}

	store.pointers[uid] = "tos-privacy/2026-04"
	st, _ = svc.StatusForUser(context.Background(), uid)
	if st.NeedsAcceptance {
		t.Error("accepted user does not need acceptance")
	}
	if st.AcceptedVersion != "tos-privacy/2026-04" {
		t.Errorf("accepted = %q", st.AcceptedVersion)
	}
}
