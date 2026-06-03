package worker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// AREA-UPLOADER-1 — the upload-credit expiry sweeper must call
// ExpireAbandoned on each tick so dropped Consume/Refund reservations are
// refunded back to the balance instead of permanently double-charging.

type stubExpiry struct {
	mu        sync.Mutex
	calls     []time.Duration
	returnN   int
	returnErr error
}

func (s *stubExpiry) ExpireAbandoned(_ context.Context, olderThan time.Duration) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, olderThan)
	return s.returnN, s.returnErr
}

// TestCreditExpiryWorker_RunOnce_CallsExpireAbandoned is the core P1b guard: a
// single sweep must invoke ExpireAbandoned with the worker's TTL.
func TestCreditExpiryWorker_RunOnce_CallsExpireAbandoned(t *testing.T) {
	svc := &stubExpiry{returnN: 3}
	w := NewUploadCreditExpiryWorker(svc)

	w.runOnce(context.Background())

	svc.mu.Lock()
	defer svc.mu.Unlock()
	if assert.Len(t, svc.calls, 1, "runOnce must call ExpireAbandoned exactly once") {
		assert.Equal(t, DefaultUploadCreditExpiryTTL, svc.calls[0], "must pass the default 24h TTL")
	}
}

// TestCreditExpiryWorker_NilSvc_IsNoop: a nil service must short-circuit without
// panicking (the meter-off / mis-wired path).
func TestCreditExpiryWorker_NilSvc_IsNoop(t *testing.T) {
	w := NewUploadCreditExpiryWorker(nil)
	w.runOnce(context.Background()) // must not panic
}

// TestCreditExpiryWorker_ErrorIsSwallowed: an ExpireAbandoned error must be
// logged-and-returned, not propagated/panic — the next tick retries.
func TestCreditExpiryWorker_ErrorIsSwallowed(t *testing.T) {
	svc := &stubExpiry{returnErr: errors.New("db down")}
	w := NewUploadCreditExpiryWorker(svc)
	w.runOnce(context.Background()) // must not panic
	svc.mu.Lock()
	assert.Len(t, svc.calls, 1)
	svc.mu.Unlock()
}

// TestCreditExpiryWorker_DefaultPollInterval guards the hourly cadence.
func TestCreditExpiryWorker_DefaultPollInterval(t *testing.T) {
	w := NewUploadCreditExpiryWorker(&stubExpiry{})
	assert.Equal(t, time.Hour, w.pollInterval)
}

// TestCreditExpiryWorker_StartStop exits cleanly on Stop.
func TestCreditExpiryWorker_StartStop(t *testing.T) {
	w := NewUploadCreditExpiryWorker(&stubExpiry{})
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
