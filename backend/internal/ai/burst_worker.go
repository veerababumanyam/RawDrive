package ai

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
)

type BurstWorker struct {
	jobRepo      *JobRepo
	burstSvc     *BurstService
	pollInterval time.Duration
	stopCh       chan struct{}
}

func NewBurstWorker(jobRepo *JobRepo, burstSvc *BurstService) *BurstWorker {
	return &BurstWorker{jobRepo: jobRepo, burstSvc: burstSvc, pollInterval: 15 * time.Second, stopCh: make(chan struct{})}
}

func (w *BurstWorker) Start(ctx context.Context) {
	log.Println("burst worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.processNextBatch(ctx)
		}
	}
}

func (w *BurstWorker) Stop() { close(w.stopCh) }

// burstClaimLease bounds how long a claimed-but-unfinished burst job stays out
// of the claimable set; only a job stuck in 'running' past the lease (a crashed
// worker) is re-claimed.
const burstClaimLease = 10 * time.Minute

func (w *BurstWorker) processNextBatch(ctx context.Context) {
	// Atomic claim: flips pending → running + stamps claimed_at so two workers
	// never claim — and therefore never double-group — the same job's assets.
	jobs, err := w.jobRepo.ClaimPending(ctx, "burst_grouping", 3, burstClaimLease.Seconds())
	if err != nil {
		log.Printf("burst worker: claim pending: %v", err)
		return
	}
	for _, job := range jobs {
		if err := w.processJob(ctx, job); err != nil {
			log.Printf("burst worker: job %s failed: %v", job.ID, err)
			w.jobRepo.MarkFailed(ctx, job.ID, err.Error())
		}
	}
}

func (w *BurstWorker) processJob(ctx context.Context, job *AIJob) error {
	w.jobRepo.UpdateProgress(ctx, job.ID, "running", 0)
	galleryIDStr, ok := job.Result["gallery_id"].(string)
	if !ok {
		return ErrParseFailure
	}
	galleryID, err := uuid.Parse(galleryIDStr)
	if err != nil {
		return err
	}
	timeWindowSec := 3
	if tw, ok := job.Result["time_window_sec"].(float64); ok && tw > 0 {
		timeWindowSec = int(tw)
	}
	groupsCreated, err := w.burstSvc.GroupByTimeSimilarity(ctx, galleryID, timeWindowSec)
	if err != nil {
		return err
	}
	return w.jobRepo.MarkDone(ctx, job.ID, map[string]any{"groups_created": groupsCreated, "gallery_id": galleryID.String()})
}
