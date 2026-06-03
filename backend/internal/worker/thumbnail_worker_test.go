package worker

// thumbnail_worker_test.go — pure-logic tests for the thumbnail worker.
// Repo/storage-backed paths are covered by integration tests; these
// exercise lifecycle invariants that need no DB or B2 access.

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

// TestThumbnailWorker_StopIsIdempotent is the F-063 regression: a second
// (or concurrent) Stop() must not panic on an already-closed stopCh. Before
// the fix Stop() did a bare close(w.stopCh), so the second call panicked
// with "close of closed channel". Mirrors TestDownloadWorker_StopIsIdempotent.
func TestThumbnailWorker_StopIsIdempotent(t *testing.T) {
	w := &ThumbnailWorker{stopCh: make(chan struct{})}
	w.Stop()
	w.Stop() // second call must not panic on already-closed channel
}

// TestThumbnailWorker_StopIsConcurrencySafe covers the graceful-shutdown
// race the finding describes: context cancellation and an explicit StopAll()
// can drive Stop() from multiple goroutines at once. The idempotent select
// guard must serialize so exactly one close() runs and none panic.
func TestThumbnailWorker_StopIsConcurrencySafe(t *testing.T) {
	w := &ThumbnailWorker{stopCh: make(chan struct{})}

	const callers = 16
	var wg sync.WaitGroup
	wg.Add(callers)
	for i := 0; i < callers; i++ {
		go func() {
			defer wg.Done()
			w.Stop()
		}()
	}
	wg.Wait()

	// stopCh must be closed exactly once and readable (closed channels
	// return immediately), so Start would observe the stop signal.
	select {
	case <-w.stopCh:
		// closed as expected
	default:
		t.Fatal("stopCh was not closed after Stop()")
	}
}

// TestThumbnailWorker_StopUnblocksStart verifies Stop() actually drives the
// Start loop to return (the stop signal is observed), not just that it avoids
// a panic.
func TestThumbnailWorker_StopUnblocksStart(t *testing.T) {
	// assetRepo is nil; with a 1s default poll interval the ticker won't
	// fire before Stop() lands, so processNextBatch is never reached and
	// the loop exits cleanly on the stop signal.
	w := NewThumbnailWorker(nil, nil, nil)

	done := make(chan struct{})
	go func() {
		w.Start(context.Background())
		close(done)
	}()

	w.Stop()

	select {
	case <-done:
		// Start returned after the stop signal — good.
	case <-time.After(2 * time.Second):
		t.Fatal("Start did not return after Stop()")
	}
}

type fakeThumbAssetRepo struct {
	assets        []repository.Asset
	status        map[uuid.UUID]string
	processingErr map[uuid.UUID]string
	thumbnails    map[uuid.UUID]map[string]string
	dimensions    map[uuid.UUID][2]int
}

func (f *fakeThumbAssetRepo) ListByStatus(_ context.Context, status string, _ int) ([]repository.Asset, error) {
	if status != "processing" {
		return nil, nil
	}
	return f.assets, nil
}

func (f *fakeThumbAssetRepo) UpdateStatus(_ context.Context, id uuid.UUID, status string) error {
	if f.status == nil {
		f.status = map[uuid.UUID]string{}
	}
	f.status[id] = status
	return nil
}

func (f *fakeThumbAssetRepo) UpdateProcessingError(_ context.Context, id uuid.UUID, errMsg string) error {
	if f.processingErr == nil {
		f.processingErr = map[uuid.UUID]string{}
	}
	f.processingErr[id] = errMsg
	return nil
}

func (f *fakeThumbAssetRepo) UpdateThumbnails(_ context.Context, id uuid.UUID, thumbnails map[string]string, _ string) error {
	if f.thumbnails == nil {
		f.thumbnails = map[uuid.UUID]map[string]string{}
	}
	f.thumbnails[id] = thumbnails
	return nil
}

func (f *fakeThumbAssetRepo) UpdateDimensions(_ context.Context, id uuid.UUID, width, height int) error {
	if f.dimensions == nil {
		f.dimensions = map[uuid.UUID][2]int{}
	}
	f.dimensions[id] = [2]int{width, height}
	return nil
}

type fakeThumbStore struct {
	getErr error
}

func (f fakeThumbStore) Put(context.Context, string, io.Reader, int64, string) error { return nil }
func (f fakeThumbStore) Delete(context.Context, string) error                        { return nil }
func (f fakeThumbStore) PresignURL(context.Context, string, storage.PresignOptions) (string, error) {
	return "", nil
}
func (f fakeThumbStore) HealthCheck() storage.HealthStatus {
	return storage.HealthStatus{Status: "ok", Driver: "fake"}
}
func (f fakeThumbStore) Get(context.Context, string) (io.ReadCloser, error) {
	if f.getErr != nil {
		return nil, f.getErr
	}
	return io.NopCloser(bytes.NewReader([]byte("image-bytes"))), nil
}

type fakeThumbnailGenerator struct{}

func (fakeThumbnailGenerator) GenerateAll(context.Context, string, io.Reader) (*service.ThumbnailResult, error) {
	return &service.ThumbnailResult{
		URLs:     map[string]string{"display_webp": "derivatives/a/display.webp"},
		Blurhash: "blur",
		Width:    1600,
		Height:   1000,
	}, nil
}

type fakeExifExtractor struct {
	called  bool
	assetID uuid.UUID
	data    []byte
}

