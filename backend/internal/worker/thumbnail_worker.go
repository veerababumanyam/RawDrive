package worker

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"strings"
	"sync"
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

type assetRepository interface {
	ListByStatus(ctx context.Context, status string, limit int) ([]repository.Asset, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status string) error
	UpdateProcessingError(ctx context.Context, id uuid.UUID, errMsg string) error
	UpdateThumbnails(ctx context.Context, id uuid.UUID, thumbnails map[string]string, blurhash string) error
	UpdateDimensions(ctx context.Context, id uuid.UUID, width, height int) error
}

// retryableAssetRepository is the optional, additive surface the worker uses for
// the transient/terminal decode-retry loop. It is a SEPARATE interface from
// assetRepository so the existing constructor and existing fakes (which do not
// implement these methods) keep compiling unchanged; the worker only exercises
// this path when the underlying repo also satisfies this interface (checked via
// a type assertion at construction). *repository.AssetRepo satisfies both.
type retryableAssetRepository interface {
	ListRetryable(ctx context.Context, limit int) ([]repository.Asset, error)
	GetRetryCount(ctx context.Context, id uuid.UUID) (int, error)
	MarkTransientFailure(ctx context.Context, id uuid.UUID, reason string) error
	MarkTerminalFailure(ctx context.Context, id uuid.UUID, reason string) error
}

type thumbnailGenerator interface {
	GenerateAll(ctx context.Context, assetID string, src io.Reader) (*service.ThumbnailResult, error)
}

// formatAwareGenerator is the optional decode-format-aware surface. When the
// wired ThumbnailService implements it (it does), the worker threads the
// server-sniffed decode_format token so the CompositeDecoder dispatches on the
// SERVER token, never the client content_type. Older/fake generators that only
// implement thumbnailGenerator fall back to the legacy GenerateAll path.
type formatAwareGenerator interface {
	GenerateAllWithFormat(ctx context.Context, assetID, format string, src io.Reader) (*service.ThumbnailResult, error)
}

// decodeFailure marks an error that originated from the image-decode step (vs a
// storage download, DB write, or other infrastructure failure). Only decode
// failures flow through the transient/terminal classify-and-retry machinery;
// every OTHER processOne error keeps main's existing UpdateProcessingError +
// status='error' path so behavior for non-decode faults is unchanged.
type decodeFailure struct{ err error }

func (d *decodeFailure) Error() string { return d.err.Error() }
func (d *decodeFailure) Unwrap() error { return d.err }

// exifExtractor consumes the already-downloaded original bytes rather than a
// storage key, so the worker never triggers a second full-file fetch for EXIF
// (PERF-10). The production *service.ExifService satisfies this via
// ExtractFromBytes while keeping ExtractAndStore for other callers.
type exifExtractor interface {
	ExtractFromBytes(ctx context.Context, assetID uuid.UUID, data []byte) error
}

