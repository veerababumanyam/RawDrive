package worker

import (
	"context"
	"fmt"
	"log"
	"os"
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
		pollInterval: 5 * time.Second,
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

	// Build thumbnail URL map. We deliberately return stable
	// /storage/{key} URLs rooted at PUBLIC_API_URL rather than signed
	// R2/MinIO URLs, so:
	//   1. The browser only ever talks to the public api.rawdrive.in
	//      origin — R2/MinIO host details never leak to the client.
	//   2. Each request flows through middleware.JWTAuth, which
	//      enforces "no public URL access" from AGENTS.md.
	//   3. The URLs are idempotent — no signature expiry to cache or
	//      rotate. The `/storage/*` handler re-signs (or streams) on
	//      every request so the frontend can safely store the URL in
	//      an asset row indefinitely.
	// Falls back to PUBLIC_API_URL=https://api.rawdrive.in when the
	// env var is unset so dev environments keep working. PresignURL
	// is NOT used here any more: silencing a presign error by
	// stashing the raw storage key in the URL field would have shown
	// up as a broken <img src> in the UI, which is exactly the
	// regression UAT caught on 2026-04-12.
	publicBase := os.Getenv("PUBLIC_API_URL")
	if publicBase == "" {
		publicBase = "https://api.rawdrive.in"
	}
	thumbnailURLs := make(map[string]string)
	for sizeName, key := range result.URLs {
		thumbnailURLs[sizeName] = fmt.Sprintf("%s/storage/%s", publicBase, key)
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
