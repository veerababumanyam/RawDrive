package worker

import (
	"context"
	"log"
	"time"
)

// UploadCreditExpiryService is the narrow surface the worker needs from
// credit.Service. *credit.Service satisfies it directly via ExpireAbandoned.
type UploadCreditExpiryService interface {
	ExpireAbandoned(ctx context.Context, olderThan time.Duration) (int, error)
}

// UploadCreditExpiryWorker sweeps abandoned upload-credit reservations
// (AREA-UPLOADER-1).
//
// credit.Service.ExpireAbandoned refunds every reserve ledger entry older than
// a TTL that was never consumed or refunded. It existed but had ZERO production
// callers, so a dropped Consume/Refund (e.g. the tab closed after the credit
// was reserved but before finalize, or a transient Consume failure on a
// successful upload) permanently double-charged the workspace: the reserve
// entry debited the balance and nothing ever settled or restored it.
//
// This worker registers ExpireAbandoned on an interval (default hourly,
// mirroring UploadMonthlyGrantWorker) so those dangling reservations are swept
// back into the balance. It is wired only when the upload credit meter is
// enabled — when the meter is off no reserve entries are ever posted, so there
// is nothing to expire.
//
// TTL: reservations older than `ttl` (default 24h, aligned with the upload
// session TTL so a still-resumable upload is never prematurely refunded) are
// considered abandoned. ExpireAbandoned is idempotent via its expire-entry
// idempotency key (expire:{reservationID}), so re-running across overlapping
// windows or multiple pods never double-refunds.
type UploadCreditExpiryWorker struct {
	svc          UploadCreditExpiryService
	ttl          time.Duration
	pollInterval time.Duration
	stopCh       chan struct{}
}

// DefaultUploadCreditExpiryTTL is the age a reserve entry must reach before the
// sweeper treats it as abandoned. Aligned with the default upload session TTL
// (24h) so an upload that is still resumable is never refunded out from under
// the user.
const DefaultUploadCreditExpiryTTL = 24 * time.Hour

// NewUploadCreditExpiryWorker constructs the worker. Nil-safe: a nil svc yields
// a worker whose runOnce() is a no-op that logs a loud warning each tick — the
// signal that main.go wired the worker without the credit service.
func NewUploadCreditExpiryWorker(svc UploadCreditExpiryService) *UploadCreditExpiryWorker {
	return &UploadCreditExpiryWorker{
		svc:          svc,
		ttl:          DefaultUploadCreditExpiryTTL,
		pollInterval: 1 * time.Hour,
		stopCh:       make(chan struct{}),
	}
}

// Start runs the polling loop. Runs once immediately on entry, then every
// pollInterval until ctx is cancelled or Stop is called.
func (w *UploadCreditExpiryWorker) Start(ctx context.Context) {
	log.Println("upload credit expiry worker: started (poll=1h)")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.runOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("upload credit expiry worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("upload credit expiry worker: stopped")
			return
		case <-ticker.C:
			w.runOnce(ctx)
		}
	}
}

// Stop signals the worker to shut down.
func (w *UploadCreditExpiryWorker) Stop() {
	close(w.stopCh)
}

// runOnce sweeps one batch of abandoned reservations.
func (w *UploadCreditExpiryWorker) runOnce(ctx context.Context) {
	if w.svc == nil {
		log.Println("upload credit expiry worker: service is nil — skipping tick")
		return
	}
	expired, err := w.svc.ExpireAbandoned(ctx, w.ttl)
	if err != nil {
		log.Printf("upload credit expiry worker: ExpireAbandoned failed: %v", err)
		return
	}
	if expired > 0 {
		log.Printf("upload credit expiry worker: expired=%d reservations (ttl=%s)", expired, w.ttl)
	}
}
