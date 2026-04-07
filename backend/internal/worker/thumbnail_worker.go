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
	pollInterval time.Duration
	stopCh       chan struct{}
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

	// Build thumbnail URL map with presigned URLs
	thumbnailURLs := make(map[string]string)
	for sizeName, key := range result.URLs {
		url, err := w.store.PresignURL(ctx, key, storage.PresignOptions{
			ExpiresInSeconds: 86400, // 24 hours
		})
		if err != nil {
			thumbnailURLs[sizeName] = key // fallback to key
		} else {
			thumbnailURLs[sizeName] = url
		}
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

	log.Printf("thumbnail worker: processed %s (%dx%d, %d thumbnails)",
		asset.ID, result.Width, result.Height, len(result.URLs))
	return nil
}

func (w *ThumbnailWorker) updateDimensions(ctx context.Context, id uuid.UUID, width, height int) {
	if err := w.assetRepo.UpdateDimensions(ctx, id, width, height); err != nil {
		log.Printf("thumbnail worker: update dimensions %s failed: %v", id, err)
	}
}
