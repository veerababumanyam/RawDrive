package worker

import (
	"context"
	"log"
	"sync"
	"time"
)

type storageReconciler interface {
	ReconcileAll(ctx context.Context) (int64, error)
}

// StorageReconciliationWorker periodically recomputes workspace_storage counters
// from live assets and derivatives. It heals historical drift from failed or
// interrupted accounting paths while preserving quota/grace/reserved bytes.
type StorageReconciliationWorker struct {
	reconciler   storageReconciler
	pollInterval time.Duration
	stopCh       chan struct{}
	stopOnce     sync.Once
}

func NewStorageReconciliationWorker(reconciler storageReconciler) *StorageReconciliationWorker {
	return &StorageReconciliationWorker{
		reconciler:   reconciler,
		pollInterval: time.Hour,
		stopCh:       make(chan struct{}),
	}
}

func (w *StorageReconciliationWorker) Start(ctx context.Context) {
	if w.reconciler == nil {
		log.Println("storage reconciliation worker: disabled (reconciler missing)")
		return
	}
	log.Println("storage reconciliation worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.reconcile(ctx)
	for {
		select {
		case <-ctx.Done():
			log.Println("storage reconciliation worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("storage reconciliation worker: stopped")
			return
		case <-ticker.C:
			w.reconcile(ctx)
		}
	}
}

func (w *StorageReconciliationWorker) Stop() {
	if w.stopCh == nil {
		return
	}
	w.stopOnce.Do(func() {
		close(w.stopCh)
	})
}

func (w *StorageReconciliationWorker) reconcile(ctx context.Context) {
	changed, err := w.reconciler.ReconcileAll(ctx)
	if err != nil {
		log.Printf("storage reconciliation worker: reconcile all: %v", err)
		return
	}
	if changed > 0 {
		log.Printf("storage reconciliation worker: reconciled %d workspace storage row(s)", changed)
	}
}

var _ Worker = (*StorageReconciliationWorker)(nil)
