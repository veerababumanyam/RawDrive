package ai

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SearchWorker polls for assets needing AI tagging and processes them.
type SearchWorker struct {
	pool         *pgxpool.Pool
	searchSvc    *SearchService
	configRepo   *ConfigRepo
	pollInterval time.Duration
	batchSize    int
	stopCh       chan struct{}
}

// NewSearchWorker creates a SearchWorker.
func NewSearchWorker(pool *pgxpool.Pool, searchSvc *SearchService, configRepo *ConfigRepo) *SearchWorker {
	return &SearchWorker{
		pool:         pool,
		searchSvc:    searchSvc,
		configRepo:   configRepo,
		pollInterval: 10 * time.Second,
		batchSize:    5,
		stopCh:       make(chan struct{}),
	}
}

// Start implements worker.Worker.
func (w *SearchWorker) Start(ctx context.Context) {
	log.Println("search worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("search worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("search worker: stop signal received")
			return
		case <-ticker.C:
			w.processNextBatch(ctx)
		}
	}
}

// Stop implements worker.Worker.
func (w *SearchWorker) Stop() {
	close(w.stopCh)
}

func (w *SearchWorker) processNextBatch(ctx context.Context) {
	// Claim pending assets atomically
	rows, err := w.pool.Query(ctx,
		`UPDATE assets
		 SET ai_tag_status = 'processing', updated_at = now()
		 WHERE id IN (
		   SELECT id FROM assets
		   WHERE ai_tag_status IN ('pending', 'queued')
		     AND status = 'ready'
		     AND deleted_at IS NULL
		     AND content_type LIKE 'image/%'
		   ORDER BY created_at ASC
		   LIMIT $1
		   FOR UPDATE SKIP LOCKED
		 )
		 RETURNING id, workspace_id`, w.batchSize)
	if err != nil {
		log.Printf("search worker: claim batch: %v", err)
		return
	}
	defer rows.Close()

	type assetInfo struct {
		id          string
		workspaceID string
	}
	var batch []assetInfo
	for rows.Next() {
		var ai assetInfo
		if err := rows.Scan(&ai.id, &ai.workspaceID); err != nil {
			log.Printf("search worker: scan: %v", err)
			continue
		}
		batch = append(batch, ai)
	}

	for _, a := range batch {
		if err := w.processOne(ctx, a.id, a.workspaceID); err != nil {
			log.Printf("search worker: asset %s: %v", a.id, err)
		}
	}
}

func (w *SearchWorker) processOne(ctx context.Context, assetID, workspaceID string) error {
	aID, _ := parseUUID(assetID)
	wID, _ := parseUUID(workspaceID)

	err := w.searchSvc.AutoTag(ctx, aID, wID)
	if err != nil {
		// Rate limit: reset to pending for retry next cycle
		if strings.Contains(err.Error(), "429") || err == ErrQuotaExceeded {
			_, _ = w.pool.Exec(ctx,
				`UPDATE assets SET ai_tag_status = 'pending', updated_at = now() WHERE id = $1`, aID)
			return nil
		}
		// No API key: skip
		if err == ErrNoAPIKey {
			_, _ = w.pool.Exec(ctx,
				`UPDATE assets SET ai_tag_status = 'skipped', updated_at = now() WHERE id = $1`, aID)
			return nil
		}
		// Other error: mark failed
		_, _ = w.pool.Exec(ctx,
			`UPDATE assets SET ai_tag_status = 'error', updated_at = now() WHERE id = $1`, aID)
		return err
	}

	// Also generate embedding for semantic search
	if indexErr := w.searchSvc.IndexAsset(ctx, aID, wID); indexErr != nil {
		log.Printf("search worker: index %s failed (non-fatal): %v", assetID, indexErr)
	}

	return nil
}
