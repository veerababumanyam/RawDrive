package worker

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/storage"
)

// AssetPurgeWorker permanently removes soft-deleted assets after the retention window (30 days).
type AssetPurgeWorker struct {
	pool         *pgxpool.Pool
	store        storage.Provider
	retention    time.Duration
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewAssetPurgeWorker creates a new AssetPurgeWorker with a 30-day retention window.
func NewAssetPurgeWorker(pool *pgxpool.Pool, store storage.Provider) *AssetPurgeWorker {
	return &AssetPurgeWorker{
		pool:         pool,
		store:        store,
		retention:    30 * 24 * time.Hour,
		pollInterval: 6 * time.Hour, // check every 6 hours
		stopCh:       make(chan struct{}),
	}
}

// Start begins the purge polling loop.
func (w *AssetPurgeWorker) Start(ctx context.Context) {
	log.Println("asset purge worker: started (30-day retention)")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	// Run once on startup
	w.purge(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("asset purge worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("asset purge worker: stopped")
			return
		case <-ticker.C:
			w.purge(ctx)
		}
	}
}

// Stop signals the worker to shut down.
func (w *AssetPurgeWorker) Stop() {
	close(w.stopCh)
}

// assetPurgeClaimLease bounds how long a claimed-but-unfinished purge row stays out
// of the claimable set. A purge is a storage Delete + a few row deletes (fast), so
// the lease is short; only a row whose claim has gone stale (a crashed worker that
// claimed but never finished the storage delete) is re-claimed on a later cycle.
const assetPurgeClaimLease = 10 * time.Minute

// purgeItem is a soft-deleted asset this worker has atomically claimed for permanent
// removal.
type purgeItem struct {
	id         string
	storageKey string
}

// claimBatch atomically claims up to `limit` soft-deleted assets that are past the
// retention window, stamping claimed_at = now() inside a single
// UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING statement.
//
// This replaces the previous plain SELECT ... WHERE deleted_at < cutoff LIMIT 100
// (no row lock), which let two app nodes (.42/.44) select and process the same
// soft-deleted row — a double storage Delete + redundant cascade DELETEs. The claim
// skips rows another worker holds (FOR UPDATE SKIP LOCKED) or has claimed within
// leaseSeconds; a row whose claim lease has gone stale (a crashed worker) is
// re-claimed on a later cycle. claimed_at is shared with the thumbnail/derivative
// retry worker, but the two operate on disjoint rows — purge claims deleted_at IS NOT
// NULL, the retry worker claims status='processing' AND deleted_at IS NULL — so the
// shared column never lets one worker steal the other's rows.
func (w *AssetPurgeWorker) claimBatch(ctx context.Context, limit int, leaseSeconds float64) ([]purgeItem, error) {
	if limit <= 0 {
		limit = 100
	}
	cutoff := time.Now().Add(-w.retention)
	rows, err := w.pool.Query(ctx,
		`UPDATE assets
		    SET claimed_at = now()
		  WHERE id IN (
		      SELECT id FROM assets
		      WHERE deleted_at IS NOT NULL AND deleted_at < $1
		        AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => $3))
		      ORDER BY deleted_at ASC
		      LIMIT $2
		      FOR UPDATE SKIP LOCKED
		  )
		  RETURNING id, storage_key`,
		cutoff, limit, leaseSeconds,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []purgeItem
	for rows.Next() {
		var item purgeItem
		if err := rows.Scan(&item.id, &item.storageKey); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (w *AssetPurgeWorker) purge(ctx context.Context) {
	// Atomically claim a batch of soft-deleted assets past the retention window.
	// FOR UPDATE SKIP LOCKED guarantees concurrent purgers on different app nodes
	// claim disjoint rows, so no asset is double-deleted.
	items, err := w.claimBatch(ctx, 100, assetPurgeClaimLease.Seconds())
	if err != nil {
		log.Printf("asset purge worker: claim batch error: %v", err)
		return
	}

	if len(items) == 0 {
		return
	}

	purged := 0
	for _, item := range items {
		// Delete from storage
		if item.storageKey != "" {
			if err := w.store.Delete(ctx, item.storageKey); err != nil {
				log.Printf("asset purge worker: storage delete error for %s: %v", item.id, err)
				// Release the claim so the next cycle retries this row immediately
				// rather than waiting out the claim lease.
				w.releaseClaim(ctx, item.id)
				continue
			}
		}

		// Delete derivatives
		w.pool.Exec(ctx,
			`DELETE FROM asset_derivatives WHERE asset_id = $1`, item.id)

		// Delete gallery_assets references
		w.pool.Exec(ctx,
			`DELETE FROM gallery_assets WHERE asset_id = $1`, item.id)

		// Hard delete the asset record
		_, err := w.pool.Exec(ctx,
			`DELETE FROM assets WHERE id = $1`, item.id)
		if err != nil {
			log.Printf("asset purge worker: delete error for %s: %v", item.id, err)
			// Row survived but is claimed; release so the next cycle retries it.
			w.releaseClaim(ctx, item.id)
			continue
		}
		purged++
	}

	if purged > 0 {
		log.Printf("asset purge worker: permanently removed %d assets past 30-day retention", purged)
	}
}

// releaseClaim clears claimed_at on a row whose purge failed, so the next poll cycle
// re-claims it immediately instead of waiting out assetPurgeClaimLease. Best-effort:
// if it fails, the stale-lease path still re-claims the row after the lease expires.
func (w *AssetPurgeWorker) releaseClaim(ctx context.Context, id string) {
	if _, err := w.pool.Exec(ctx,
		`UPDATE assets SET claimed_at = NULL WHERE id = $1`, id); err != nil {
		log.Printf("asset purge worker: release claim %s: %v", id, err)
	}
}
