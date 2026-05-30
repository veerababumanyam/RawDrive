package service

import (
	"runtime"
	"testing"
	"time"
)

// TestF074_CleanupLoopGoroutineStopsOnStop is the regression test for F-074.
//
// Before the fix, NewDesignCollabService spawned `go svc.cleanupLoop()` with a
// bare `for range ticker.C { ... }` and the type exposed no Stop method, so the
// goroutine (and its ticker) leaked forever. Building many instances — as test
// suites do — accumulated live goroutines that never terminated.
//
// After the fix, cleanupLoop selects on a stopCh and Stop() closes it, so every
// goroutine joins promptly. We assert the live-goroutine count returns to its
// pre-construction baseline once all services are stopped.
//
// nc is nil throughout: the service treats a nil *nats.Conn as a no-op publisher
// across every method, so no live NATS connection is required for this unit test.
func TestF074_CleanupLoopGoroutineStopsOnStop(t *testing.T) {
	// Let any goroutines from earlier tests settle so the baseline is stable.
	settle()
	baseline := runtime.NumGoroutine()

	const n = 25
	svcs := make([]*DesignCollabService, 0, n)
	for i := 0; i < n; i++ {
		svcs = append(svcs, NewDesignCollabService(nil))
	}

	// Sanity: constructing n services must have started additional goroutines,
	// otherwise the test cannot distinguish a leak from a no-op.
	settle()
	afterStart := runtime.NumGoroutine()
	if afterStart <= baseline {
		t.Fatalf("expected goroutine count to rise after constructing %d services; baseline=%d afterStart=%d", n, baseline, afterStart)
	}

	for _, s := range svcs {
		s.Stop()
	}

	// Poll until the goroutine count drops back to (around) the baseline. With
	// the leak present this never happens and the test fails on timeout.
	deadline := time.Now().Add(5 * time.Second)
	for {
		settle()
		if runtime.NumGoroutine() <= baseline {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("cleanupLoop goroutines did not terminate after Stop(): baseline=%d current=%d (F-074 leak)", baseline, runtime.NumGoroutine())
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// TestF074_StopIsIdempotent verifies Stop can be called multiple times (and from
// the never-started path) without panicking on a double channel close.
func TestF074_StopIsIdempotent(t *testing.T) {
	svc := NewDesignCollabService(nil)
	svc.Stop()
	svc.Stop() // must not panic — guarded by sync.Once.
	svc.Stop()
}

// settle yields the scheduler a few times so goroutines that are returning have
// a chance to actually exit before we sample runtime.NumGoroutine.
func settle() {
	for i := 0; i < 5; i++ {
		runtime.Gosched()
		time.Sleep(5 * time.Millisecond)
	}
}
