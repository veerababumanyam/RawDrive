package worker

import (
	"context"
	"log"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

// MessageCleanupWorker deletes messages older than 30 days,
// excluding client conversation messages (retained per gallery lifecycle).
type MessageCleanupWorker struct {
	repo         *repository.MessagingRepo
	retention    time.Duration
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewMessageCleanupWorker creates a new MessageCleanupWorker.
func NewMessageCleanupWorker(repo *repository.MessagingRepo) *MessageCleanupWorker {
	return &MessageCleanupWorker{
		repo:         repo,
		retention:    30 * 24 * time.Hour, // 30 days
		pollInterval: 24 * time.Hour,       // run once daily
		stopCh:       make(chan struct{}),
	}
}

// Start begins the cleanup polling loop.
func (w *MessageCleanupWorker) Start(ctx context.Context) {
	log.Println("message cleanup worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	// Run once on startup
	w.cleanup(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("message cleanup worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("message cleanup worker: stop signal received")
			return
		case <-ticker.C:
			w.cleanup(ctx)
		}
	}
}

// Stop signals the worker to stop.
func (w *MessageCleanupWorker) Stop() {
	close(w.stopCh)
}

func (w *MessageCleanupWorker) cleanup(ctx context.Context) {
	deleted, err := w.repo.DeleteOldMessages(ctx, w.retention)
	if err != nil {
		log.Printf("message cleanup worker: error: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("message cleanup worker: deleted %d old messages", deleted)
	}
}
