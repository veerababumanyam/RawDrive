package worker

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// UploadSessionCleanupWorker sweeps expired chunked-upload sessions and
// releases the R2 multipart state they're holding.
//
// F-013 (M17 audit followup — S-011): the direct-R2 TUS path creates an
// R2 multipart upload at CreateSession time. R2 bills for incomplete
// multipart parts until they're either completed or explicitly aborted.
// Without this sweeper, every abandoned upload (user closes the tab,
// network dies mid-upload, client crashes) accumulates a live multipart
// state in R2 indefinitely — a slow billing leak plus a DB row leak on
// the upload_sessions table.
//
// The sweeper runs every pollInterval (default 15 min), fetches expired
// sessions via the repo's ListExpired, aborts each session's R2
// multipart upload, then deletes the DB row. Errors on individual
// sessions are logged and skipped so a single bad row doesn't block the
// rest of the batch.
type UploadSessionCleanupWorker struct {
	repo         *repository.UploadSessionsRepo
	store        storage.Provider
	batchSize    int
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewUploadSessionCleanupWorker constructs the worker. A nil store is
// tolerated (Start becomes a no-op with a warning) so local dev without
// R2 credentials doesn't crash; in production the storage provider is
// always non-nil.
func NewUploadSessionCleanupWorker(
	repo *repository.UploadSessionsRepo,
	store storage.Provider,
) *UploadSessionCleanupWorker {
	return &UploadSessionCleanupWorker{
		repo:         repo,
		store:        store,
		batchSize:    100,
		pollInterval: 15 * time.Minute,
		stopCh:       make(chan struct{}),
	}
}

// Start runs the polling loop. Returns when ctx is cancelled or Stop is
// called. Safe to run in a goroutine.
func (w *UploadSessionCleanupWorker) Start(ctx context.Context) {
	if w.repo == nil {
		log.Println("upload session cleanup worker: repo is nil, worker disabled")
		return
	}
	log.Println("upload session cleanup worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	// Run once on startup so anything left over from a previous process
	// gets reaped immediately instead of waiting for the first tick.
	w.sweep(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("upload session cleanup worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("upload session cleanup worker: stop signal received")
			return
		case <-ticker.C:
			w.sweep(ctx)
		}
	}
}

// Stop signals the worker to exit its polling loop on the next iteration.
func (w *UploadSessionCleanupWorker) Stop() {
	close(w.stopCh)
}

// sweep fetches one batch of expired sessions, aborts their R2 multipart
// uploads, and deletes the DB rows. Per-row errors are logged and
// skipped so a single bad row does not block the rest of the batch.
func (w *UploadSessionCleanupWorker) sweep(ctx context.Context) {
	sessions, err := w.repo.ListExpired(ctx, w.batchSize)
	if err != nil {
		log.Printf("upload session cleanup worker: list expired: %v", err)
		return
	}
	if len(sessions) == 0 {
		return
	}

	mpc, hasMultipart := w.store.(storage.MultipartCapable)
	if !hasMultipart {
		// Storage backend does not support multipart (test fakes, etc.).
		// We can still delete the DB rows — there is nothing to abort on
		// the storage side.
		for _, s := range sessions {
			if err := w.repo.Delete(ctx, s.TUSUploadID); err != nil {
				log.Printf("upload session cleanup worker: delete %s: %v", s.TUSUploadID, err)
			}
		}
		log.Printf("upload session cleanup worker: swept %d rows (storage backend not multipart-capable)", len(sessions))
		return
	}

	aborted := 0
	deleted := 0
	for _, s := range sessions {
		storageKey := deriveStorageKey(s)
		if s.R2MultipartUploadID != nil && *s.R2MultipartUploadID != "" {
			if err := mpc.AbortMultipartUpload(ctx, storageKey, *s.R2MultipartUploadID); err != nil {
				// Log and continue. An already-aborted or already-
				// completed upload returns a benign error from R2; a real
				// failure leaves the DB row in place so the next sweep
				// will retry it.
				log.Printf("upload session cleanup worker: abort %s (key=%s): %v", s.TUSUploadID, storageKey, err)
				continue
			}
			aborted++
		}
		if err := w.repo.Delete(ctx, s.TUSUploadID); err != nil {
			log.Printf("upload session cleanup worker: delete %s: %v", s.TUSUploadID, err)
			continue
		}
		deleted++
	}
	log.Printf("upload session cleanup worker: sweep complete (aborted=%d, deleted=%d, batch=%d)", aborted, deleted, len(sessions))
}

// deriveStorageKey mirrors the key-building logic in
// chunked_upload.CreateSession so the sweeper can identify the R2 object
// the session is tied to. The key format is
// "{workspace_id}/{tus_upload_id}/original{ext}" where ext is taken from
// the filename first, falling back to the content type.
func deriveStorageKey(s repository.UploadSession) string {
	ext := filepath.Ext(s.Filename)
	if ext == "" && s.ContentType != "" {
		parts := strings.Split(s.ContentType, "/")
		if len(parts) == 2 {
			ext = "." + parts[1]
		}
	}
	return fmt.Sprintf("%s/%s/original%s", s.WorkspaceID.String(), s.TUSUploadID, ext)
}
