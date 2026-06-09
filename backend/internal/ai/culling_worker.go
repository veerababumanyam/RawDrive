package ai

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

type CullingFeatureGate interface {
	IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string)
}

// CullingWorker claims Smart Culling jobs and runs the gallery analysis.
type CullingWorker struct {
	jobRepo      *JobRepo
	cullingSvc   *CullingService
	featureGate  CullingFeatureGate
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewCullingWorker creates a CullingWorker.
func NewCullingWorker(jobRepo *JobRepo, cullingSvc *CullingService) *CullingWorker {
	return &CullingWorker{
		jobRepo:      jobRepo,
		cullingSvc:   cullingSvc,
		pollInterval: 15 * time.Second,
		stopCh:       make(chan struct{}),
	}
}

// WithFeatureGate wires the rollout flag used to keep partially-built culling disabled.
func (w *CullingWorker) WithFeatureGate(gate CullingFeatureGate) *CullingWorker {
	w.featureGate = gate
	return w
}

// Start implements worker.Worker.
func (w *CullingWorker) Start(ctx context.Context) {
	log.Println("culling worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("culling worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("culling worker: stop signal received")
			return
		case <-ticker.C:
			w.processNextBatch(ctx)
		}
	}
}

// Stop implements worker.Worker.
func (w *CullingWorker) Stop() {
	close(w.stopCh)
}

// cullingClaimLease bounds how long a claimed-but-unfinished culling job stays
// out of the claimable set; only a job stuck in 'running' past the lease is re-claimed.
const cullingClaimLease = 10 * time.Minute

func (w *CullingWorker) processNextBatch(ctx context.Context) {
	jobs, err := w.jobRepo.ClaimPending(ctx, "culling", 2, cullingClaimLease.Seconds())
	if err != nil {
		log.Printf("culling worker: claim pending: %v", err)
		return
	}

	for _, job := range jobs {
		if err := w.processJob(ctx, job); err != nil {
			log.Printf("culling worker: job %s failed: %v", job.ID, err)
			_ = w.jobRepo.MarkFailed(ctx, job.ID, err.Error())
		}
	}
}

func (w *CullingWorker) processJob(ctx context.Context, job *AIJob) error {
	if w.featureGate == nil {
		return fmt.Errorf("culling worker: feature disabled")
	}
	enabled, source := w.featureGate.IsEnabled(ctx, job.WorkspaceID)
	if !enabled {
		return fmt.Errorf("culling worker: feature disabled by %s", source)
	}

	if err := w.jobRepo.UpdateProgress(ctx, job.ID, "running", 0); err != nil {
		return err
	}

	galleryIDStr, ok := job.Result["gallery_id"].(string)
	if !ok {
		return ErrParseFailure
	}
	galleryID, err := uuid.Parse(galleryIDStr)
	if err != nil {
		return err
	}
	topPercent := 20
	if tp, ok := job.Result["top_percent"].(float64); ok {
		topPercent = int(tp)
	}
	if tp, ok := job.Result["top_percent"].(int); ok {
		topPercent = tp
	}

	suggestions, err := w.cullingSvc.ProcessCulling(ctx, job.WorkspaceID, galleryID, topPercent)
	if err != nil {
		return err
	}
	return w.jobRepo.MarkDone(ctx, job.ID, map[string]any{
		"gallery_id":       galleryID.String(),
		"top_percent":      topPercent,
		"suggestions":      len(suggestions),
		"processed_images": len(suggestions),
	})
}
