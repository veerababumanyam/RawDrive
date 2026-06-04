package worker

// dsr_purge_worker.go — M10 E27-S3 background processor for Data Subject
// Requests.
//
// The DSRService synchronously handles "access" requests via
// ProcessAccessRequest. Erasure and rectification are async by design:
//   - Erasure must traverse R2 objects, gallery_assets, proofing rows,
//     consent records, and the audit log redaction trail. This can take
//     minutes for large workspaces.
//   - Rectification needs human review for several fields (legal name,
//     billing address) and runs through an admin queue.
//
// This worker polls dsr_requests for status='pending' rows, dispatches
// each by request_type, and updates the row to 'processing' → 'completed'
// or 'failed'. Access requests use the existing ProcessAccessRequest
// service method (with whatever exporter the operator has wired).
// Erasure requests log the intent and mark completed — actual cascading
// deletion is gated behind a separate `DSREraseFunc` callback so the
// production wiring can plug in the destructive operation only when an
// operator approves it.

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DSRAccessFunc is the operator-supplied access-processor callback. It
// receives the request ID and must build + persist the export bundle.
// In production this is wired to (*service.DSRService).ProcessAccessRequest
// via a small adapter in main.go that discards the returned struct and
// keeps only the error — this avoids dragging the service.DSRRequest type
// across package boundaries here.
type DSRAccessFunc func(ctx context.Context, id uuid.UUID) error

// DSREraseFunc is the operator-supplied erasure callback. It receives the
// subject's email + (optional) user ID and must perform the actual data
// deletion: assets in R2, asset rows, gallery memberships, consent
// records, and audit log redaction. Returns an error to fail the
// request, or nil to mark it complete.
//
// Production deployments wire a real implementation in main.go. The
// worker logs and skips erasure rows when this callback is nil so the
// pipeline degrades gracefully without operator intervention.
type DSREraseFunc func(ctx context.Context, email string, userID *uuid.UUID) error

// DSRPurgeWorker polls dsr_requests and processes pending entries.
type DSRPurgeWorker struct {
	pool          *pgxpool.Pool
	processAccess DSRAccessFunc
	eraser        DSREraseFunc
	pollInterval  time.Duration
	stopCh        chan struct{}
}

// NewDSRPurgeWorker constructs the worker. processAccess is REQUIRED;
// eraser is optional (when nil, erasure rows are skipped with a log).
func NewDSRPurgeWorker(pool *pgxpool.Pool, processAccess DSRAccessFunc) *DSRPurgeWorker {
	return &DSRPurgeWorker{
		pool:          pool,
		processAccess: processAccess,
		pollInterval:  30 * time.Second,
		stopCh:        make(chan struct{}),
	}
}

// WithEraser wires a destructive erasure callback. Returns the receiver.
func (w *DSRPurgeWorker) WithEraser(fn DSREraseFunc) *DSRPurgeWorker {
	w.eraser = fn
	return w
}

// WithPollInterval overrides the poll cadence (used by tests).
func (w *DSRPurgeWorker) WithPollInterval(d time.Duration) *DSRPurgeWorker {
	w.pollInterval = d
	return w
}

// Start implements worker.Worker.
func (w *DSRPurgeWorker) Start(ctx context.Context) {
	log.Println("dsr purge worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Println("dsr purge worker: ctx cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("dsr purge worker: stop signal received")
			return
		case <-ticker.C:
			w.processBatch(ctx)
		}
	}
}

// Stop implements worker.Worker.
func (w *DSRPurgeWorker) Stop() {
	close(w.stopCh)
}

// dsrClaimLease bounds how long a claimed-but-unfinished DSR row stays out of
// the claimable set. Erasure can traverse large workspaces and take minutes, so
// the lease is generous; only a row stuck past the lease (a crashed worker) is
// re-claimed. Parked 'rectify' rows awaiting admin review are excluded from
// stale-reclaim entirely so the lease never re-loops them.
const dsrClaimLease = 30 * time.Minute

// claimedDSRRow is a row this worker has atomically claimed for processing.
type claimedDSRRow struct {
	ID           uuid.UUID
	SubjectEmail string
	SubjectUser  *uuid.UUID
	RequestType  string
}

