package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/face"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// faceDetector is the per-asset detection seam the worker depends on. The
// concrete *FaceService satisfies it; a fake satisfies it in unit tests so the
// whole-batch-outage decision logic is testable without a DB or live sidecar.
type faceDetector interface {
	DetectAndStore(ctx context.Context, assetID, workspaceID uuid.UUID, galleryID *uuid.UUID) (int, error)
}

// faceJobSink is the job-disposition seam the worker depends on for a single
// job's lifecycle writes. The concrete *JobRepo satisfies it; a fake records the
// terminal done/failed disposition in unit tests.
type faceJobSink interface {
	UpdateProgress(ctx context.Context, id uuid.UUID, status string, processed int) error
	MarkDone(ctx context.Context, id uuid.UUID, result map[string]any) error
	MarkFailed(ctx context.Context, id uuid.UUID, errMsg string) error
}

// FaceWorker polls for pending face detection jobs and processes them.
type FaceWorker struct {
	jobRepo      *JobRepo
	jobSink      faceJobSink // per-job lifecycle writes (defaults to jobRepo)
	faceSvc      faceDetector
	assetRepo    *repository.AssetRepo
	galleryRepo  *repository.GalleryRepo // optional — when nil, privacy opt-out is skipped
	store        storage.Provider
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewFaceWorker creates a FaceWorker.
func NewFaceWorker(jobRepo *JobRepo, faceSvc *FaceService, assetRepo *repository.AssetRepo, store storage.Provider) *FaceWorker {
	return &FaceWorker{
		jobRepo:      jobRepo,
		jobSink:      jobRepo,
		faceSvc:      faceSvc,
		assetRepo:    assetRepo,
		store:        store,
		pollInterval: 5 * time.Second,
		stopCh:       make(chan struct{}),
	}
}

// WithGalleryRepo wires in a gallery repo for privacy opt-out checks
// (M3 E8-S1 #6). When set, the worker skips jobs whose gallery has
// face_detection_enabled=false. Returns the worker for fluent chaining.
func (w *FaceWorker) WithGalleryRepo(galleryRepo *repository.GalleryRepo) *FaceWorker {
	w.galleryRepo = galleryRepo
	return w
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

// faceClaimLease bounds how long a claimed-but-unfinished face job stays out of
// the claimable set. Face-detection ML over a batch of assets can take a while,
// so the lease is generous; only a job stuck in 'running' past the lease (a
// crashed worker) is re-claimed.
const faceClaimLease = 10 * time.Minute

func (w *FaceWorker) processNextBatch(ctx context.Context) {
	// Atomic claim: flips pending → running + stamps claimed_at so two workers
	// never claim — and therefore never double-detect — the same job's assets.
	jobs, err := w.jobRepo.ClaimPending(ctx, "face_detection", 5, faceClaimLease.Seconds())
	if err != nil {
		log.Printf("face worker: claim pending: %v", err)
		return
	}

	sink := w.jobSink
	if sink == nil {
		sink = w.jobRepo
	}
	for _, job := range jobs {
		if err := w.processJob(ctx, job); err != nil {
			log.Printf("face worker: job %s failed: %v", job.ID, err)
			_ = sink.MarkFailed(ctx, job.ID, err.Error())
			continue
		}
	}
}

// faceProgressBatchSize bounds how often the face worker writes job progress.
// One write per asset is an N+1 on large galleries; reporting every N assets
// (and always on the final asset) keeps progress fresh without a write storm.
const faceProgressBatchSize = 10

// shouldReportFaceProgress is true every faceProgressBatchSize assets and always
// for the last asset (index == total-1), so the number of progress writes for a
// job scales as ceil(total/faceProgressBatchSize)+O(1) rather than linearly with
// total. Pure + deterministic so the batching contract is unit-testable.
func shouldReportFaceProgress(index, total int) bool {
	if index >= total-1 {
		return true
	}
	return (index+1)%faceProgressBatchSize == 0
}

func (w *FaceWorker) processJob(ctx context.Context, job *AIJob) error {
	sink := w.jobSink
	if sink == nil {
		sink = w.jobRepo
	}
	_ = sink.UpdateProgress(ctx, job.ID, "running", 0)

	// Extract asset IDs from job result
	var assetIDs []uuid.UUID
	if raw, ok := job.Result["asset_ids"]; ok {
		data, _ := json.Marshal(raw)
		_ = json.Unmarshal(data, &assetIDs)
	}

	if len(assetIDs) == 0 {
		return sink.MarkDone(ctx, job.ID, map[string]any{"processed": 0, "faces_found": 0})
	}

	var galleryID *uuid.UUID
	if gidStr, ok := job.Result["gallery_id"].(string); ok {
		gid, err := uuid.Parse(gidStr)
		if err == nil {
			galleryID = &gid
		}
	}

	// Privacy opt-out (M3 E8-S1 #6): if a gallery-scoped job targets a
	// gallery with face_detection_enabled=false, skip it entirely and mark
	// the job done with a clear reason. This runs only when galleryRepo is
	// wired; workspace-scoped jobs (no gallery_id) are unaffected.
	if galleryID != nil && w.galleryRepo != nil {
		enabled, err := w.galleryRepo.IsFaceDetectionEnabled(ctx, *galleryID)
		if err != nil {
			log.Printf("face worker: gallery %s opt-out check failed: %v", *galleryID, err)
			// Fail closed: mark the job failed so an operator can investigate.
			return sink.MarkFailed(ctx, job.ID, "gallery opt-out check failed: "+err.Error())
		}
		if !enabled {
			log.Printf("face worker: gallery %s opted out of face detection; skipping %d asset(s)",
				*galleryID, len(assetIDs))
			return sink.MarkDone(ctx, job.ID, map[string]any{
				"processed":   0,
				"faces_found": 0,
				"skipped":     len(assetIDs),
				"reason":      "gallery_face_detection_disabled",
			})
		}
	}

	totalFaces := 0
	unavailableCount := 0
	for i, assetID := range assetIDs {
		// DetectAndStore now returns the per-asset face count, so we no longer
		// issue a separate GetFacesByAsset query per asset (was an N+1).
		count, err := w.faceSvc.DetectAndStore(ctx, assetID, job.WorkspaceID, galleryID)
		if err != nil {
			log.Printf("face worker: asset %s: %v", assetID, err)
			// A sidecar-unavailable error (face-svc 503 / unreachable) is a
			// transient infra outage, not a per-asset defect like a corrupt
			// image. Tally these separately so we can distinguish a WHOLE-BATCH
			// outage (mark failed/retryable) from one bad asset (continue).
			if errors.Is(err, face.ErrServiceUnavailable) {
				unavailableCount++
			}
			// Continue processing remaining assets either way: a single decode
			// error must not abort the batch, and counting outages requires
			// probing the rest so a brief blip doesn't fail an otherwise-healthy
			// run.
		} else {
			totalFaces += count
		}
		// Batch progress writes: a 100-asset job used to issue 100 UpdateProgress
		// writes. Report every faceProgressBatchSize assets and always on the
		// last one, so progress writes scale sub-linearly with asset count.
		if shouldReportFaceProgress(i, len(assetIDs)) {
			_ = sink.UpdateProgress(ctx, job.ID, "running", i+1)
		}
	}

	// Whole-batch sidecar outage: when the sidecar was unavailable for (nearly)
	// every asset, this scan is not a real "0 faces found" result — it is a
	// transient face-svc outage. Returning an error makes processNextBatch mark
	// the job FAILED (not done), so the empty scan isn't permanently committed.
	// processNextBatch does NOT re-enqueue failed jobs (ClaimPending only claims
	// 'pending' or lease-expired 'running' rows), so this is a single bounded
	// attempt — a persistently-down sidecar fails the job once and stops rather
	// than reclaiming forever. An operator (or a re-enqueue) retries deliberately.
	if isWholeBatchOutage(unavailableCount, len(assetIDs)) {
		return fmt.Errorf("face worker: whole-batch sidecar outage: %d/%d asset(s) returned %w; marking job failed/retryable",
			unavailableCount, len(assetIDs), face.ErrServiceUnavailable)
	}

	return sink.MarkDone(ctx, job.ID, map[string]any{
		"processed":   len(assetIDs),
		"faces_found": totalFaces,
	})
}

// faceBatchOutageThreshold is the fraction of a batch's asset calls that must
// return ErrServiceUnavailable for the batch to count as a whole-sidecar outage.
// At 1.0 we require EVERY call to be unavailable, which most conservatively
// avoids failing a job for a transient blip on a minority of assets while still
// catching a real total outage. (A genuinely empty-but-healthy batch reports 0
// unavailable calls and so never trips this.)
const faceBatchOutageThreshold = 1.0

// isWholeBatchOutage reports whether a batch should be treated as a sidecar
// outage (→ job failed/retryable) rather than a completed scan. Pure +
// deterministic so the policy is unit-testable. A batch with zero assets or zero
// unavailable calls is never an outage.
func isWholeBatchOutage(unavailable, total int) bool {
	if total <= 0 || unavailable <= 0 {
		return false
	}
	return float64(unavailable) >= faceBatchOutageThreshold*float64(total)
}
