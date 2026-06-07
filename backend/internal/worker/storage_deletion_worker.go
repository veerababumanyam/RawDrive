package worker

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/storage"
)

const storageDeletionClaimLease = 10 * time.Minute

type storageDeletionItem struct {
	id         uuid.UUID
	storageKey string
	attempts   int
}

// StorageDeletionWorker retries object deletes captured before asset rows are
// hard-deleted. It is the durable backstop for request-time B2 delete failures.
type StorageDeletionWorker struct {
	pool         *pgxpool.Pool
	store        storage.Provider
	pollInterval time.Duration
	stopCh       chan struct{}
	stopOnce     sync.Once
}

func NewStorageDeletionWorker(pool *pgxpool.Pool, store storage.Provider) *StorageDeletionWorker {
	return &StorageDeletionWorker{
		pool:         pool,
		store:        store,
		pollInterval: 5 * time.Minute,
		stopCh:       make(chan struct{}),
	}
}

func (w *StorageDeletionWorker) Start(ctx context.Context) {
	if w.pool == nil || w.store == nil {
		log.Println("storage deletion worker: disabled (pool/store missing)")
		return
	}
	log.Println("storage deletion worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.processBatch(ctx)
	for {
		select {
		case <-ctx.Done():
			log.Println("storage deletion worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("storage deletion worker: stopped")
			return
		case <-ticker.C:
			w.processBatch(ctx)
		}
	}
}

func (w *StorageDeletionWorker) Stop() {
	if w.stopCh == nil {
		return
	}
	w.stopOnce.Do(func() {
		close(w.stopCh)
	})
}

func (w *StorageDeletionWorker) claimBatch(ctx context.Context, limit int) ([]storageDeletionItem, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := w.pool.Query(ctx,
		`UPDATE storage_deletion_jobs
		    SET status = 'processing',
		        claimed_at = now(),
		        updated_at = now()
		  WHERE id IN (
		      SELECT id
		        FROM storage_deletion_jobs
		       WHERE (
		              status IN ('pending', 'failed')
		              AND next_attempt_at <= now()
		             )
		          OR (
		              status = 'processing'
		              AND claimed_at < now() - make_interval(secs => $2)
		             )
		       ORDER BY next_attempt_at ASC, created_at ASC
		       LIMIT $1
		       FOR UPDATE SKIP LOCKED
		  )
		  RETURNING id, storage_key, attempts`,
		limit, storageDeletionClaimLease.Seconds(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []storageDeletionItem
	for rows.Next() {
		var item storageDeletionItem
		if err := rows.Scan(&item.id, &item.storageKey, &item.attempts); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (w *StorageDeletionWorker) processBatch(ctx context.Context) {
	items, err := w.claimBatch(ctx, 100)
	if err != nil {
		log.Printf("storage deletion worker: claim batch: %v", err)
		return
	}
	for _, item := range items {
		if err := w.store.Delete(ctx, item.storageKey); err != nil {
			log.Printf("storage deletion worker: delete %q: %v", item.storageKey, err)
			w.markFailed(ctx, item, err.Error())
			continue
		}
		w.markDeleted(ctx, item.id)
	}
}

func (w *StorageDeletionWorker) markDeleted(ctx context.Context, id uuid.UUID) {
	if _, err := w.pool.Exec(ctx,
		`UPDATE storage_deletion_jobs
		    SET status = 'deleted',
		        deleted_at = COALESCE(deleted_at, now()),
		        claimed_at = NULL,
		        last_error = NULL,
		        updated_at = now()
		  WHERE id = $1`, id); err != nil {
		log.Printf("storage deletion worker: mark deleted %s: %v", id, err)
	}
}

func (w *StorageDeletionWorker) markFailed(ctx context.Context, item storageDeletionItem, cause string) {
	next := time.Now().Add(storageDeletionBackoff(item.attempts))
	if _, err := w.pool.Exec(ctx,
		`UPDATE storage_deletion_jobs
		    SET status = 'failed',
		        attempts = attempts + 1,
		        claimed_at = NULL,
		        next_attempt_at = $2,
		        last_error = $3,
		        updated_at = now()
		  WHERE id = $1`, item.id, next, cause); err != nil {
		log.Printf("storage deletion worker: mark failed %s: %v", item.id, err)
	}
}

func storageDeletionBackoff(attempts int) time.Duration {
	if attempts < 0 {
		attempts = 0
	}
	if attempts > 6 {
		attempts = 6
	}
	delay := time.Duration(1<<attempts) * time.Minute
	if delay > time.Hour {
		return time.Hour
	}
	return delay
}

var _ Worker = (*StorageDeletionWorker)(nil)