// claimBatch atomically claims up to `limit` DSR rows, flipping them
// pending → processing and stamping claimed_at in a single UPDATE ... WHERE id
// IN (SELECT ... FOR UPDATE SKIP LOCKED) statement. This replaces the previous
// standalone SELECT ... FOR UPDATE SKIP LOCKED whose row locks released the
// instant the result set drained (no enclosing transaction), which let a second
// worker re-read the same still-'pending' row and double-process it (double
// erasure of a subject's data). It also re-claims rows stuck in 'processing'
// past the lease (a crashed worker) — EXCEPT 'rectify' rows, which deliberately
// park in 'processing' for admin review and must never be re-picked.
func (w *DSRPurgeWorker) claimBatch(ctx context.Context, limit int) ([]claimedDSRRow, error) {
	rows, err := w.pool.Query(ctx, `
		UPDATE dsr_requests
		SET status = 'processing', claimed_at = now()
		WHERE id IN (
			SELECT id FROM dsr_requests
			WHERE status = 'pending'
			   OR (status = 'processing'
			       AND request_type <> 'rectify'
			       AND claimed_at < now() - make_interval(secs => $1))
			ORDER BY requested_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		RETURNING id, subject_email, subject_user_id, request_type`,
		dsrClaimLease.Seconds(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var batch []claimedDSRRow
	for rows.Next() {
		var p claimedDSRRow
		if err := rows.Scan(&p.ID, &p.SubjectEmail, &p.SubjectUser, &p.RequestType); err != nil {
			return nil, err
		}
		batch = append(batch, p)
	}
	return batch, rows.Err()
}

// processBatch claims pending DSR rows and dispatches each. Failures in
// individual rows do not abort the batch.
func (w *DSRPurgeWorker) processBatch(ctx context.Context) {
	if w.pool == nil || w.processAccess == nil {
		return
	}
	batch, err := w.claimBatch(ctx, 10)
	if err != nil {
		log.Printf("dsr purge worker: claim batch: %v", err)
		return
	}

	for _, p := range batch {
		switch p.RequestType {
		case "access":
			// The row is now claimed (status='processing'); it MUST leave that
			// state or the lease would re-claim and re-export it. Mark terminal
			// on both success and failure.
			if err := w.processAccess(ctx, p.ID); err != nil {
				log.Printf("dsr purge worker: process access %s: %v", p.ID, err)
				w.markFailed(ctx, p.ID, err.Error())
			} else {
				w.markCompleted(ctx, p.ID)
				log.Printf("dsr purge worker: completed access request %s for %s", p.ID, p.SubjectEmail)
			}

		case "erasure":
			if w.eraser == nil {
				log.Printf("dsr purge worker: erasure %s skipped — no eraser configured", p.ID)
				w.markFailed(ctx, p.ID, "eraser not configured")
				continue
			}
			if err := w.eraser(ctx, p.SubjectEmail, p.SubjectUser); err != nil {
				log.Printf("dsr purge worker: erase %s: %v", p.ID, err)
				w.markFailed(ctx, p.ID, err.Error())
				continue
			}
			w.markCompleted(ctx, p.ID)
			log.Printf("dsr purge worker: erased data for %s (request %s)", p.SubjectEmail, p.ID)

		case "rectify":
			// Rectification is human-mediated. The atomic claim already moved
			// the row to 'processing'; it parks there for the admin queue and is
			// excluded from stale-reclaim (request_type <> 'rectify') so it is
			// never re-picked. We don't auto-complete: field changes need approval.
			log.Printf("dsr purge worker: rectify request %s queued for admin review", p.ID)

		default:
			log.Printf("dsr purge worker: unknown request_type %q on %s", p.RequestType, p.ID)
			w.markFailed(ctx, p.ID, "unknown request type")
		}
	}
}

func (w *DSRPurgeWorker) markCompleted(ctx context.Context, id uuid.UUID) {
	_, err := w.pool.Exec(ctx,
		`UPDATE dsr_requests SET status = 'completed', completed_at = now() WHERE id = $1`, id)
	if err != nil {
		log.Printf("dsr purge worker: mark completed %s: %v", id, err)
	}
}

func (w *DSRPurgeWorker) markFailed(ctx context.Context, id uuid.UUID, reason string) {
	_, err := w.pool.Exec(ctx,
		`UPDATE dsr_requests SET status = 'failed', failure_reason = $2 WHERE id = $1`, id, reason)
	if err != nil {
		log.Printf("dsr purge worker: mark failed %s: %v", id, err)
	}
}

// Compile-time interface check.
var _ Worker = (*DSRPurgeWorker)(nil)
