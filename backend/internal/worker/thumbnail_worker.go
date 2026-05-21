package worker

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

// FaceEnqueuer is the narrow surface the ThumbnailWorker needs from the
// FaceService to schedule per-asset detection after derivatives complete.
// Defined as an interface so the worker package stays independent of the
// ai package (avoids a worker→ai import dependency that would complicate
// the test graph).
type FaceEnqueuer interface {
	EnqueueDetection(ctx context.Context, workspaceID uuid.UUID, assetIDs []uuid.UUID, galleryID *uuid.UUID) error
}

// FaceEnqueuerFunc is the http.HandlerFunc-style adapter that lets a bare
// closure satisfy FaceEnqueuer. Used in main.go to bridge FaceService's
// (*AIJob, error) signature down to the error-only contract the worker needs.
type FaceEnqueuerFunc func(ctx context.Context, workspaceID uuid.UUID, assetIDs []uuid.UUID, galleryID *uuid.UUID) error

// EnqueueDetection satisfies FaceEnqueuer.
func (f FaceEnqueuerFunc) EnqueueDetection(ctx context.Context, workspaceID uuid.UUID, assetIDs []uuid.UUID, galleryID *uuid.UUID) error {
	return f(ctx, workspaceID, assetIDs, galleryID)
}

// ThumbnailWorker processes assets that need thumbnails generated.
type ThumbnailWorker struct {
	assetRepo     *repository.AssetRepo
	thumbnailSvc  *service.ThumbnailService
	store         storage.Provider
	publisher     Publisher    // optional — emits asset.ready events when set
	faceEnqueuer  FaceEnqueuer // optional — enqueues face_detection AIJob after ready
	derivRepo     *repository.AssetDerivativeRepo // optional — persists per-variant size into asset_derivatives
	accountingSvc *service.StorageAccounting      // optional — increments workspace_storage.derivative_bytes
	pollInterval  time.Duration
	stopCh        chan struct{}
}

// WithPublisher wires an event publisher for asset.ready notifications.
// Returns the worker for fluent chaining. When not set, the worker does
// not emit events but otherwise operates identically.
func (w *ThumbnailWorker) WithPublisher(p Publisher) *ThumbnailWorker {
	w.publisher = p
	return w
}

// WithFaceEnqueuer wires the face-detection enqueue hook. When set, every
// image asset that finishes thumbnail generation also queues a face_detection
// AIJob (consumed by ai.FaceWorker). Workspace + gallery opt-out gates run
// downstream in FaceService.DetectAndStore; failure here is logged but
// non-fatal — the asset is still marked ready.
func (w *ThumbnailWorker) WithFaceEnqueuer(e FaceEnqueuer) *ThumbnailWorker {
	w.faceEnqueuer = e
	return w
}

// WithDerivativeRepo wires the asset_derivatives table writer. Without it,
// per-variant size_bytes/width/height never make it to the DB and the
// dashboard's storage-by-type widget reports zero derivatives even when the
// WebP files exist in B2. Optional for test compatibility; production main
// must wire this.
func (w *ThumbnailWorker) WithDerivativeRepo(repo *repository.AssetDerivativeRepo) *ThumbnailWorker {
	w.derivRepo = repo
	return w
}

// WithStorageAccounting wires the workspace_storage accountant. Without it,
// derivative_bytes stays 0 forever and dashboard "total storage" only
// reflects originals. Pairs with WithDerivativeRepo — both must be wired
// for the accounting to land.
func (w *ThumbnailWorker) WithStorageAccounting(s *service.StorageAccounting) *ThumbnailWorker {
	w.accountingSvc = s
	return w
}

