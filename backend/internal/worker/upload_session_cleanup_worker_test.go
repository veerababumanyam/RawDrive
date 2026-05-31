package worker

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// ─────────────────────────────────────────────────────────────────────────────
// AREA-UPLOADER-5 (P1a) + AREA-UPLOADER-6 (P2a) — upload-session cleanup sweep.
//
// sweepSessions() owns three behaviours we guard here:
//   - releases leaked storage reserved_bytes for expired NON-completed sessions
//     before deleting the row (P1a);
//   - skips aborting a session whose asset already exists (finalized-but-
//     unstamped) and stamps it completed instead (P2a);
//   - the abort/release/delete path still runs for genuinely-abandoned sessions.
//
// These exercise sweepSessions() directly via injected fakes + delete/mark
// callbacks; the DB-backed ListExpired path is covered by the repo tests.
// ─────────────────────────────────────────────────────────────────────────────

// stubReleaser records ReleaseUploadReservation calls.
type stubReleaser struct {
	mu    sync.Mutex
	calls []releaseCall
	err   error
}

type releaseCall struct {
	workspaceID uuid.UUID
	bytes       int64
}

func (s *stubReleaser) ReleaseUploadReservation(_ context.Context, ws uuid.UUID, b int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, releaseCall{ws, b})
	return s.err
}

// stubAssetExistence returns a configurable existence verdict per storage key.
type stubAssetExistence struct {
	existsKeys map[string]bool
	err        error
}

func (s *stubAssetExistence) ExistsByStorageKey(_ context.Context, key string) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	return s.existsKeys[key], nil
}

// abortRecordingStore is a MultipartCapable fake that records aborted upload IDs.
type abortRecordingStore struct {
	mu      sync.Mutex
	aborted []string
}

func (s *abortRecordingStore) Put(context.Context, string, io.Reader, int64, string) error {
	return nil
}
func (s *abortRecordingStore) Get(context.Context, string) (io.ReadCloser, error) {
	return nil, errors.New("not implemented")
}
func (s *abortRecordingStore) Delete(context.Context, string) error { return nil }
func (s *abortRecordingStore) PresignURL(context.Context, string, storage.PresignOptions) (string, error) {
	return "", errors.New("not implemented")
}
func (s *abortRecordingStore) HealthCheck() storage.HealthStatus {
	return storage.HealthStatus{Status: "ok", Driver: "fake"}
}
func (s *abortRecordingStore) CreateMultipartUpload(context.Context, string, string) (string, error) {
	return "mp-x", nil
}
func (s *abortRecordingStore) UploadPart(context.Context, string, string, int32, io.Reader, int64) (string, error) {
	return "etag", nil
}
func (s *abortRecordingStore) CompleteMultipartUpload(context.Context, string, string, []storage.CompletedPart) error {
	return nil
}
func (s *abortRecordingStore) AbortMultipartUpload(_ context.Context, _ string, uploadID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.aborted = append(s.aborted, uploadID)
	return nil
}

var _ storage.Provider = (*abortRecordingStore)(nil)
var _ storage.MultipartCapable = (*abortRecordingStore)(nil)

// sessionFixture builds an expired-style session row for the sweep.
func sessionFixture(ws uuid.UUID, mpID string, totalSize int64) repository.UploadSession {
	id := uuid.New().String()
	return repository.UploadSession{
		WorkspaceID:         ws,
		TUSUploadID:         id,
		Filename:            "photo.jpg",
		ContentType:         "image/jpeg",
		TotalSize:           totalSize,
		R2MultipartUploadID: &mpID,
	}
}

// TestSweep_ReleasesReservationForAbandonedSession (AREA-UPLOADER-5): a
// genuinely-abandoned expired session must have its multipart aborted, its
// reserved_bytes released, and its row deleted.
func TestSweep_ReleasesReservationForAbandonedSession(t *testing.T) {
	store := &abortRecordingStore{}
	releaser := &stubReleaser{}
	assets := &stubAssetExistence{existsKeys: map[string]bool{}} // no asset → abandoned

	w := NewUploadSessionCleanupWorker(nil, store).
		WithStorageAccounting(releaser).
		WithAssetExistence(assets)

	ws := uuid.New()
	session := sessionFixture(ws, "mp-abandoned", 4096)

	deleted := map[string]bool{}
	w.sweepSessions(context.Background(), []repository.UploadSession{session},
		func(_ context.Context, id string) error { deleted[id] = true; return nil },
		nil,
	)

	releaser.mu.Lock()
	defer releaser.mu.Unlock()
	if assert.Len(t, releaser.calls, 1, "the abandoned session's reservation must be released") {
		assert.Equal(t, ws, releaser.calls[0].workspaceID)
		assert.Equal(t, int64(4096), releaser.calls[0].bytes, "release must return the full reserved total_size")
	}
	store.mu.Lock()
	assert.Contains(t, store.aborted, "mp-abandoned", "the abandoned session's multipart must be aborted")
	store.mu.Unlock()
	assert.True(t, deleted[session.TUSUploadID], "the abandoned session row must be deleted")
}

// TestSweep_FinalizedButUnstamped_SkipsAbortAndReleases (AREA-UPLOADER-6): when
// an asset already exists for the session's storage key, the sweep must NOT
// abort the multipart, must NOT release the reservation (committed at finalize),
// and must stamp the session completed instead of deleting it.
func TestSweep_FinalizedButUnstamped_SkipsAbortAndReleases(t *testing.T) {
	store := &abortRecordingStore{}
	releaser := &stubReleaser{}

	ws := uuid.New()
	session := sessionFixture(ws, "mp-finalized", 4096)
	storageKey := deriveStorageKey(session)
	assets := &stubAssetExistence{existsKeys: map[string]bool{storageKey: true}}

	w := NewUploadSessionCleanupWorker(nil, store).
		WithStorageAccounting(releaser).
		WithAssetExistence(assets)

	deleted := map[string]bool{}
	marked := map[string]bool{}
	w.sweepSessions(context.Background(), []repository.UploadSession{session},
		func(_ context.Context, id string) error { deleted[id] = true; return nil },
		func(_ context.Context, id string) error { marked[id] = true; return nil },
	)

	store.mu.Lock()
	assert.NotContains(t, store.aborted, "mp-finalized", "a finalized-but-unstamped session's multipart must NOT be aborted")
	store.mu.Unlock()
	releaser.mu.Lock()
	assert.Empty(t, releaser.calls, "a finalized session's reservation must NOT be released (already committed)")
	releaser.mu.Unlock()
	assert.False(t, deleted[session.TUSUploadID], "a finalized-but-unstamped session must NOT be deleted")
	assert.True(t, marked[session.TUSUploadID], "a finalized-but-unstamped session must be stamped completed")
}

// TestSweep_NilAccounting_StillDeletes: with no releaser wired the sweep must
// still abort + delete (backward compatible — graceful degradation).
func TestSweep_NilAccounting_StillDeletes(t *testing.T) {
	store := &abortRecordingStore{}
	w := NewUploadSessionCleanupWorker(nil, store)

	session := sessionFixture(uuid.New(), "mp-noacc", 100)
	deleted := map[string]bool{}
	w.sweepSessions(context.Background(), []repository.UploadSession{session},
		func(_ context.Context, id string) error { deleted[id] = true; return nil },
		nil,
	)

	assert.True(t, deleted[session.TUSUploadID], "session must still be deleted with no accounting wired")
	store.mu.Lock()
	assert.Contains(t, store.aborted, "mp-noacc")
	store.mu.Unlock()
}