// ThumbnailWorker processes assets that need thumbnails generated.
type ThumbnailWorker struct {
	assetRepo assetRepository
	// retryRepo is non-nil only when assetRepo also satisfies
	// retryableAssetRepository (the production *repository.AssetRepo does). When
	// set, the worker polls ListRetryable in addition to ListByStatus and routes
	// decode failures through the transient/terminal classify-and-retry loop.
	// When nil (e.g. unit-test fakes), the worker behaves exactly as main did.
	retryRepo         retryableAssetRepository
	thumbnailSvc      thumbnailGenerator
	store             storage.Provider
	exifSvc           exifExtractor
	publisher         Publisher                       // optional — emits asset.ready events when set
	faceEnqueuer      FaceEnqueuer                    // optional — enqueues face_detection AIJob after ready
	derivRepo         *repository.AssetDerivativeRepo // optional — persists per-variant size into asset_derivatives
	accountingSvc     *service.StorageAccounting      // optional — increments workspace_storage.derivative_bytes
	encryptionEnabled bool
	encryptionAlgo    string
	encryptionVersion int
	pollInterval      time.Duration
	stopCh            chan struct{}
	stopOnce          sync.Once
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

// WithExifService wires EXIF extraction into the live thumbnail pipeline.
func (w *ThumbnailWorker) WithExifService(s exifExtractor) *ThumbnailWorker {
	w.exifSvc = s
	return w
}

func (w *ThumbnailWorker) WithEncryptionMetadata(enabled bool, algo string, version int) *ThumbnailWorker {
	w.encryptionEnabled = enabled
	w.encryptionAlgo = algo
	w.encryptionVersion = version
	return w
}

// NewThumbnailWorker creates a new ThumbnailWorker.
func NewThumbnailWorker(
	assetRepo assetRepository,
	thumbnailSvc thumbnailGenerator,
	store storage.Provider,
) *ThumbnailWorker {
	w := &ThumbnailWorker{
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
	// Opt into the retry/backoff loop only when the underlying repo supports it.
	// Production wires *repository.AssetRepo (satisfies both interfaces); unit-
	// test fakes that implement only assetRepository keep the legacy behavior.
	if rr, ok := assetRepo.(retryableAssetRepository); ok {
		w.retryRepo = rr
	}
	return w
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

// Stop signals the worker to stop. Idempotent: a second or concurrent
// call is a no-op rather than panicking with "close of closed channel".
// During graceful shutdown both context cancellation and an explicit
// StopAll() can fire, so sync.Once serializes the close operation and keeps
// teardown from crashing the process.
func (w *ThumbnailWorker) Stop() {
	if w.stopCh == nil {
		return
	}
	w.stopOnce.Do(func() {
		close(w.stopCh)
	})
}

// processNextBatch finds assets that need derivative processing and runs them.
//
// Poll source:
//   - When the repo supports the retry surface (production *repository.AssetRepo),
//     the batch is drawn from ListRetryable. That folds the never-attempted
//     'processing' set (fresh uploads) AND the backoff-aware retry set (assets a
//     prior tick failed transiently and rescheduled) into one query, so a
//     transiently-failed HEIC/RAW asset is automatically re-attempted once its
//     backoff elapses — without re-picking it before. This is purely additive to
//     main's NATS-trigger / status-poll model: the same 'processing' rows are
//     still picked up on the very next tick (next_retry_at IS NULL for fresh
//     uploads), so the existing upload→thumbnail latency is unchanged.
//   - Without the retry surface (unit-test fakes), it falls back to main's
//     ListByStatus("processing") exactly as before.
//
// Failure routing:
//   - A DECODE failure (wrapped as *decodeFailure) goes through classifyAndRecord,
//     which schedules a transient retry with backoff or dead-letters a terminal
//     poison message — but only when the retry surface is wired.
//   - Every OTHER failure (storage download, DB write, etc.) keeps main's exact
//     UpdateProcessingError + status='error' path, so non-decode behavior is
//     unchanged.
func (w *ThumbnailWorker) processNextBatch(ctx context.Context) {
	var (
		assets []repository.Asset
		err    error
	)
	if w.retryRepo != nil {
		assets, err = w.retryRepo.ListRetryable(ctx, 10)
	} else {
		assets, err = w.assetRepo.ListByStatus(ctx, "processing", 10)
	}
	if err != nil {
		log.Printf("thumbnail worker: list error: %v", err)
		return
	}

	for i := range assets {
		asset := assets[i]
		if err := w.processOne(ctx, &asset); err != nil {
			log.Printf("thumbnail worker: process %s failed: %v", asset.ID, err)
			w.recordFailure(ctx, &asset, err)
			continue
		}
	}
}

// recordFailure dispatches a processOne error to the right persistence path.
// Decode failures (with the retry surface wired) get the transient/terminal
// classify-and-retry treatment; everything else — and the no-retry-surface
// case — keeps main's UpdateProcessingError + status='error' behavior.
func (w *ThumbnailWorker) recordFailure(ctx context.Context, asset *repository.Asset, err error) {
	var df *decodeFailure
	if w.retryRepo != nil && errors.As(err, &df) {
		w.classifyAndRecord(ctx, asset, err)
		return
	}
	_ = w.assetRepo.UpdateProcessingError(ctx, asset.ID, err.Error())
	_ = w.assetRepo.UpdateStatus(ctx, asset.ID, "error")
}

// classifyAndRecord turns a decode failure into the right retry/failure state
// transition. It classifies err via service.ClassifyDecodeError (the single
// source of transient-vs-terminal truth, which honors an explicit
// *service.DecodeError bubbled up from the decoder). Transient failures within
// the retry budget reschedule with bounded exponential backoff and increment
// retry_count (status stays 'processing'). Terminal failures — and any failure
// once the asset has reached MaxDecodeRetries — dead-letter the asset to
// 'failed' with the reason recorded, so the poller stops re-picking it.
func (w *ThumbnailWorker) classifyAndRecord(ctx context.Context, asset *repository.Asset, err error) {
	reason := err.Error()
	de := service.ClassifyDecodeError(err)

	// Read the committed retry_count rather than trusting asset.RetryCount: the
	// dead-letter decision must be authoritative. ListRetryable populates the
	// in-memory value, so this is one cheap extra round-trip only on the failure
	// path. On read error, fall back to the in-memory value so we still make a
	// bounded decision rather than looping.
	retryCount := asset.RetryCount
	if live, rcErr := w.retryRepo.GetRetryCount(ctx, asset.ID); rcErr == nil {
		retryCount = live
	} else {
		log.Printf("thumbnail worker: read retry_count for %s failed (using in-memory %d): %v",
			asset.ID, retryCount, rcErr)
	}

	// Exhausted budget OR a terminal (poison-message) failure → dead-letter.
	exhausted := retryCount >= repository.MaxDecodeRetries
	terminal := de == nil || !de.Transient
	if exhausted || terminal {
		if markErr := w.retryRepo.MarkTerminalFailure(ctx, asset.ID, reason); markErr != nil {
			log.Printf("thumbnail worker: mark terminal %s failed: %v", asset.ID, markErr)
		}
		return
	}

	// Transient + within budget → reschedule with backoff, keep processing.
	if markErr := w.retryRepo.MarkTransientFailure(ctx, asset.ID, reason); markErr != nil {
		log.Printf("thumbnail worker: mark transient %s failed: %v", asset.ID, markErr)
	}
}

// processOne generates thumbnails for a single asset.
func (w *ThumbnailWorker) processOne(ctx context.Context, asset *repository.Asset) error {
	if shouldSkipDerivativeProcessing(asset.ContentType) {
		if err := w.assetRepo.UpdateStatus(ctx, asset.ID, "ready"); err != nil {
			return fmt.Errorf("mark non-image ready: %w", err)
		}
		PublishAssetReady(ctx, w.publisher, asset.ID, asset.WorkspaceID)
		log.Printf("thumbnail worker: skipped non-image asset %s content_type=%q", asset.ID, asset.ContentType)
		return nil
	}

	// Download the original file ONCE and buffer it, then reuse the same bytes
	// for both derivative generation and EXIF extraction (PERF-10). Previously
	// the original was fetched twice — here for derivatives and again inside
	// exifSvc.ExtractAndStore — doubling B2 egress and full-file reads on every
	// upload. The decoder buffers the full image internally anyway, and EXIF
	// lives in the original's metadata, so a single in-memory copy serves both.
	reader, err := w.store.Get(ctx, asset.StorageKey)
	if err != nil {
		return fmt.Errorf("download original: %w", err)
	}
	original, err := io.ReadAll(reader)
	reader.Close()
	if err != nil {
		return fmt.Errorf("read original: %w", err)
	}

	// Generate thumbnails. Thread the server-sniffed decode_format token
	// (populated by SniffImageFormat at upload finalize, hydrated by
	// ListRetryable) so the wired CompositeDecoder dispatches on the SERVER
	// token — never the client content_type. When the token is empty (legacy
	// rows, or ListByStatus-fetched rows that don't hydrate it) the service
	// sniffs from the fetched bytes itself, and with no decoder wired the token
	// is ignored entirely (legacy imageops.Decode path). A decode failure is
	// wrapped as *decodeFailure so processNextBatch routes it through the
	// transient/terminal retry loop; non-decode failures keep main's path.
	format := ""
	if asset.DecodeFormat != nil {
		format = *asset.DecodeFormat
	}
	result, err := w.generateAll(ctx, asset.ID.String(), format, bytes.NewReader(original))
	if err != nil {
		return &decodeFailure{err: fmt.Errorf("generate thumbnails: %w", err)}
	}

	// Persist bare storage keys (no host, no scheme). The frontend's
	// `getStorageBackedUrl()` in dashboard-ui.ts takes a bare key like
	// "thumbnails/<id>/thumb_md.jpg" and resolves it to
	// "${NEXT_PUBLIC_API_URL}/storage/thumbnails/<id>/thumb_md.jpg"
	// at render time; auth rides on cookies/headers, and the *browser*
	// picks the host, not the worker. Storing absolute URLs here was a long-standing footgun:
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
				AssetID:           asset.ID,
				Variant:           v.Variant,
				StorageKey:        v.StorageKey,
				Width:             v.Width,
				Height:            v.Height,
				SizeBytes:         v.SizeBytes,
				Format:            v.Format,
				IsEncrypted:       w.encryptionEnabled,
				EncryptionVersion: w.encryptionVersion,
			}
			if w.encryptionAlgo != "" {
				d.EncryptionAlgo = &w.encryptionAlgo
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

	if w.exifSvc != nil {
		if err := w.exifSvc.ExtractFromBytes(ctx, asset.ID, original); err != nil {
			log.Printf("thumbnail worker: exif extraction %s failed (non-fatal): %v", asset.ID, err)
		}
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

// generateAll runs derivative generation, preferring the format-aware entry
// point when the wired generator supports it (production ThumbnailService) so
// the server-sniffed decode_format token reaches the CompositeDecoder. Falls
// back to the legacy GenerateAll for generators that implement only the older
// interface (unit-test fakes), preserving main's behavior there.
func (w *ThumbnailWorker) generateAll(ctx context.Context, assetID, format string, src io.Reader) (*service.ThumbnailResult, error) {
	if fa, ok := w.thumbnailSvc.(formatAwareGenerator); ok {
		return fa.GenerateAllWithFormat(ctx, assetID, format, src)
	}
	return w.thumbnailSvc.GenerateAll(ctx, assetID, src)
}

// isImageContentType is a narrow helper so we don't add face-detection jobs
// for video/PDF/other non-image assets that arrive through the same pipeline.
// Match prefix "image/" — same predicate the search_worker uses for auto-tag.
func isImageContentType(ct string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(ct)), "image/")
}

// shouldSkipDerivativeProcessing returns true for known non-image assets. Empty
// or unknown content types keep the old decode path, preserving derivatives for
// image uploads whose browser did not supply a MIME type.
func shouldSkipDerivativeProcessing(ct string) bool {
	normalized := strings.ToLower(strings.TrimSpace(ct))
	return normalized != "" && !strings.HasPrefix(normalized, "image/")
}

func (w *ThumbnailWorker) updateDimensions(ctx context.Context, id uuid.UUID, width, height int) {
	if err := w.assetRepo.UpdateDimensions(ctx, id, width, height); err != nil {
		log.Printf("thumbnail worker: update dimensions %s failed: %v", id, err)
	}
}
