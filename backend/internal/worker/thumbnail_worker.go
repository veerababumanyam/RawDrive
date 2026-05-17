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

// ThumbnailWorker processes assets that need thumbnails generated.
type ThumbnailWorker struct {
	assetRepo    *repository.AssetRepo
	thumbnailSvc *service.ThumbnailService
	store        storage.Provider
	publisher    Publisher // optional — emits asset.ready events when set
	pollInterval time.Duration
	stopCh       chan struct{}
}

// WithPublisher wires an event publisher for asset.ready notifications.
// Returns the worker for fluent chaining. When not set, the worker does
// not emit events but otherwise operates identically.
func (w *ThumbnailWorker) WithPublisher(p Publisher) *ThumbnailWorker {
	w.publisher = p
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

	log.Printf("thumbnail worker: processed %s (%dx%d, %d thumbnails)",
		asset.ID, result.Width, result.Height, len(result.URLs))
	return nil
}

func (w *ThumbnailWorker) updateDimensions(ctx context.Context, id uuid.UUID, width, height int) {
	if err := w.assetRepo.UpdateDimensions(ctx, id, width, height); err != nil {
		log.Printf("thumbnail worker: update dimensions %s failed: %v", id, err)
	}
}