// NewThumbnailWorker creates a new ThumbnailWorker.
func NewThumbnailWorker(
	assetRepo *repository.AssetRepo,
	thumbnailSvc *service.ThumbnailService,
	store storage.Provider,
) *ThumbnailWorker {
	return &ThumbnailWorker{
		assetRepo:    assetRepo,
		thumbnailSvc: thumbnailSvc,
		store:        store,
		// 1s poll instead of 5s. The previous interval added 0-5s of
		// pickup latency on every fresh upload — the dominant component
		// of the user-visible "thumbnail render lag". Tightening to 1s
		// keeps the worker idle 99% of the time anyway (the SELECT is on
		// the indexed status column with status='processing'), and drops
		// the average pickup latency from ~2.5s to ~0.5s. The event-
		// driven NATS path is a separate follow-up (G4 in fix session
		// 2026-05-17); polling remains the recovery floor.
		pollInterval: 1 * time.Second,
		stopCh:       make(chan struct{}),
	}
}

// Start begins the polling loop that processes "processing" assets.
func (w *ThumbnailWorker) Start(ctx context.Context) {
	log.Println("thumbnail worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("thumbnail worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("thumbnail worker: stop signal received")
			return
		case <-ticker.C:
			w.processNextBatch(ctx)
		}
	}
}

// Stop signals the worker to stop.
func (w *ThumbnailWorker) Stop() {
	close(w.stopCh)
}

// processNextBatch finds assets with status "processing" and generates thumbnails.
func (w *ThumbnailWorker) processNextBatch(ctx context.Context) {
	assets, err := w.assetRepo.ListByStatus(ctx, "processing", 10)
	if err != nil {
		log.Printf("thumbnail worker: list error: %v", err)
		return
	}

	for _, asset := range assets {
		if err := w.processOne(ctx, &asset); err != nil {
			log.Printf("thumbnail worker: process %s failed: %v", asset.ID, err)
			_ = w.assetRepo.UpdateStatus(ctx, asset.ID, "error")
			continue
		}
	}
}

