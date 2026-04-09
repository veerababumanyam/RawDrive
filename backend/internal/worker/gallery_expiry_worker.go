package worker

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryExpiryWorker transitions shared galleries to expired when expires_at has passed.
type GalleryExpiryWorker struct {
	pool         *pgxpool.Pool
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewGalleryExpiryWorker creates a new GalleryExpiryWorker.
func NewGalleryExpiryWorker(pool *pgxpool.Pool) *GalleryExpiryWorker {
	return &GalleryExpiryWorker{
		pool:         pool,
		pollInterval: 15 * time.Minute, // check every 15 min
		stopCh:       make(chan struct{}),
	}
}

// Start begins the expiry polling loop.
func (w *GalleryExpiryWorker) Start(ctx context.Context) {
	log.Println("gallery expiry worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.expire(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("gallery expiry worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("gallery expiry worker: stopped")
			return
		case <-ticker.C:
			w.expire(ctx)
		}
	}
}

// Stop signals the worker to shut down.
func (w *GalleryExpiryWorker) Stop() {
	close(w.stopCh)
}

func (w *GalleryExpiryWorker) expire(ctx context.Context) {
	tag, err := w.pool.Exec(ctx,
		`UPDATE galleries
		 SET status = 'expired', updated_at = now()
		 WHERE status = 'shared'
		   AND expires_at IS NOT NULL
		   AND expires_at < now()
		   AND deleted_at IS NULL`,
	)
	if err != nil {
		log.Printf("gallery expiry worker: error: %v", err)
		return
	}
	if tag.RowsAffected() > 0 {
		log.Printf("gallery expiry worker: expired %d galleries", tag.RowsAffected())
	}
}
