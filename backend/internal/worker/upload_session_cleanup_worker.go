package worker

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// storageReservationReleaser is the narrow surface the cleanup worker needs to
// return leaked reserved_bytes to a workspace quota pool. *service.StorageAccounting
// satisfies it via ReleaseUploadReservation. Declared here (not imported as the
// concrete type) so the worker package does not depend on internal/service and
// tests can stub it.
//
// AREA-UPLOADER-5: ReserveUpload adds reserved_bytes at CreateSession time. The
// cleanup worker previously aborted the multipart + deleted the row but never
// released the reservation, so every abandoned session permanently eroded the
// workspace's available quota.
type storageReservationReleaser interface {
	ReleaseUploadReservation(ctx context.Context, workspaceID uuid.UUID, originalBytes int64) error
}

// assetExistenceChecker is the narrow surface the worker needs to detect a
// session that was actually finalized but whose completed_at stamp failed to
// persist (AREA-UPLOADER-6 / P2a). *repository.AssetRepo satisfies it.
type assetExistenceChecker interface {
	ExistsByStorageKey(ctx context.Context, storageKey string) (bool, error)
}

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
	accounting   storageReservationReleaser // AREA-UPLOADER-5: release leaked reserved_bytes
	assets       assetExistenceChecker      // AREA-UPLOADER-6: detect finalized-but-unstamped sessions
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

// WithStorageAccounting wires the storage-reservation releaser so the sweeper
// returns leaked reserved_bytes for each expired NON-completed session before
// deleting its row (AREA-UPLOADER-5). Without it the worker still aborts +
// deletes, but reserved_bytes is not reclaimed. Returns the same worker for
// chainable construction.
func (w *UploadSessionCleanupWorker) WithStorageAccounting(acc storageReservationReleaser) *UploadSessionCleanupWorker {
	w.accounting = acc
	return w
}

// WithAssetExistence wires the asset-existence checker so the sweeper can
// recognise a session that was actually finalized but whose completed_at stamp
// failed to persist (AREA-UPLOADER-6) and skip the abort that would corrupt the
// already-completed object. Returns the same worker for chainable construction.
func (w *UploadSessionCleanupWorker) WithAssetExistence(a assetExistenceChecker) *UploadSessionCleanupWorker {
	w.assets = a
	return w
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
	w.sweepSessions(ctx, sessions, w.repo.Delete, w.repo.MarkCompleted)
}

// sweepSessions runs the per-row cleanup logic for a batch of expired sessions.
// It is split out of sweep() so the abort/release/rescue branching can be unit-
// tested with injected delete/markCompleted callbacks instead of a live repo.
// deleteFn deletes the session row; markCompletedFn stamps completed_at on a
// finalized-but-unstamped session.
func (w *UploadSessionCleanupWorker) sweepSessions(
	ctx context.Context,
	sessions []repository.UploadSession,
	deleteFn func(ctx context.Context, tusUploadID string) error,
	markCompletedFn func(ctx context.Context, tusUploadID string) error,
) {
	mpc, hasMultipart := w.store.(storage.MultipartCapable)

	aborted := 0
	deleted := 0
	released := 0
	rescued := 0
	for _, s := range sessions {
		storageKey := deriveStorageKey(s)

		// AREA-UPLOADER-6 (P2a): a session reaches this sweep only when
		// completed_at IS NULL (ListExpired filters on it). But finalizeUpload
		// treats MarkCompleted as best-effort, so the asset row can already
		// exist while the completion stamp never persisted. Aborting such a
		// session's multipart would clobber an already-completed object. Before
		// treating the session as abandoned, re-check for a finalized asset by
		// storage_key; if one exists, stamp the session completed (so it leaves
		// the expired set) and skip the abort + reservation release entirely —
		// the storage was already committed to used_bytes at finalize.
		if w.assets != nil {
			exists, err := w.assets.ExistsByStorageKey(ctx, storageKey)
			if err != nil {
				log.Printf("upload session cleanup worker: asset existence check %s (key=%s): %v", s.TUSUploadID, storageKey, err)
				// Fail safe: leave the row for the next sweep rather than
				// risk aborting a finalized object on a transient check error.
				continue
			}
			if exists {
				if markCompletedFn != nil {
					if err := markCompletedFn(ctx, s.TUSUploadID); err != nil {
						log.Printf("upload session cleanup worker: mark completed (finalized-but-unstamped) %s: %v", s.TUSUploadID, err)
						continue
					}
				}
				rescued++
				continue
			}
		}

		// Genuinely abandoned: abort the multipart (if any + supported).
		if hasMultipart && s.R2MultipartUploadID != nil && *s.R2MultipartUploadID != "" {
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

		// AREA-UPLOADER-5 (P1a): release the storage reservation BEFORE
		// deleting the row, so the leaked reserved_bytes is returned to the
		// workspace quota pool. ReserveUpload added it at CreateSession; nothing
		// else releases it for an abandoned (never-finalized) session. A
		// release failure leaves the row in place so the next sweep retries —
		// we must not delete the only record of the reservation while the
		// release is still owed.
		if w.accounting != nil && s.TotalSize > 0 {
			if err := w.accounting.ReleaseUploadReservation(ctx, s.WorkspaceID, s.TotalSize); err != nil {
				log.Printf("upload session cleanup worker: release reservation %s ws=%s bytes=%d: %v",
					s.TUSUploadID, s.WorkspaceID, s.TotalSize, err)
				continue
			}
			released++
		}

		if err := deleteFn(ctx, s.TUSUploadID); err != nil {
			log.Printf("upload session cleanup worker: delete %s: %v", s.TUSUploadID, err)
			continue
		}
		deleted++
	}
	log.Printf("upload session cleanup worker: sweep complete (aborted=%d, released=%d, rescued=%d, deleted=%d, batch=%d)",
		aborted, released, rescued, deleted, len(sessions))
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