// processOne generates thumbnails for a single asset.
func (w *ThumbnailWorker) processOne(ctx context.Context, asset *repository.Asset) error {
	// Download the original file
	reader, err := w.store.Get(ctx, asset.StorageKey)
	if err != nil {
		return fmt.Errorf("download original: %w", err)
	}
	defer reader.Close()

	// Generate thumbnails
	result, err := w.thumbnailSvc.GenerateAll(ctx, asset.ID.String(), reader)
	if err != nil {
		return fmt.Errorf("generate thumbnails: %w", err)
	}

	// Persist bare storage keys (no host, no scheme). The frontend's
	// `getStorageBackedUrl()` in dashboard-ui.ts takes a bare key like
	// "thumbnails/<id>/thumb_md.jpg" and resolves it to
	// "${NEXT_PUBLIC_API_URL}/storage/thumbnails/<id>/thumb_md.jpg?token=<jwt>"
	// at render time — meaning the *browser* picks the host, not the
	// worker. Storing absolute URLs here was a long-standing footgun:
	// the previous code defaulted to PUBLIC_API_URL=https://api.rawdrive.in
	// when the env var was unset, baking a production host into local
	// dev databases. Every <img src> then short-circuited through
	// `getStorageBackedUrl`'s "absolute URL — return as-is" branch and
	// rendered as a broken cracked-image icon. Storing bare keys also
	// keeps the row environment-agnostic: dump prod data into staging,
	// the same row resolves to staging's host on render. The /storage/*
	// proxy in cmd/api/main.go owns auth + R2/MinIO fan-out.
	thumbnailURLs := make(map[string]string)
	for sizeName, key := range result.URLs {
		thumbnailURLs[sizeName] = key
	}

	// Update asset with thumbnails and dimensions
	if err := w.assetRepo.UpdateThumbnails(ctx, asset.ID, thumbnailURLs, result.Blurhash); err != nil {
		return fmt.Errorf("update thumbnails: %w", err)
	}

	// Persist per-variant metadata into asset_derivatives + update the
	// workspace_storage.derivative_bytes counter (2026-05-21). This is the
	// upload-time half of the dashboard-total-storage fix; without it the
	// WebP files exist in B2 but the accounting layer reports zero.
	//
	// Idempotency: compute (existing_total - new_total) BEFORE upserting so
	// re-runs of the same asset (worker crash recovery, re-processing on
	// status reset) produce a delta of 0 instead of double-counting. The
	// Upsert is unique on (asset_id, variant) and will UPDATE on conflict
	// so the asset_derivatives table converges regardless of run count.
	if w.derivRepo != nil && len(result.Variants) > 0 {
		var prevTotal int64
		if w.accountingSvc != nil {
			if existing, err := w.derivRepo.TotalSizeByAsset(ctx, asset.ID); err == nil {
				prevTotal = existing
			}
		}
		var newTotal int64
		for _, v := range result.Variants {
			d := &repository.AssetDerivative{
				AssetID:    asset.ID,
				Variant:    v.Variant,
				StorageKey: v.StorageKey,
				Width:      v.Width,
				Height:     v.Height,
				SizeBytes:  v.SizeBytes,
				Format:     v.Format,
			}
			if err := w.derivRepo.Upsert(ctx, d); err != nil {
				log.Printf("thumbnail worker: derivative upsert %s/%s failed (non-fatal): %v", asset.ID, v.Variant, err)
				continue
			}
			newTotal += v.SizeBytes
		}
		if w.accountingSvc != nil {
			delta := newTotal - prevTotal
			if err := w.accountingSvc.ApplyDerivativeDelta(ctx, asset.WorkspaceID, delta); err != nil {
				log.Printf("thumbnail worker: derivative-bytes delta %s ws=%s delta=%d failed (non-fatal): %v",
					asset.ID, asset.WorkspaceID, delta, err)
			}
		}
	}

	// Update dimensions if detected
	if result.Width > 0 && result.Height > 0 {
		w.updateDimensions(ctx, asset.ID, result.Width, result.Height)
	}

	// Mark as ready
	if err := w.assetRepo.UpdateStatus(ctx, asset.ID, "ready"); err != nil {
		return fmt.Errorf("update status: %w", err)
	}

	// Publish asset.ready so downstream consumers (analytics, notifications,
	// webhooks) can react. AI auto-tag/auto-index still runs via the existing
	// status-polling path in search_worker — this event is for OTHER
	// subscribers that would otherwise need their own polling logic.
	PublishAssetReady(ctx, w.publisher, asset.ID, asset.WorkspaceID)

	// Face detection enqueue (PR-2b). Fires only when the workspace has wired
	// face-svc and the asset is an image. We pass nil galleryID because the
	// thumbnail worker doesn't know which gallery (if any) the asset belongs
	// to — the asset→gallery join is set by separate handlers. FaceService
	// applies the workspace face_recognition_enabled gate when the job runs,
	// so enqueueing even for opted-out workspaces is a cheap no-op rather
	// than a bug. Failure is logged but doesn't fail the thumbnail job — the
	// asset is already marked ready and the user-visible upload flow is done.
	if w.faceEnqueuer != nil && isImageContentType(asset.ContentType) {
		if err := w.faceEnqueuer.EnqueueDetection(ctx, asset.WorkspaceID, []uuid.UUID{asset.ID}, nil); err != nil {
			log.Printf("thumbnail worker: face enqueue for %s failed (non-fatal): %v", asset.ID, err)
		}
	}

	log.Printf("thumbnail worker: processed %s (%dx%d, %d thumbnails)",
		asset.ID, result.Width, result.Height, len(result.URLs))
	return nil
}

// isImageContentType is a narrow helper so we don't add face-detection jobs
// for video/PDF/other non-image assets that arrive through the same pipeline.
// Match prefix "image/" — same predicate the search_worker uses for auto-tag.
func isImageContentType(ct string) bool {
	return len(ct) >= 6 && ct[:6] == "image/"
}

func (w *ThumbnailWorker) updateDimensions(ctx context.Context, id uuid.UUID, width, height int) {
	if err := w.assetRepo.UpdateDimensions(ctx, id, width, height); err != nil {
		log.Printf("thumbnail worker: update dimensions %s failed: %v", id, err)
	}
}