func (f *fakeExifExtractor) ExtractFromBytes(_ context.Context, assetID uuid.UUID, data []byte) error {
	f.called = true
	f.assetID = assetID
	f.data = data
	return nil
}

// countingThumbStore records how many times each storage key is fetched, so a
// test can prove the worker downloads the original exactly once (PERF-10).
type countingThumbStore struct {
	getCalls map[string]int
}

func (s *countingThumbStore) Put(context.Context, string, io.Reader, int64, string) error { return nil }
func (s *countingThumbStore) Delete(context.Context, string) error                        { return nil }
func (s *countingThumbStore) PresignURL(context.Context, string, storage.PresignOptions) (string, error) {
	return "", nil
}
func (s *countingThumbStore) HealthCheck() storage.HealthStatus {
	return storage.HealthStatus{Status: "ok", Driver: "fake"}
}
func (s *countingThumbStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	if s.getCalls == nil {
		s.getCalls = map[string]int{}
	}
	s.getCalls[key]++
	return io.NopCloser(bytes.NewReader([]byte("image-bytes"))), nil
}

func TestThumbnailWorker_ProcessFailurePersistsReason(t *testing.T) {
	assetID := uuid.New()
	repo := &fakeThumbAssetRepo{assets: []repository.Asset{{
		ID:         assetID,
		StorageKey: "originals/missing.jpg",
		Status:     "processing",
	}}}
	w := NewThumbnailWorker(repo, fakeThumbnailGenerator{}, fakeThumbStore{getErr: errors.New("b2 object missing")})

	w.processNextBatch(context.Background())

	if repo.status[assetID] != "error" {
		t.Fatalf("status = %q, want error", repo.status[assetID])
	}
	if repo.processingErr[assetID] == "" {
		t.Fatal("processing error reason was not persisted")
	}
}

func TestThumbnailWorker_SuccessExtractsExifBeforeReady(t *testing.T) {
	assetID := uuid.New()
	repo := &fakeThumbAssetRepo{}
	exif := &fakeExifExtractor{}
	w := NewThumbnailWorker(repo, fakeThumbnailGenerator{}, fakeThumbStore{}).WithExifService(exif)
	asset := &repository.Asset{
		ID:          assetID,
		WorkspaceID: uuid.New(),
		StorageKey:  "originals/photo.jpg",
		ContentType: "image/jpeg",
	}

	if err := w.processOne(context.Background(), asset); err != nil {
		t.Fatalf("processOne returned error: %v", err)
	}
	if !exif.called || exif.assetID != assetID || string(exif.data) != "image-bytes" {
		t.Fatalf("EXIF extractor not called with asset id and buffered original bytes")
	}
	if repo.status[assetID] != "ready" {
		t.Fatalf("status = %q, want ready", repo.status[assetID])
	}
}

func TestThumbnailWorker_DownloadsOriginalOnce(t *testing.T) {
	// PERF-10: the worker must fetch the original from storage exactly once and
	// reuse the buffered bytes for EXIF, rather than re-downloading for EXIF.
	assetID := uuid.New()
	repo := &fakeThumbAssetRepo{}
	exif := &fakeExifExtractor{}
	store := &countingThumbStore{}
	w := NewThumbnailWorker(repo, fakeThumbnailGenerator{}, store).WithExifService(exif)
	asset := &repository.Asset{
		ID:          assetID,
		WorkspaceID: uuid.New(),
		StorageKey:  "originals/photo.jpg",
		ContentType: "image/jpeg",
	}

	if err := w.processOne(context.Background(), asset); err != nil {
		t.Fatalf("processOne returned error: %v", err)
	}

	if got := store.getCalls["originals/photo.jpg"]; got != 1 {
		t.Fatalf("original fetched %d times, want exactly 1 (decode-once)", got)
	}
	if !exif.called || string(exif.data) != "image-bytes" {
		t.Fatalf("EXIF must receive the buffered original bytes; called=%v data=%q",
			exif.called, string(exif.data))
	}
}

func TestThumbnailWorker_NonImageAssetSkipsDerivativesAndMarksReady(t *testing.T) {
	assetID := uuid.New()
	repo := &fakeThumbAssetRepo{}
	w := NewThumbnailWorker(repo, fakeThumbnailGenerator{}, fakeThumbStore{getErr: errors.New("storage should not be read")})
	asset := &repository.Asset{
		ID:          assetID,
		WorkspaceID: uuid.New(),
		StorageKey:  "originals/music.mp3",
		ContentType: "audio/mpeg",
	}

	if err := w.processOne(context.Background(), asset); err != nil {
		t.Fatalf("processOne returned error: %v", err)
	}
	if repo.status[assetID] != "ready" {
		t.Fatalf("status = %q, want ready", repo.status[assetID])
	}
	if repo.processingErr[assetID] != "" {
		t.Fatalf("processing error = %q, want empty", repo.processingErr[assetID])
	}
	if len(repo.thumbnails[assetID]) != 0 {
		t.Fatalf("audio asset should not get thumbnails, got %#v", repo.thumbnails[assetID])
	}
}

func TestShouldSkipDerivativeProcessing_PreservesUnknownContentTypes(t *testing.T) {
	cases := []struct {
		contentType string
		want        bool
	}{
		{"audio/mpeg", true},
		{" application/pdf ", true},
		{"image/jpeg", false},
		{"IMAGE/PNG", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := shouldSkipDerivativeProcessing(tc.contentType); got != tc.want {
			t.Fatalf("shouldSkipDerivativeProcessing(%q) = %v, want %v", tc.contentType, got, tc.want)
		}
	}
}
