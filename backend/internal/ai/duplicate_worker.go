package ai

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
)

// DuplicateWorker polls for pending duplicate scan jobs and processes them.
type DuplicateWorker struct {
	jobRepo      *JobRepo
	duplicateSvc *DuplicateService
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewDuplicateWorker creates a DuplicateWorker.
func NewDuplicateWorker(jobRepo *JobRepo, duplicateSvc *DuplicateService) *DuplicateWorker {
	return &DuplicateWorker{
		jobRepo:      jobRepo,
		duplicateSvc: duplicateSvc,
		pollInterval: 15 * time.Second,
		stopCh:       make(chan struct{}),
	}
}

// Start implements worker.Worker.
func (w *DuplicateWorker) Start(ctx context.Context) {
	log.Println("duplicate worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("duplicate worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("duplicate worker: stop signal received")
			return
		case <-ticker.C:
			w.processNextBatch(ctx)
		}
	}
}

// Stop implements worker.Worker.
func (w *DuplicateWorker) Stop() {
	close(w.stopCh)
}

func (w *DuplicateWorker) processNextBatch(ctx context.Context) {
	jobs, err := w.jobRepo.ListPending(ctx, "duplicate_scan", 3)
	if err != nil {
		log.Printf("duplicate worker: list pending: %v", err)
		return
	}

	for _, job := range jobs {
		if err := w.processJob(ctx, job); err != nil {
			log.Printf("duplicate worker: job %s failed: %v", job.ID, err)
			_ = w.jobRepo.MarkFailed(ctx, job.ID, err.Error())
			continue
		}
	}
}

func (w *DuplicateWorker) processJob(ctx context.Context, job *AIJob) error {
	_ = w.jobRepo.UpdateProgress(ctx, job.ID, "running", 0)

	var galleryID *uuid.UUID
	if gidStr, ok := job.Result["gallery_id"].(string); ok {
		gid, err := uuid.Parse(gidStr)
		if err == nil {
			galleryID = &gid
		}
	}

	groups, err := w.duplicateSvc.DetectDuplicates(ctx, job.WorkspaceID, galleryID)
	if err != nil {
		return err
	}

	return w.jobRepo.MarkDone(ctx, job.ID, map[string]any{
		"groups_found": len(groups),
	})
}
