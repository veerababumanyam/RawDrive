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

func (w *AssetPurgeWorker) purge(ctx context.Context) {
	cutoff := time.Now().Add(-w.retention)

	// Find assets past retention window
	rows, err := w.pool.Query(ctx,
		`SELECT id, storage_key FROM assets
		 WHERE deleted_at IS NOT NULL AND deleted_at < $1
		 LIMIT 100`,
		cutoff,
	)
	if err != nil {
		log.Printf("asset purge worker: query error: %v", err)
		return
	}
	defer rows.Close()

	type purgeItem struct {
		id         string
		storageKey string
	}
	var items []purgeItem
	for rows.Next() {
		var item purgeItem
		if err := rows.Scan(&item.id, &item.storageKey); err != nil {
			log.Printf("asset purge worker: scan error: %v", err)
			continue
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		log.Printf("asset purge worker: rows error: %v", err)
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
				// Continue — we'll try again next cycle
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
			continue
		}
		purged++
	}

	if purged > 0 {
		log.Printf("asset purge worker: permanently removed %d assets past 30-day retention", purged)
	}
}
