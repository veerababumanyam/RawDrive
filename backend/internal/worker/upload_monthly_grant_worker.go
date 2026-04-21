package worker

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/upload/credit"
)

// UploadMonthlyGrantService is the narrow surface the worker needs from
// credit.Service. *credit.Service satisfies this directly.
type UploadMonthlyGrantService interface {
	GrantMonthly(ctx context.Context, in credit.GrantMonthlyInput) (*credit.GrantMonthlyResult, error)
}

// UploadMonthlyGrantWorker grants per-plan monthly upload credits (FR-UCRT-04).
//
// The worker iterates every non-enterprise workspace once per run and calls
// credit.Service.GrantMonthly with an anchor date set to the first of the
// current month. GrantMonthly uses a deterministic idempotency key of the
// form `monthly:{workspace}:{YYYY-MM}`, so multiple runs within the same
// month collapse onto a single ledger entry per workspace via the partial
// unique index on upload_ledger_entries(workspace_id, idempotency_key).
//
// Scheduling: polls every `pollInterval` (default 1 hour). That cadence is
// intentionally wider than the per-month granularity — hourly polling lets
// a workspace created on the 28th receive this month's grant within the
// hour rather than waiting for the next calendar month. The idempotency
// guard keeps the cadence safe; no worst-case damage if the worker fires
// 720 times per month per workspace.
//
// Opt-in: wire this worker only when UPLOAD_CREDIT_MONTHLY_GRANT_ENABLED=true
// in env. Without the flag, main.go never registers it so the per-plan
// allowance stays undelivered until stakeholder sign-off.
type UploadMonthlyGrantWorker struct {
	pool         *pgxpool.Pool
	svc          UploadMonthlyGrantService
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewUploadMonthlyGrantWorker constructs a worker wired to the canonical
// upload/credit.Service. Nil-safe: passing a nil svc yields a worker whose
// runOnce() is a no-op and logs a loud warning on each tick — that's the
// signal the operator forgot to set the feature flag in main.go.
func NewUploadMonthlyGrantWorker(pool *pgxpool.Pool, svc UploadMonthlyGrantService) *UploadMonthlyGrantWorker {
	return &UploadMonthlyGrantWorker{
		pool:         pool,
		svc:          svc,
		pollInterval: 1 * time.Hour,
		stopCh:       make(chan struct{}),
	}
}

// Start begins the monthly-grant polling loop. Runs once immediately on
// entry (so a fresh deploy catches up on the current month within seconds),
// then every pollInterval until ctx is cancelled or Stop is called.
func (w *UploadMonthlyGrantWorker) Start(ctx context.Context) {
	log.Println("upload monthly grant worker: started (poll=1h)")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.runOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("upload monthly grant worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("upload monthly grant worker: stopped")
			return
		case <-ticker.C:
			w.runOnce(ctx)
		}
	}
}

// Stop signals the worker to shut down.
func (w *UploadMonthlyGrantWorker) Stop() {
	close(w.stopCh)
}

// runOnce processes every eligible workspace for the current calendar month.
// Enterprise plans are filtered at the SQL layer (they consume via
// unlimited_passthrough, not monthly grants). GrantMonthly's idempotency
// guarantee is the only thing standing between 24×30 worker ticks and a
// double-grant bug — we rely on the DB unique index, not a worker-side
// cache, so the property survives restarts and multi-pod deploys.
func (w *UploadMonthlyGrantWorker) runOnce(ctx context.Context) {
	if w.pool == nil || w.svc == nil {
		log.Println("upload monthly grant worker: pool or service is nil — skipping tick")
		return
	}

	anchor := firstOfMonth(time.Now().UTC())

	rows, err := w.pool.Query(ctx, `
		SELECT id, COALESCE(plan_tier, 'standard')
		  FROM workspaces
		 WHERE plan_tier IS DISTINCT FROM 'enterprise'
		   AND status = 'active'
	`)
	if err != nil {
		log.Printf("upload monthly grant worker: workspace query error: %v", err)
		return
	}
	defer rows.Close()

	var granted, replayed, skipped, failed int
	for rows.Next() {
		var wsID uuid.UUID
		var planTier string
		if err := rows.Scan(&wsID, &planTier); err != nil {
			log.Printf("upload monthly grant worker: scan error: %v", err)
			failed++
			continue
		}
		result, err := w.svc.GrantMonthly(ctx, credit.GrantMonthlyInput{
			WorkspaceID: wsID,
			PlanTier:    planTier,
			AnchorDate:  anchor,
		})
		if err != nil {
			log.Printf("upload monthly grant worker: GrantMonthly failed for %s (plan=%s): %v", wsID, planTier, err)
			failed++
			continue
		}
		switch result.Status {
		case credit.GrantGranted:
			granted++
		case credit.GrantSkippedReplay:
			replayed++
		default:
			// Skipped-enterprise is filtered out at the SQL layer; any
			// other skip reason (unknown plan tier) falls into this
			// bucket and gets a per-row DEBUG in the service log.
			skipped++
		}
	}
	if err := rows.Err(); err != nil {
		log.Printf("upload monthly grant worker: iteration error: %v", err)
	}

	if granted+replayed+skipped+failed > 0 {
		log.Printf("upload monthly grant worker: month=%s granted=%d replayed=%d skipped=%d failed=%d",
			anchor.Format("2006-01"), granted, replayed, skipped, failed)
	}
}

// firstOfMonth returns the first day of the calendar month at 00:00 UTC.
// The service derives the `monthly:{ws}:{YYYY-MM}` idempotency key from
// anchor.Year() + anchor.Month(), so the day-of-month doesn't matter for
// collision — we pin it to the first for readability when the key appears
// in logs or audit trails.
func firstOfMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}
