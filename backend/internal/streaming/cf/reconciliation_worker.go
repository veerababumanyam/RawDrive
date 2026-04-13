package cf

import (
	"context"
	"log/slog"
	"math/rand"
	"sync"
	"time"
)

// ActiveStreamSource returns the list of streams whose CF state should be
// reconciled on each tick. "Active" means any row in a non-terminal
// live_state — those are the ones most likely to drift when a webhook is
// missed.
type ActiveStreamSource interface {
	ListActive(ctx context.Context) ([]ActiveStream, error)
}

// ActiveStream is the minimum shape the worker needs to call CF.Get and
// dispatch a state transition via StateApplier.
type ActiveStream struct {
	ID        string
	CFUID     string
	LiveState string // current DB state
}

// StateApplier is shared with the webhook handler — reconciliation
// reuses the same state-transition code path so drift fixes are
// idempotent with real webhook processing.
type StateApplier interface {
	Apply(ctx context.Context, streamID string, cfState string) error
}

// DriftMetric records each time the worker corrects a stream. Callers
// typically wire this to prometheus.CounterVec{from, to}.
type DriftMetric interface {
	Inc(from, to string)
}

// ReconciliationWorker periodically polls CF for every active stream and
// reconciles drift.
type ReconciliationWorker struct {
	cf         LiveInputClient
	streams    ActiveStreamSource
	applier    StateApplier
	metric     DriftMetric
	clock      func() time.Time
	interval   time.Duration
	jitter     float64 // ±fraction of interval
	concurrency int
	logger     *slog.Logger
	rng        func() float64 // injectable for deterministic jitter tests
}

// NewReconciliationWorker constructs a worker with sensible defaults.
func NewReconciliationWorker(cf LiveInputClient, streams ActiveStreamSource, applier StateApplier, metric DriftMetric, logger *slog.Logger) *ReconciliationWorker {
	if logger == nil {
		logger = slog.Default()
	}
	return &ReconciliationWorker{
		cf:          cf,
		streams:     streams,
		applier:     applier,
		metric:      metric,
		clock:       time.Now,
		interval:    30 * time.Second,
		jitter:      0.1,
		concurrency: 5,
		logger:      logger,
		rng:         rand.Float64,
	}
}

// Run blocks until ctx is cancelled. Each tick is best-effort; one slow
// CF call must not block all other streams.
func (w *ReconciliationWorker) Run(ctx context.Context) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		_ = w.Tick(ctx)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(w.nextInterval()):
		}
	}
}

// Tick runs a single reconciliation pass.
func (w *ReconciliationWorker) Tick(ctx context.Context) error {
	list, err := w.streams.ListActive(ctx)
	if err != nil {
		w.logger.Warn("recon: list active", "err", err.Error())
		return err
	}

	sem := make(chan struct{}, w.concurrency)
	var wg sync.WaitGroup
	for _, s := range list {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case sem <- struct{}{}:
		}
		wg.Add(1)
		go func(s ActiveStream) {
			defer wg.Done()
			defer func() { <-sem }()
			w.reconcileOne(ctx, s)
		}(s)
	}
	wg.Wait()
	return nil
}

func (w *ReconciliationWorker) reconcileOne(ctx context.Context, s ActiveStream) {
	li, err := w.cf.Get(ctx, s.CFUID)
	if err != nil {
		// CF failure (rate limit, network) — skip this tick.
		w.logger.Info("recon: cf get failed", "stream", s.ID, "err", err.Error())
		return
	}
	if li == nil {
		return
	}
	cfState := mapCFStatusToLiveState(li.Status, s.LiveState)
	if cfState == "" || cfState == s.LiveState {
		return // no drift
	}
	if err := w.applier.Apply(ctx, s.ID, cfState); err != nil {
		w.logger.Warn("recon: apply", "stream", s.ID, "err", err.Error())
		return
	}
	if w.metric != nil {
		w.metric.Inc(s.LiveState, cfState)
	}
}

// mapCFStatusToLiveState maps CF live input status to our internal
// streams.live_state. CF reports one of: connected / disconnected / idle.
// Our DB tracks a richer lifecycle; the mapping favors safe transitions.
func mapCFStatusToLiveState(cfStatus, dbState string) string {
	switch cfStatus {
	case "connected":
		return "live"
	case "disconnected":
		// From live → ended; from provisioning → failed.
		if dbState == "provisioning" || dbState == "ready" {
			return "failed"
		}
		return "ended"
	case "idle":
		// Idle means CF has no connection. If DB thinks we're live,
		// likely a missed disconnect.
		if dbState == "live" || dbState == "ending" {
			return "ended"
		}
		return ""
	}
	return ""
}

func (w *ReconciliationWorker) nextInterval() time.Duration {
	if w.jitter <= 0 {
		return w.interval
	}
	// Jitter in range [1-jitter, 1+jitter] * interval
	delta := (w.rng()*2 - 1) * w.jitter
	return time.Duration(float64(w.interval) * (1 + delta))
}
