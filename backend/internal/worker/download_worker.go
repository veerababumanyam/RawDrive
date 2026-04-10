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
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/repository"
)

// DownloadJobProcessor is the narrow interface the worker needs from
// the service layer to actually build a ZIP for a job. The production
// implementation lives in service.DownloadService; tests pass a fake.
type DownloadJobProcessor interface {
	ProcessJob(ctx context.Context, job *repository.DownloadJob, onProgress func(int)) (downloadURL string, fileSizeBytes int64, err error)
}

// DownloadWorker processes pending download_jobs rows.
type DownloadWorker struct {
	pool         *pgxpool.Pool
	repo         *repository.DownloadRepo
	processor    DownloadJobProcessor
	pollInterval time.Duration
	maxRetries   int
	attempts     map[uuid.UUID]int // in-memory retry counter
	stopCh       chan struct{}
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

// drain pulls a batch of pending jobs and processes them one by one.
// Errors are logged but do not stop the worker — the next tick will
// retry any job that's still pending.
func (w *DownloadWorker) drain(ctx context.Context) {
	jobs, err := w.repo.ListPendingJobs(ctx, 5)
	if err != nil {
		log.Printf("download worker: list pending: %v", err)
		return
	}
	for i := range jobs {
		w.processOne(ctx, &jobs[i])
	}
}

// processOne runs a single job through the processor and updates the
// row with final status or an error message.
func (w *DownloadWorker) processOne(ctx context.Context, job *repository.DownloadJob) {
	// Mark as processing so concurrent workers (or a restart) don't
	// pick it up again until we finish or timeout.
	if err := w.repo.UpdateJobStatus(ctx, job.ID, "processing", 0, "", 0); err != nil {
		log.Printf("download worker: mark processing %s: %v", job.ID, err)
		return
	}

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
		w.attempts[job.ID]++
		log.Printf("download worker: process %s attempt %d: %v", job.ID, w.attempts[job.ID], err)
		if w.attempts[job.ID] >= w.maxRetries {
			_ = w.repo.MarkJobFailed(ctx, job.ID, err.Error())
			delete(w.attempts, job.ID)
			return
		}
		// Put the job back into pending so the next tick retries it.
		_ = w.repo.UpdateJobStatus(ctx, job.ID, "pending", 0, "", 0)
		return
	}

	// Success — clear attempts + mark complete.
	delete(w.attempts, job.ID)
	if err := w.repo.UpdateJobStatus(ctx, job.ID, "completed", 100, url, size); err != nil {
		log.Printf("download worker: mark complete %s: %v", job.ID, err)
	}
}
