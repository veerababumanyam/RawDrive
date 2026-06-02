package worker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// AREA-UPLOADER-2 — the derivative-retry sweep must (a) re-queue failed assets
// for retry and (b) park exhausted ones in the dead-letter state.

type stubDerivStore struct {
	mu              sync.Mutex
	requeueCalls    []retryArgs
	markCalls       []int
	requeueN        int64
	markN           int64
	requeueErr      error
	markErr         error
}

type retryArgs struct {
	maxAttempts int
	limit       int
}

func (s *stubDerivStore) RequeueRetryableFailedAssets(_ context.Context, maxAttempts, limit int) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.requeueCalls = append(s.requeueCalls, retryArgs{maxAttempts, limit})
	return s.requeueN, s.requeueErr
}

func (s *stubDerivStore) MarkExhaustedAssetsPermanentlyFailed(_ context.Context, maxAttempts int) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.markCalls = append(s.markCalls, maxAttempts)
	return s.markN, s.markErr
}

// TestDerivativeRetryWorker_Sweep_RequeuesAndDeadLetters is the core P3 guard:
// one sweep must both mark exhausted rows as permanently failed AND re-queue
// retryable ones, using the worker's attempt cap.
func TestDerivativeRetryWorker_Sweep_RequeuesAndDeadLetters(t *testing.T) {
	store := &stubDerivStore{requeueN: 2, markN: 1}
	w := NewDerivativeRetryWorker(store)

	w.sweep(context.Background())

	store.mu.Lock()
	defer store.mu.Unlock()
	if assert.Len(t, store.markCalls, 1, "sweep must dead-letter exhausted assets once") {
		assert.Equal(t, DefaultDerivativeMaxAttempts, store.markCalls[0])
	}
	if assert.Len(t, store.requeueCalls, 1, "sweep must re-queue retryable assets once") {
		assert.Equal(t, DefaultDerivativeMaxAttempts, store.requeueCalls[0].maxAttempts)
		assert.Equal(t, w.batchSize, store.requeueCalls[0].limit)
	}
}

// TestDerivativeRetryWorker_DeadLetterFirst: the dead-letter mark must run
// BEFORE the requeue, so a row crossing the cap is surfaced rather than
// re-queued one last time. We assert the mark ran even when requeue errors.
func TestDerivativeRetryWorker_RequeueErrorStillDeadLetters(t *testing.T) {
	store := &stubDerivStore{markN: 4, requeueErr: errors.New("boom")}
	w := NewDerivativeRetryWorker(store)
	w.sweep(context.Background())
	store.mu.Lock()
	defer store.mu.Unlock()
	assert.Len(t, store.markCalls, 1, "dead-letter mark must run even if requeue fails")
}

// TestDerivativeRetryWorker_NilStore_IsNoop guards the mis-wired path.
func TestDerivativeRetryWorker_NilStore_IsNoop(t *testing.T) {
	w := NewDerivativeRetryWorker(nil)
	w.sweep(context.Background()) // must not panic
}

// TestDerivativeRetryWorker_Defaults guards the cadence + cap.
func TestDerivativeRetryWorker_Defaults(t *testing.T) {
	w := NewDerivativeRetryWorker(&stubDerivStore{})
	assert.Equal(t, DefaultDerivativeMaxAttempts, w.maxAttempts)
	assert.Equal(t, 5*time.Minute, w.pollInterval)
}

// TestDerivativeRetryWorker_StartStop exits cleanly on Stop.
func TestDerivativeRetryWorker_StartStop(t *testing.T) {
	w := NewDerivativeRetryWorker(&stubDerivStore{})
	w.pollInterval = 10 * time.Millisecond
	done := make(chan struct{})
	go func() { w.Start(context.Background()); close(done) }()
	time.Sleep(25 * time.Millisecond)
	w.Stop()
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("worker did not stop within 500ms of Stop()")
	}
}
