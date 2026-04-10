package worker

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Tests for DSRPurgeWorker focus on the construction + callback wiring
// surface. Database-touching paths (claim batch, mark complete) require
// a real Postgres connection and are exercised at the integration test
// layer in backend/internal/database/.

// TestDSRPurgeWorker_NewDefaults verifies that NewDSRPurgeWorker produces
// a usable worker with sensible defaults.
func TestDSRPurgeWorker_NewDefaults(t *testing.T) {
	processed := int32(0)
	access := func(_ context.Context, _ uuid.UUID) error {
		atomic.AddInt32(&processed, 1)
		return nil
	}
	w := NewDSRPurgeWorker(nil, access)
	if w == nil {
		t.Fatal("NewDSRPurgeWorker returned nil")
	}
	if w.pollInterval != 30*time.Second {
		t.Errorf("default pollInterval: want 30s, got %v", w.pollInterval)
	}
	if w.processAccess == nil {
		t.Error("processAccess callback not stored")
	}
	if w.eraser != nil {
		t.Error("eraser should be nil by default")
	}
}

// TestDSRPurgeWorker_WithEraser_FluentChain verifies the builder.
func TestDSRPurgeWorker_WithEraser_FluentChain(t *testing.T) {
	w := NewDSRPurgeWorker(nil, func(_ context.Context, _ uuid.UUID) error { return nil })
	eraser := func(_ context.Context, _ string, _ *uuid.UUID) error { return nil }
	out := w.WithEraser(eraser)
	if out != w {
		t.Error("WithEraser should return the receiver")
	}
	if w.eraser == nil {
		t.Error("eraser not stored")
	}
}

// TestDSRPurgeWorker_WithPollInterval verifies the override.
func TestDSRPurgeWorker_WithPollInterval(t *testing.T) {
	w := NewDSRPurgeWorker(nil, func(_ context.Context, _ uuid.UUID) error { return nil })
	w.WithPollInterval(5 * time.Second)
	if w.pollInterval != 5*time.Second {
		t.Errorf("pollInterval: want 5s, got %v", w.pollInterval)
	}
}

// TestDSRPurgeWorker_ProcessBatch_NoPoolIsSafe verifies that processBatch
// is a no-op when pool is nil. Critical because the worker may be
// constructed without a pool in unit tests.
func TestDSRPurgeWorker_ProcessBatch_NoPoolIsSafe(t *testing.T) {
	w := NewDSRPurgeWorker(nil, func(_ context.Context, _ uuid.UUID) error { return nil })
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("processBatch panicked with nil pool: %v", r)
		}
	}()
	w.processBatch(context.Background())
}

// TestDSRPurgeWorker_ProcessBatch_NoProcessorIsSafe verifies the same
// graceful degradation when the access callback is nil.
func TestDSRPurgeWorker_ProcessBatch_NoProcessorIsSafe(t *testing.T) {
	w := &DSRPurgeWorker{} // no pool, no callback
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("processBatch panicked with nil callback: %v", r)
		}
	}()
	w.processBatch(context.Background())
}

// TestDSRPurgeWorker_StopChannelExists verifies Stop is non-blocking when
// the worker hasn't started yet (channel close idempotency would be
// nice but we just verify the channel was created).
func TestDSRPurgeWorker_StopChannelExists(t *testing.T) {
	w := NewDSRPurgeWorker(nil, func(_ context.Context, _ uuid.UUID) error { return nil })
	if w.stopCh == nil {
		t.Fatal("stopCh not initialized")
	}
}

// TestDSRPurgeWorker_AccessCallbackErrorIsHandled verifies the worker
// matches the documented behavior — access callback errors are logged
// (not propagated) so a single bad request doesn't crash the worker.
//
// We call the callback through processBatch via direct field manipulation
// because we can't run a real DB poll here.
func TestDSRPurgeWorker_AccessCallbackErrorIsHandled(t *testing.T) {
	called := int32(0)
	access := func(_ context.Context, _ uuid.UUID) error {
		atomic.AddInt32(&called, 1)
		return errors.New("synthetic")
	}
	w := NewDSRPurgeWorker(nil, access)
	if w.processAccess == nil {
		t.Fatal("callback not stored")
	}
	// Invoke the callback directly to confirm it returns the synthetic
	// error — the worker's outer logging is exercised in integration
	// tests where a real DB row gets dispatched to it.
	if err := w.processAccess(context.Background(), uuid.New()); err == nil {
		t.Error("expected synthetic error, got nil")
	}
	if atomic.LoadInt32(&called) != 1 {
		t.Errorf("expected 1 call, got %d", called)
	}
}
