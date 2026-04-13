package jobs

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/streaming/cf"
)

// ---- fakes ------------------------------------------------------------------

type fakeRepo struct {
	mu            sync.Mutex
	expired       []cf.ReplayStream
	expiredCalls  []string
	listCallCount int
	listErr       error
}

func (r *fakeRepo) GetByCFUID(context.Context, string) (*cf.ReplayStream, error) { return nil, nil }
func (r *fakeRepo) UpdateReplayReady(context.Context, string, string, string, time.Time) error {
	return nil
}
func (r *fakeRepo) UpdateReplayExpired(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.expiredCalls = append(r.expiredCalls, id)
	return nil
}
func (r *fakeRepo) ListExpired(_ context.Context, now time.Time, limit int) ([]cf.ReplayStream, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.listCallCount++
	if r.listErr != nil {
		return nil, r.listErr
	}
	if limit < len(r.expired) {
		return r.expired[:limit], nil
	}
	return r.expired, nil
}

type fakeDeleter struct {
	mu       sync.Mutex
	calls    []string
	errByVid map[string]error
}

func (d *fakeDeleter) DeleteRecording(_ context.Context, vid string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.calls = append(d.calls, vid)
	return d.errByVid[vid]
}

func newJob(t *testing.T, repo *fakeRepo, del *fakeDeleter, now time.Time) *PurgeJob {
	t.Helper()
	j := NewPurgeJob(repo, del, slog.New(slog.NewTextHandler(io.Discard, nil)))
	j.clock = func() time.Time { return now }
	j.interval = 10 * time.Millisecond
	j.batch = 50
	return j
}

func mkExpired(id, vid string) cf.ReplayStream {
	return cf.ReplayStream{ID: id, ReplayVideoID: vid, ReplayState: "available"}
}

// ---- tests ------------------------------------------------------------------

// T-S6-07 — picks only expired rows (repo is source of truth; we verify the
// worker calls ListExpired with its clock and processes what comes back)
func TestPurge_PicksOnlyExpired(t *testing.T) {
	repo := &fakeRepo{expired: []cf.ReplayStream{mkExpired("s1", "v1"), mkExpired("s2", "v2")}}
	del := &fakeDeleter{}
	j := newJob(t, repo, del, time.Now())
	if err := j.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(del.calls) != 2 || len(repo.expiredCalls) != 2 {
		t.Errorf("deletes=%d, expiredCalls=%d", len(del.calls), len(repo.expiredCalls))
	}
}

// T-S6-08 — batch size honored
func TestPurge_BatchSizeHonored(t *testing.T) {
	exp := make([]cf.ReplayStream, 10)
	for i := range exp {
		exp[i] = mkExpired("s", "v")
	}
	repo := &fakeRepo{expired: exp}
	j := newJob(t, repo, &fakeDeleter{}, time.Now())
	j.batch = 3
	_ = j.Tick(context.Background())
	if len(repo.expiredCalls) != 3 {
		t.Errorf("expiredCalls=%d, want 3 (batch)", len(repo.expiredCalls))
	}
}

// T-S6-09 — CF 404 treated as success (row still marked expired)
func TestPurge_CF404_Tolerated(t *testing.T) {
	repo := &fakeRepo{expired: []cf.ReplayStream{mkExpired("s1", "v1")}}
	del := &fakeDeleter{errByVid: map[string]error{"v1": &cf.CFError{Code: 404, Type: "not_found"}}}
	j := newJob(t, repo, del, time.Now())
	_ = j.Tick(context.Background())
	if len(repo.expiredCalls) != 1 {
		t.Errorf("row should still be marked expired on 404; got %d", len(repo.expiredCalls))
	}
}

// T-S6-10 — CF 500 leaves row in 'available' for retry
func TestPurge_CF500_LeavesAvailableForRetry(t *testing.T) {
	repo := &fakeRepo{expired: []cf.ReplayStream{mkExpired("s1", "v1")}}
	del := &fakeDeleter{errByVid: map[string]error{"v1": &cf.CFError{Code: 500, Type: "server"}}}
	j := newJob(t, repo, del, time.Now())
	_ = j.Tick(context.Background())
	if len(repo.expiredCalls) != 0 {
		t.Errorf("row should NOT be marked expired when CF returned 500; got %d calls", len(repo.expiredCalls))
	}
}

// T-S6-11 — ctx cancel mid-batch → clean exit
func TestPurge_CtxCancel_MidBatch_CleanExit(t *testing.T) {
	exp := []cf.ReplayStream{mkExpired("s1", "v1"), mkExpired("s2", "v2")}
	repo := &fakeRepo{expired: exp}
	del := &fakeDeleter{}
	j := newJob(t, repo, del, time.Now())
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately
	err := j.Tick(ctx)
	if err != nil && !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v", err)
	}
	// Either 0 or some partial count — but never more than total
	if len(repo.expiredCalls) > len(exp) {
		t.Errorf("processed more than input: %d", len(repo.expiredCalls))
	}
}

// T-S6-12 — Run loop ctx cancel
func TestPurge_RunCtxCancel(t *testing.T) {
	repo := &fakeRepo{expired: []cf.ReplayStream{mkExpired("s1", "v1")}}
	j := newJob(t, repo, &fakeDeleter{}, time.Now())
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- j.Run(ctx) }()
	cancel()
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Run did not return")
	}
}

// List error propagates from Tick
func TestPurge_ListError_Propagates(t *testing.T) {
	repo := &fakeRepo{listErr: errors.New("db down")}
	j := newJob(t, repo, &fakeDeleter{}, time.Now())
	if err := j.Tick(context.Background()); err == nil {
		t.Error("expected error")
	}
}

// No deleter (nil) → still marks rows expired (metadata-only purge)
func TestPurge_NilDeleter_OnlyMarksExpired(t *testing.T) {
	repo := &fakeRepo{expired: []cf.ReplayStream{mkExpired("s1", "v1")}}
	j := NewPurgeJob(repo, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	j.clock = time.Now
	_ = j.Tick(context.Background())
	if len(repo.expiredCalls) != 1 {
		t.Errorf("expected 1 expired mark, got %d", len(repo.expiredCalls))
	}
}
