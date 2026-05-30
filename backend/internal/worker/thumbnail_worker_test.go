package worker

// thumbnail_worker_test.go — pure-logic tests for the thumbnail worker.
// Repo/storage-backed paths are covered by integration tests; these
// exercise lifecycle invariants that need no DB or B2 access.

import (
	"context"
	"sync"
	"testing"
	"time"
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
