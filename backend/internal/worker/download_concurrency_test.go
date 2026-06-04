package worker

// download_concurrency_test.go — PERF-WRK regression for the download worker:
// an already-claimed batch of independent ZIP jobs must be built with BOUNDED
// INTRA-BATCH CONCURRENCY, not one-at-a-time. ClaimPendingJobs already
// guarantees no job is claimed by two workers; this test only proves that
// within a single claimed batch on one node the ZIP builds run in parallel and
// every job is processed exactly once.
//
// It drives processClaimed directly (the seam drain() calls after the atomic
// claim) with a fake processor + fake repo, so it needs no DB and no real ZIP
// build. The atomic-claim correctness path is covered by download_claim_test.go.

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// barrierProcessor records the maximum number of concurrent ProcessJob calls in
// flight at any instant and how many times each job was seen. A serial loop
// tops out at maxInFlight==1; a bounded pool reaches min(batch, limit).
type barrierProcessor struct {
	inFlight    int32
	maxInFlight int32

	mu       sync.Mutex
	jobCalls map[uuid.UUID]int
}

func (p *barrierProcessor) ProcessJob(_ context.Context, job *repository.DownloadJob, _ func(int)) (string, int64, error) {
	cur := atomic.AddInt32(&p.inFlight, 1)
	for {
		prev := atomic.LoadInt32(&p.maxInFlight)
		if cur <= prev || atomic.CompareAndSwapInt32(&p.maxInFlight, prev, cur) {
			break
		}
	}
	time.Sleep(15 * time.Millisecond) // hold the slot so siblings overlap
	atomic.AddInt32(&p.inFlight, -1)

	p.mu.Lock()
	if p.jobCalls == nil {
		p.jobCalls = map[uuid.UUID]int{}
	}
	p.jobCalls[job.ID]++
	p.mu.Unlock()

	return "downloads/" + job.ID.String() + ".zip", 1234, nil
}

// fakeDownloadRepo is a thread-safe in-memory downloadJobRepo so processClaimed
// can run without a DB. It records the terminal status each job reaches.
type fakeDownloadRepo struct {
	mu     sync.Mutex
	status map[uuid.UUID]string
}

func (r *fakeDownloadRepo) ClaimPendingJobs(_ context.Context, _ int, _ float64) ([]repository.DownloadJob, error) {
	return nil, nil // unused: the test drives processClaimed directly
}

func (r *fakeDownloadRepo) UpdateJobStatus(_ context.Context, id uuid.UUID, status string, _ int, _ string, _ int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status == nil {
		r.status = map[uuid.UUID]string{}
	}
	r.status[id] = status
	return nil
}

func (r *fakeDownloadRepo) MarkJobFailed(_ context.Context, id uuid.UUID, _ string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status == nil {
		r.status = map[uuid.UUID]string{}
	}
	r.status[id] = "failed"
	return nil
}

// TestDownloadWorker_ProcessesBatchConcurrently is the PERF-WRK RED→GREEN test
// for the download worker. It runs a claimed batch through processClaimed and
// asserts (a) every job is processed exactly once, (b) each reaches 'completed',
// and (c) more than one ZIP build was in flight at the same time.
func TestDownloadWorker_ProcessesBatchConcurrently(t *testing.T) {
	const batch = 6
	jobs := make([]repository.DownloadJob, batch)
	for i := range jobs {
		jobs[i] = repository.DownloadJob{ID: uuid.New()}
	}

	proc := &barrierProcessor{}
	repo := &fakeDownloadRepo{}
	w := &DownloadWorker{
		repo:       repo,
		processor:  proc,
		maxRetries: 3,
		attempts:   make(map[uuid.UUID]int),
		stopCh:     make(chan struct{}),
	}

	w.processClaimed(context.Background(), jobs)

	proc.mu.Lock()
	if len(proc.jobCalls) != batch {
		proc.mu.Unlock()
		t.Fatalf("processed %d distinct jobs, want %d", len(proc.jobCalls), batch)
	}
	for id, n := range proc.jobCalls {
		if n != 1 {
			proc.mu.Unlock()
			t.Fatalf("job %s processed %d times, want exactly 1", id, n)
		}
	}
	maxInFlight := atomic.LoadInt32(&proc.maxInFlight)
	proc.mu.Unlock()

	repo.mu.Lock()
	for _, j := range jobs {
		if repo.status[j.ID] != "completed" {
			repo.mu.Unlock()
			t.Fatalf("job %s status = %q, want completed", j.ID, repo.status[j.ID])
		}
	}
	repo.mu.Unlock()

	if maxInFlight < 2 {
		t.Fatalf("max concurrent ZIP builds = %d, want > 1 (batch processed serially)", maxInFlight)
	}
}
