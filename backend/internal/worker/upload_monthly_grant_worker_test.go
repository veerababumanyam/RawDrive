package worker

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/upload/credit"
)

// stubGrantSvc captures GrantMonthly calls so tests can assert the worker
// dispatched exactly what it was supposed to. Returns a GrantGranted
// result by default; tests override `overrideStatus` to exercise the
// replay / skip branches.
type stubGrantSvc struct {
	mu             sync.Mutex
	calls          []credit.GrantMonthlyInput
	overrideStatus credit.GrantStatus
	returnErr      error
}

func (s *stubGrantSvc) GrantMonthly(_ context.Context, in credit.GrantMonthlyInput) (*credit.GrantMonthlyResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, in)
	if s.returnErr != nil {
		return nil, s.returnErr
	}
	status := s.overrideStatus
	if status == "" {
		status = credit.GrantGranted
	}
	return &credit.GrantMonthlyResult{
		Status: status,
		LedgerEntry: &credit.LedgerEntry{
			ID:            uuid.New(),
			WorkspaceID:   in.WorkspaceID,
			EntryType:     credit.EntryGrantMonthly,
			AmountCredits: credit.MonthlyGrantAmountForPlan(in.PlanTier),
			CreatedAt:     time.Now().UTC(),
		},
	}, nil
}

// firstOfMonth is unexported, but the test file lives in the same package
// (package worker) so we can call it directly.
func TestFirstOfMonth_AnchorsToFirstDayMidnightUTC(t *testing.T) {
	cases := []struct {
		input time.Time
		want  time.Time
	}{
		{
			input: time.Date(2026, time.April, 21, 10, 30, 45, 123, time.UTC),
			want:  time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			input: time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC),
			want:  time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			input: time.Date(2025, time.December, 31, 23, 59, 59, 0, time.UTC),
			want:  time.Date(2025, time.December, 1, 0, 0, 0, 0, time.UTC),
		},
	}
	for _, c := range cases {
		got := firstOfMonth(c.input)
		assert.Equal(t, c.want, got, "firstOfMonth(%v)", c.input)
	}
}

// With a nil pool, runOnce must be a no-op that logs-and-returns without
// panicking. Protects the opt-in-disabled deployment path — main.go wires
// the worker with a real pool only when UPLOAD_CREDIT_MONTHLY_GRANT_ENABLED=true.
func TestUploadMonthlyGrantWorker_NilPool_RunOnceIsNoop(t *testing.T) {
	svc := &stubGrantSvc{}
	w := NewUploadMonthlyGrantWorker(nil, svc)

	// Should not panic and should not call the service.
	w.runOnce(context.Background())

	assert.Empty(t, svc.calls, "nil pool must short-circuit before any GrantMonthly call")
}

// With a nil service, runOnce must also short-circuit. Same protection as
// the nil-pool case — wired handlers without a service are returning 503,
// and the worker follows the same fail-closed posture.
func TestUploadMonthlyGrantWorker_NilSvc_RunOnceIsNoop(t *testing.T) {
	// Pool is intentionally nil here too — we can't construct a real pool
	// without a DB. The short-circuit on the nil-svc branch fires before
	// the pool is ever touched.
	w := NewUploadMonthlyGrantWorker(nil, nil)
	w.runOnce(context.Background())
	// No panic = pass.
}

// Verify the worker constructor defaults pollInterval to 1 hour. A future
// change that accidentally tightens this to 1 minute would DoS the DB.
func TestUploadMonthlyGrantWorker_DefaultPollInterval(t *testing.T) {
	w := NewUploadMonthlyGrantWorker(nil, nil)
	assert.Equal(t, time.Hour, w.pollInterval)
}

// Start/Stop exits cleanly when the stopCh is closed. Protects against
// leaked goroutines in tests that would poll against a nil pool forever.
func TestUploadMonthlyGrantWorker_StartStop(t *testing.T) {
	w := NewUploadMonthlyGrantWorker(nil, nil)
	// Tighten the interval so the ticker doesn't block the test.
	w.pollInterval = 10 * time.Millisecond

	done := make(chan struct{})
	go func() {
		w.Start(context.Background())
		close(done)
	}()

	// Let one tick happen, then stop.
	time.Sleep(25 * time.Millisecond)
	w.Stop()

	select {
	case <-done:
		// worker returned as expected
	case <-time.After(500 * time.Millisecond):
		t.Fatal("worker did not stop within 500ms of Stop()")
	}
}
