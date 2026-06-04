package worker

// download_worker.go — M14 GAL-FR-150/151/152: asynchronous bulk
// download (ZIP) worker with progress tracking and retry.
//
// The download_jobs table stores client requests to bundle a batch of
// assets into a ZIP. The synchronous /download-zip handler streams
// small jobs directly, but large jobs (hundreds of photos) exceed
// typical HTTP timeouts, so clients create a background job, poll
// /downloads/{jobId} for progress, and finally fetch the completed
// file URL.
//
// This worker:
//  1. Polls download_jobs WHERE status='pending' (FOR UPDATE SKIP LOCKED)
//  2. Marks each job as processing and dispatches a ZIP build
//  3. Emits progress updates as assets are packed
//  4. On success, writes the final download_url + file_size_bytes and
//     marks status='completed'
//  5. On failure, records the error and (after max retries) marks
//     status='failed'
//
// Retries: the worker updates progress in-place, and transient errors
// (storage get, zip write) cause the job to stay in "processing" so
// the next poll picks it back up. After maxRetries consecutive failed
// attempts the job is moved to "failed" with the last error message.
//
// Concurrency: single-instance is fine. Using FOR UPDATE SKIP LOCKED
// means adding a second instance is safe if the scale later demands it.

import (
	"context"
	"log"
	"runtime"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/repository"
)

// downloadConcurrency bounds how many claimed ZIP jobs a single node builds in
// parallel (PERF-WRK). ZIP builds are I/O- and CPU-bound (B2 gets + compression)
// and independent per job, so a claimed batch is processed in parallel rather
// than one-at-a-time, which collapses the per-tick drain on a burst of bulk
// downloads. Capped at the node's CPU count, clamped to [2,4] — lower than the
// thumbnail cap because each ZIP build streams many assets and holds more
// memory/file handles. ClaimPendingJobs already guarantees no job is claimed by
// two workers, so this only parallelizes WITHIN one node's claimed batch.
func downloadConcurrency() int {
	n := runtime.NumCPU()
	if n < 2 {
		return 2
	}
	if n > 4 {
		return 4
	}
	return n
}

// DownloadJobProcessor is the narrow interface the worker needs from
// the service layer to actually build a ZIP for a job. The production
// implementation lives in service.DownloadService; tests pass a fake.
type DownloadJobProcessor interface {
	ProcessJob(ctx context.Context, job *repository.DownloadJob, onProgress func(int)) (downloadURL string, fileSizeBytes int64, err error)
}

// downloadJobRepo is the narrow persistence surface the worker uses. Declaring
// it as an interface (satisfied by the production *repository.DownloadRepo)
// lets the pure-logic concurrency test drive processClaimed with an in-memory
// fake instead of a live Postgres — the atomic-claim correctness path
// (ClaimPendingJobs / FOR UPDATE SKIP LOCKED) is still covered by the
// DB-backed download_claim_test.go.
type downloadJobRepo interface {
	ClaimPendingJobs(ctx context.Context, limit int, leaseSeconds float64) ([]repository.DownloadJob, error)
	UpdateJobStatus(ctx context.Context, id uuid.UUID, status string, progress int, downloadURL string, fileSizeBytes int64) error
	MarkJobFailed(ctx context.Context, id uuid.UUID, errMsg string) error
}

// DownloadWorker processes pending download_jobs rows.
type DownloadWorker struct {
	pool         *pgxpool.Pool
	repo         downloadJobRepo
	processor    DownloadJobProcessor
	pollInterval time.Duration
	maxRetries   int
	// attemptsMu guards attempts: a claimed batch is now processed with
	// bounded intra-batch concurrency (PERF-WRK), so multiple processOne
	// goroutines may touch this map at once. Each goroutine only ever reads/
	// writes its own job's key, but the Go map itself is not concurrency-safe,
	// so the lock is required for correctness under -race.
	attemptsMu sync.Mutex
	attempts   map[uuid.UUID]int // in-memory retry counter
	stopCh     chan struct{}
}

// NewDownloadWorker constructs a worker with sensible defaults.
func NewDownloadWorker(pool *pgxpool.Pool, processor DownloadJobProcessor) *DownloadWorker {
	return &DownloadWorker{
		pool:         pool,
		repo:         repository.NewDownloadRepo(pool),
		processor:    processor,
		pollInterval: 15 * time.Second,
		maxRetries:   3,
		attempts:     make(map[uuid.UUID]int),
		stopCh:       make(chan struct{}),
	}
}

// WithPollInterval overrides the polling interval (used by tests).
func (w *DownloadWorker) WithPollInterval(d time.Duration) *DownloadWorker {
	w.pollInterval = d
	return w
}

