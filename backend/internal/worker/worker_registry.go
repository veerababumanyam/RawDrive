package worker

import (
	"context"
	"log"
	"sync"
)

// Worker represents a background worker that can be started and stopped.
type Worker interface {
	Start(ctx context.Context)
	Stop()
}

// Registry manages background workers.
type Registry struct {
	workers map[string]Worker
	mu      sync.Mutex
}

// NewRegistry creates a new worker Registry.
func NewRegistry() *Registry {
	return &Registry{
		workers: make(map[string]Worker),
	}
}

// Register adds a worker to the registry.
func (r *Registry) Register(name string, w Worker) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.workers[name] = w
}

// StartAll launches all registered workers in goroutines.
func (r *Registry) StartAll(ctx context.Context) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for name, w := range r.workers {
		log.Printf("worker registry: starting %s", name)
		go w.Start(ctx)
	}
}

// StopAll signals all workers to stop.
func (r *Registry) StopAll() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for name, w := range r.workers {
		log.Printf("worker registry: stopping %s", name)
		w.Stop()
	}
}
