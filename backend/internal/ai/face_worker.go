package ai

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// FaceWorker polls for pending face detection jobs and processes them.
type FaceWorker struct {
	jobRepo      *JobRepo
	faceSvc      *FaceService
	assetRepo    *repository.AssetRepo
	store        storage.Provider
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewFaceWorker creates a FaceWorker.
func NewFaceWorker(jobRepo *JobRepo, faceSvc *FaceService, assetRepo *repository.AssetRepo, store storage.Provider) *FaceWorker {
	return &FaceWorker{
		jobRepo:      jobRepo,
		faceSvc:      faceSvc,
		assetRepo:    assetRepo,
		store:        store,
		pollInterval: 5 * time.Second,
		stopCh:       make(chan struct{}),
	}
}

// Start implements worker.Worker.
func (w *FaceWorker) Start(ctx context.Context) {
	log.Println("face worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("face worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("face worker: stop signal received")
			return
		case <-ticker.C:
			w.processNextBatch(ctx)
		}
	}
}

// Stop implements worker.Worker.
func (w *FaceWorker) Stop() {
	close(w.stopCh)
}

func (w *FaceWorker) processNextBatch(ctx context.Context) {
	jobs, err := w.jobRepo.ListPending(ctx, "face_detection", 5)
	if err != nil {
		log.Printf("face worker: list pending: %v", err)
		return
	}

	for _, job := range jobs {
		if err := w.processJob(ctx, job); err != nil {
			log.Printf("face worker: job %s failed: %v", job.ID, err)
			_ = w.jobRepo.MarkFailed(ctx, job.ID, err.Error())
			continue
		}
	}
}

func (w *FaceWorker) processJob(ctx context.Context, job *AIJob) error {
	_ = w.jobRepo.UpdateProgress(ctx, job.ID, "running", 0)

	// Extract asset IDs from job result
	var assetIDs []uuid.UUID
	if raw, ok := job.Result["asset_ids"]; ok {
		data, _ := json.Marshal(raw)
		_ = json.Unmarshal(data, &assetIDs)
	}

	if len(assetIDs) == 0 {
		return w.jobRepo.MarkDone(ctx, job.ID, map[string]any{"processed": 0, "faces_found": 0})
	}

	var galleryID *uuid.UUID
	if gidStr, ok := job.Result["gallery_id"].(string); ok {
		gid, err := uuid.Parse(gidStr)
		if err == nil {
			galleryID = &gid
		}
	}

	totalFaces := 0
	for i, assetID := range assetIDs {
		if err := w.faceSvc.DetectAndStore(ctx, assetID, job.WorkspaceID, galleryID); err != nil {
			log.Printf("face worker: asset %s: %v", assetID, err)
			// Continue processing remaining assets
		} else {
			faces, _ := w.faceSvc.faceRepo.GetFacesByAsset(ctx, assetID)
			totalFaces += len(faces)
		}
		_ = w.jobRepo.UpdateProgress(ctx, job.ID, "running", i+1)
	}

	return w.jobRepo.MarkDone(ctx, job.ID, map[string]any{
		"processed":   len(assetIDs),
		"faces_found": totalFaces,
	})
}