// Start runs the worker loop until Stop is called or ctx is cancelled.
// Satisfies the worker.Worker interface so it can be registered with
// the shared registry.
func (w *DownloadWorker) Start(ctx context.Context) {
	if w.processor == nil {
		log.Println("download worker: no processor configured, exiting")
		return
	}
	log.Printf("download worker: started (poll %s)", w.pollInterval)

	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("download worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("download worker: stop signal, stopping")
			return
		case <-ticker.C:
			w.drain(ctx)
		}
	}
}

// Stop signals the worker loop to exit on next iteration.
func (w *DownloadWorker) Stop() {
	select {
	case <-w.stopCh:
		// already closed
	default:
		close(w.stopCh)
	}
}

// downloadClaimLease bounds how long a claimed-but-unfinished job stays out of
// the claimable set. ZIP builds of hundreds of photos can take a while, so the
// lease is generous; only a job stuck in 'processing' past the lease (a crashed
// worker) is re-claimed.
const downloadClaimLease = 30 * time.Minute

// drain atomically claims a batch of pending jobs and processes them with
// bounded intra-batch concurrency. Errors are logged but do not stop the worker
// — the next tick will retry any job that's still pending (a transient failure
// resets the row to 'pending').
func (w *DownloadWorker) drain(ctx context.Context) {
	jobs, err := w.repo.ClaimPendingJobs(ctx, 5, downloadClaimLease.Seconds())
	if err != nil {
		log.Printf("download worker: claim pending: %v", err)
		return
	}
	w.processClaimed(ctx, jobs)
}

// processClaimed builds an already-claimed batch of ZIP jobs in parallel up to
// downloadConcurrency() workers (PERF-WRK). Each claimed job is independent, so
// processing them concurrently collapses the per-tick drain time on a burst of
// bulk downloads instead of building one ZIP at a time. Correctness is
// unchanged: ClaimPendingJobs already atomically claimed these rows, so no job
// is built by two workers; here we only spread one node's claimed batch across
// its cores. The Wait() barrier guarantees no goroutine outlives the tick.
func (w *DownloadWorker) processClaimed(ctx context.Context, jobs []repository.DownloadJob) {
	if len(jobs) == 0 {
		return
	}

	var g errgroup.Group
	g.SetLimit(downloadConcurrency())
	for i := range jobs {
		job := jobs[i] // capture per-iteration copy for the goroutine
		g.Go(func() error {
			w.processOne(ctx, &job)
			return nil // per-job failures are recorded, never abort the batch
		})
	}
	_ = g.Wait()
}

// processOne runs a single job through the processor and updates the
// row with final status or an error message. The job is already claimed
// (status='processing', claimed_at stamped) by ClaimPendingJobs, so no separate
// mark is needed here.
func (w *DownloadWorker) processOne(ctx context.Context, job *repository.DownloadJob) {
	onProgress := func(pct int) {
		if pct < 0 {
			pct = 0
		}
		if pct > 100 {
			pct = 100
		}
		_ = w.repo.UpdateJobStatus(ctx, job.ID, "processing", pct, "", 0)
	}

	url, size, err := w.processor.ProcessJob(ctx, job, onProgress)
	if err != nil {
		attempt := w.bumpAttempt(job.ID)
		log.Printf("download worker: process %s attempt %d: %v", job.ID, attempt, err)
		if attempt >= w.maxRetries {
			_ = w.repo.MarkJobFailed(ctx, job.ID, err.Error())
			w.clearAttempt(job.ID)
			return
		}
		// Put the job back into pending so the next tick retries it.
		_ = w.repo.UpdateJobStatus(ctx, job.ID, "pending", 0, "", 0)
		return
	}

	// Success — clear attempts + mark complete.
	w.clearAttempt(job.ID)
	if err := w.repo.UpdateJobStatus(ctx, job.ID, "completed", 100, url, size); err != nil {
		log.Printf("download worker: mark complete %s: %v", job.ID, err)
	}
}

// bumpAttempt increments and returns the retry counter for a job under the
// attempts lock, so concurrent processClaimed goroutines can't corrupt the map.
func (w *DownloadWorker) bumpAttempt(id uuid.UUID) int {
	w.attemptsMu.Lock()
	defer w.attemptsMu.Unlock()
	if w.attempts == nil {
		w.attempts = make(map[uuid.UUID]int)
	}
	w.attempts[id]++
	return w.attempts[id]
}

// clearAttempt removes a job's retry counter under the attempts lock.
func (w *DownloadWorker) clearAttempt(id uuid.UUID) {
	w.attemptsMu.Lock()
	defer w.attemptsMu.Unlock()
	delete(w.attempts, id)
}
