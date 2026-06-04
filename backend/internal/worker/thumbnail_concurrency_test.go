package worker

// thumbnail_concurrency_test.go — PERF-WRK regression: a claimed batch of
// independent assets must be processed with BOUNDED INTRA-BATCH CONCURRENCY,
// not one-at-a-time. The atomic claim (ClaimRetryable / ListByStatus) already
// guarantees no asset is claimed — and therefore no asset is encoded — by two
// workers at once; this test only proves that WITHIN a single already-claimed
// batch on one node the encodes run in parallel and every asset is processed
// exactly once.
//
// Before the fix processNextBatch ran a serial `for` loop, so maxInFlight was
// always 1 and the gate below failed (or timed out at the barrier).

import (
	"context"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// concurrentThumbAssetRepo is a thread-safe asset repo fake. The existing
// fakeThumbAssetRepo writes to plain maps without locks, which is fine for
// single-asset tests but races once a batch is processed in parallel. This
// fake guards every mutation so the race detector stays quiet and the test
// asserts on real counts.
type concurrentThumbAssetRepo struct {
	mu     sync.Mutex
	assets []repository.Asset
	status map[uuid.UUID]string
	thumbs map[uuid.UUID]int // count of UpdateThumbnails calls per asset
}

func (f *concurrentThumbAssetRepo) ListByStatus(_ context.Context, status string, _ int) ([]repository.Asset, error) {
	if status != "processing" {
		return nil, nil
	}
	return f.assets, nil
}

func (f *concurrentThumbAssetRepo) UpdateStatus(_ context.Context, id uuid.UUID, status string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.status == nil {
		f.status = map[uuid.UUID]string{}
	}
	f.status[id] = status
	return nil
}

func (f *concurrentThumbAssetRepo) UpdateProcessingError(_ context.Context, _ uuid.UUID, _ string) error {
	return nil
}

func (f *concurrentThumbAssetRepo) UpdateThumbnails(_ context.Context, id uuid.UUID, _ map[string]string, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.thumbs == nil {
		f.thumbs = map[uuid.UUID]int{}
	}
	f.thumbs[id]++
	return nil
}

func (f *concurrentThumbAssetRepo) UpdateDimensions(_ context.Context, _ uuid.UUID, _, _ int) error {
	return nil
}

// barrierGenerator records the maximum number of concurrent GenerateAll calls
// in flight at any instant. Each call increments an atomic counter, parks
// briefly so siblings can overlap, then decrements — so a serial loop tops out
// at maxInFlight==1 while a bounded pool reaches min(batch, limit).
type barrierGenerator struct {
	inFlight    int32
	maxInFlight int32
}

func (g *barrierGenerator) GenerateAll(_ context.Context, _ string, _ io.Reader) (*service.ThumbnailResult, error) {
	cur := atomic.AddInt32(&g.inFlight, 1)
	for {
		prev := atomic.LoadInt32(&g.maxInFlight)
		if cur <= prev || atomic.CompareAndSwapInt32(&g.maxInFlight, prev, cur) {
			break
		}
	}
	// Hold the slot long enough for siblings to overlap. Short enough to keep
	// the test fast even under the serial (pre-fix) path.
	time.Sleep(15 * time.Millisecond)
	atomic.AddInt32(&g.inFlight, -1)
	return &service.ThumbnailResult{
		URLs:     map[string]string{"display_webp": "derivatives/a/display.webp"},
		Blurhash: "blur",
		Width:    1600,
		Height:   1000,
	}, nil
}

// TestThumbnailWorker_ProcessesBatchConcurrently is the PERF-WRK RED→GREEN test.
// It enqueues a batch of independent image assets and asserts (a) every asset
// is processed exactly once and (b) more than one encode was in flight at the
// same time (proving the per-tick batch is no longer drained serially).
func TestThumbnailWorker_ProcessesBatchConcurrently(t *testing.T) {
	const batch = 8
	assets := make([]repository.Asset, batch)
	for i := range assets {
		assets[i] = repository.Asset{
			ID:          uuid.New(),
			WorkspaceID: uuid.New(),
			StorageKey:  "originals/photo.jpg",
			ContentType: "image/jpeg",
		}
	}
	repo := &concurrentThumbAssetRepo{assets: assets}
	gen := &barrierGenerator{}
	w := NewThumbnailWorker(repo, gen, fakeThumbStore{})

	w.processNextBatch(context.Background())

	// Every asset must be processed exactly once (no double-encode, no skip).
	repo.mu.Lock()
	defer repo.mu.Unlock()
	if len(repo.thumbs) != batch {
		t.Fatalf("processed %d distinct assets, want %d", len(repo.thumbs), batch)
	}
	for id, n := range repo.thumbs {
		if n != 1 {
			t.Fatalf("asset %s processed %d times, want exactly 1", id, n)
		}
		if repo.status[id] != "ready" {
			t.Fatalf("asset %s status = %q, want ready", id, repo.status[id])
		}
	}

	// The whole point: the batch ran with concurrency > 1.
	if got := atomic.LoadInt32(&gen.maxInFlight); got < 2 {
		t.Fatalf("max concurrent encodes = %d, want > 1 (batch processed serially)", got)
	}
}
