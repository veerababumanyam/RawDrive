package worker

import (
	"context"
	"log"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

// ModerationWorker scans new messages and listings for policy violations
// using keyword-based content screening.
type ModerationWorker struct {
	msgRepo      *repository.MessagingRepo
	modRepo      *repository.ModerationRepo
	pollInterval time.Duration
	stopCh       chan struct{}
}

// NewModerationWorker creates a new ModerationWorker.
func NewModerationWorker(
	msgRepo *repository.MessagingRepo,
	modRepo *repository.ModerationRepo,
) *ModerationWorker {
	return &ModerationWorker{
		msgRepo:      msgRepo,
		modRepo:      modRepo,
		pollInterval: 30 * time.Second,
		stopCh:       make(chan struct{}),
	}
}

// Start begins the moderation polling loop.
func (w *ModerationWorker) Start(ctx context.Context) {
	log.Println("moderation worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("moderation worker: context cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("moderation worker: stop signal received")
			return
		case <-ticker.C:
			// Screening happens inline when messages are sent.
			// This worker is a placeholder for future batch screening
			// (e.g., scanning older content when rules change).
			log.Println("moderation worker: heartbeat")
		}
	}
}

// Stop signals the worker to stop.
func (w *ModerationWorker) Stop() {
	close(w.stopCh)
}
