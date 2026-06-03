package service

import (
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

// TestReduceLatestPerPurpose verifies the core reduction shared by
// GetConsentStatus and GetConsentStatusForGallery (security audit V11): for each
// purpose the newest record wins, and a withdrawn record reads as not-granted
// regardless of its granted flag.
func TestReduceLatestPerPurpose(t *testing.T) {
	now := time.Now()
	withdrawn := now

	// Passed newest-first (created_at DESC), mirroring the repo query order.
	records := []repository.ConsentRecord{
		// terms: latest is a grant -> true (the older revoke must be ignored)
		{ConsentType: ConsentTerms, Granted: true, CreatedAt: now},
		{ConsentType: ConsentTerms, Granted: false, CreatedAt: now.Add(-time.Hour)},
		// notifications: latest grant but withdrawn -> false (withdrawn trumps grant)
		{ConsentType: ConsentNotifications, Granted: true, WithdrawnAt: &withdrawn, CreatedAt: now},
		// biometric: latest is an explicit revoke -> false
		{ConsentType: ConsentBiometric, Granted: false, CreatedAt: now},
	}

	got := reduceLatestPerPurpose(records)

	if !got[ConsentTerms] {
		t.Errorf("terms: want true (latest grant wins over older revoke), got %v", got[ConsentTerms])
	}
	if got[ConsentNotifications] {
		t.Errorf("notifications: want false (withdrawn trumps grant), got %v", got[ConsentNotifications])
	}
	if got[ConsentBiometric] {
		t.Errorf("biometric: want false (latest revoke), got %v", got[ConsentBiometric])
	}
}

func TestReduceLatestPerPurpose_Empty(t *testing.T) {
	if got := reduceLatestPerPurpose(nil); len(got) != 0 {
		t.Errorf("empty records must yield empty status, got %v", got)
	}
}
