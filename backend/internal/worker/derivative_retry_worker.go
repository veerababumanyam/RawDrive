package worker

import (
	"context"
	"log"
	"time"
)

// derivativeRetryStore is the narrow surface the worker needs from
// *repository.AssetRepo. Declared as an interface so the worker stays testable
// without a live Postgres pool.
type derivativeRetryStore interface {
	// RequeueRetryableFailedAssets resets status='error' assets below the
	// attempt cap back to 'processing' (incrementing the attempt count) so the
	// thumbnail worker re-picks them. Returns the number re-queued.
	RequeueRetryableFailedAssets(ctx context.Context, maxAttempts, limit int) (int64, error)
	// MarkExhaustedAssetsPermanentlyFailed stamps the terminal dead-letter
	// state on assets that exhausted their retries. Returns the number marked.
	MarkExhaustedAssetsPermanentlyFailed(ctx context.Context, maxAttempts int) (int64, error)
}

// DerivativeRetryWorker provides durable retry + dead-letter handling for
// assets whose WebP derivative generation failed (AREA-UPLOADER-2).
//
// The thumbnail worker generates derivatives out-of-band and, on failure,
// flips the asset to status='error' and stops. Nothing retries it, so a
// transient failure (cwebp blip, a momentary storage read error) leaves the
// asset permanently broken with no derivatives and only a one-time log line —
// a silent data-integrity gap.
//
// Each sweep this worker:
//  1. Re-queues a bounded batch of status='error' assets back to 'processing'
//     (incrementing processing_attempts), so the thumbnail worker re-attempts
//     generation. Capped at maxAttempts so a genuinely-undecodable file does
//     not loop forever.
//  2. Marks assets that have exhausted maxAttempts with failed_permanently_at —
//     an explicit terminal state the gallery UI and metrics can surface,
//     turning a silent failure into an observable one.
//
// Full synchronous derivative generation at upload time is intentionally NOT
// attempted here (out of scope); this is the retry/surface backstop.
type DerivativeRetryWorker struct {
	store        derivativeRetryStore
	maxAttempts  int
	batchSize    int
	pollInterval time.Duration
	stopCh       chan struct{}
}

// DefaultDerivativeMaxAttempts is how many times a failed asset is re-queued
// before being parked in the permanent dead-letter state.
const DefaultDerivativeMaxAttempts = 3

// NewDerivativeRetryWorker constructs the worker. Nil-safe: a nil store yields
// a worker whose sweep() is a no-op that logs a warning each tick.
func NewDerivativeRetryWorker(store derivativeRetryStore) *DerivativeRetryWorker {
	return &DerivativeRetryWorker{
		store:       store,
		maxAttempts: DefaultDerivativeMaxAttempts,
		batchSize:   50,
		// 5 min: derivative failures are rare and the thumbnail worker drains
		// re-queued rows within ~1s, so an aggressive cadence buys nothing.
		pollInterval: 5 * time.Minute,
		stopCh:       make(chan struct{}),
	}
}

// Start runs the polling loop. Runs once immediately on entry, then every
// pollInterval until ctx is cancelled or Stop is called.
func (w *DerivativeRetryWorker) Start(ctx context.Context) {
	log.Println("derivative retry worker: started (poll=5m)")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.sweep(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("derivative retry worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("derivative retry worker: stopped")
			return
		case <-ticker.C:
			w.sweep(ctx)
		}
	}
}

// Stop signals the worker to shut down.
func (w *DerivativeRetryWorker) Stop() {
	close(w.stopCh)
}

// sweep runs one retry + dead-letter pass.
func (w *DerivativeRetryWorker) sweep(ctx context.Context) {
	if w.store == nil {
		log.Println("derivative retry worker: store is nil — skipping tick")
		return
	}

	// Park exhausted rows in the dead-letter state FIRST, so a row that just
	// crossed the attempt cap is surfaced this tick rather than being re-queued
	// one final time.
	failed, err := w.store.MarkExhaustedAssetsPermanentlyFailed(ctx, w.maxAttempts)
	if err != nil {
		log.Printf("derivative retry worker: mark permanently failed: %v", err)
	} else if failed > 0 {
		// Surface the terminal failures loudly — this is the metric/alert hook
		// that turns a previously-silent broken thumbnail into an observable.
		log.Printf("derivative retry worker: DEAD-LETTER %d asset(s) permanently failed derivative generation after %d attempts", failed, w.maxAttempts)
	}

	requeued, err := w.store.RequeueRetryableFailedAssets(ctx, w.maxAttempts, w.batchSize)
	if err != nil {
		log.Printf("derivative retry worker: requeue retryable: %v", err)
		return
	}
	if requeued > 0 {
		log.Printf("derivative retry worker: re-queued %d failed asset(s) for derivative retry", requeued)
	}
}
