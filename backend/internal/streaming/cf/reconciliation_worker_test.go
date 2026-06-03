package cf

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

// ---- fakes ------------------------------------------------------------------

type fakeSource struct {
	streams []ActiveStream
	err     error
}

func (f *fakeSource) ListActive(ctx context.Context) ([]ActiveStream, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.streams, nil
}

type fakeCF struct {
	mu       sync.Mutex
	byUID    map[string]*LiveInput
	getErr   error
	getCalls int
}

func (c *fakeCF) Create(context.Context, map[string]string) (*LiveInput, error)      { return nil, nil }
func (c *fakeCF) Update(context.Context, string, LiveInputPatch) (*LiveInput, error) { return nil, nil }
func (c *fakeCF) Disable(context.Context, string) error                              { return nil }
func (c *fakeCF) Delete(context.Context, string) error                               { return nil }
func (c *fakeCF) Get(_ context.Context, uid string) (*LiveInput, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.getCalls++
	if c.getErr != nil {
		return nil, c.getErr
	}
	return c.byUID[uid], nil
}

type fakeApplier struct {
	mu    sync.Mutex
	calls []struct{ streamID, state string }
	err   error
}

func (a *fakeApplier) Apply(_ context.Context, id, state string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.err != nil {
		return a.err
	}
	a.calls = append(a.calls, struct{ streamID, state string }{id, state})
	return nil
}

type fakeMetric struct {
	mu         sync.Mutex
	increments []struct{ from, to string }
}

func (m *fakeMetric) Inc(from, to string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.increments = append(m.increments, struct{ from, to string }{from, to})
}

func newTestWorker(t *testing.T, src *fakeSource, cf *fakeCF, app *fakeApplier, met *fakeMetric) *ReconciliationWorker {
	t.Helper()
	var m DriftMetric
	if met != nil {
		m = met
	}
	w := NewReconciliationWorker(cf, src, app, m, slog.New(slog.NewTextHandler(io.Discard, nil)))
	w.rng = func() float64 { return 0.5 }
	return w
}

// ---- tests ------------------------------------------------------------------

// T-S4-01 — DB live, CF idle → state goes to "ended", drift counted
func TestWorker_DriftLiveToIdle_SetsEnded_IncrementsMetric(t *testing.T) {
	src := &fakeSource{streams: []ActiveStream{{ID: "s1", CFUID: "u1", LiveState: "live"}}}
	cf := &fakeCF{byUID: map[string]*LiveInput{"u1": {UID: "u1", Status: "idle"}}}
	app := &fakeApplier{}
	met := &fakeMetric{}
	w := newTestWorker(t, src, cf, app, met)

	if err := w.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(app.calls) != 1 || app.calls[0].state != "ended" {
		t.Errorf("apply calls = %+v, want one with state=ended", app.calls)
	}
	if len(met.increments) != 1 || met.increments[0].from != "live" || met.increments[0].to != "ended" {
		t.Errorf("metric = %+v", met.increments)
	}
}

// T-S4-02 — no drift → no apply, no metric
func TestWorker_NoDrift_NoChange(t *testing.T) {
	src := &fakeSource{streams: []ActiveStream{{ID: "s1", CFUID: "u1", LiveState: "live"}}}
	cf := &fakeCF{byUID: map[string]*LiveInput{"u1": {UID: "u1", Status: "connected"}}}
	app := &fakeApplier{}
	met := &fakeMetric{}
	w := newTestWorker(t, src, cf, app, met)

	_ = w.Tick(context.Background())
	if len(app.calls) != 0 {
		t.Errorf("unexpected applies: %+v", app.calls)
	}
	if len(met.increments) != 0 {
		t.Errorf("unexpected metric: %+v", met.increments)
	}
}

// T-S4-03 — multiple streams, partial drift
func TestWorker_MultipleStreams_OnlyDriftedUpdated(t *testing.T) {
	src := &fakeSource{streams: []ActiveStream{
		{ID: "s1", CFUID: "u1", LiveState: "live"},
		{ID: "s2", CFUID: "u2", LiveState: "live"},
		{ID: "s3", CFUID: "u3", LiveState: "provisioning"},
	}}
	cf := &fakeCF{byUID: map[string]*LiveInput{
		"u1": {Status: "connected"},
		"u2": {Status: "idle"},
		"u3": {Status: "disconnected"},
	}}
	app := &fakeApplier{}
	met := &fakeMetric{}
	w := newTestWorker(t, src, cf, app, met)

	_ = w.Tick(context.Background())
	// s1 no drift; s2 live→ended; s3 provisioning→failed
	if len(app.calls) != 2 {
		t.Fatalf("apply calls = %d, want 2: %+v", len(app.calls), app.calls)
	}
	states := map[string]string{}
	for _, c := range app.calls {
		states[c.streamID] = c.state
	}
	if states["s2"] != "ended" {
		t.Errorf("s2 state = %q, want ended", states["s2"])
	}
	if states["s3"] != "failed" {
		t.Errorf("s3 state = %q, want failed", states["s3"])
	}
}

// T-S4-04 — CF rate limit → tick continues (no panic, no apply)
func TestWorker_CFRateLimit_TickContinues(t *testing.T) {
	src := &fakeSource{streams: []ActiveStream{{ID: "s1", CFUID: "u1", LiveState: "live"}}}
	cf := &fakeCF{getErr: &CFError{Code: 429, Type: "rate_limited"}}
	app := &fakeApplier{}
	w := newTestWorker(t, src, cf, app, nil)

	if err := w.Tick(context.Background()); err != nil {
		t.Errorf("tick returned err: %v", err)
	}
	if len(app.calls) != 0 {
		t.Errorf("apply should not be called on CF failure")
	}
}

// T-S4-05 — ctx cancel → Run returns quickly
func TestWorker_CtxCancel_CleanExit(t *testing.T) {
	src := &fakeSource{streams: []ActiveStream{{ID: "s1", CFUID: "u1", LiveState: "live"}}}
	cf := &fakeCF{byUID: map[string]*LiveInput{"u1": {Status: "connected"}}}
	w := newTestWorker(t, src, cf, &fakeApplier{}, nil)
	w.interval = 10 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("err = %v", err)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Run did not return within 500ms of cancel")
	}
}

// T-S4-06 — jitter within ±interval*jitter
func TestWorker_IntervalJitterWithinRange(t *testing.T) {
	w := NewReconciliationWorker(&fakeCF{}, &fakeSource{}, &fakeApplier{}, nil, nil)
	w.interval = 100 * time.Millisecond
	w.jitter = 0.1

	// rng in [0,1); map to interval range.
	for _, r := range []float64{0.0, 0.5, 0.999} {
		w.rng = func() float64 { return r }
		got := w.nextInterval()
		lo := time.Duration(float64(w.interval) * 0.9)
		hi := time.Duration(float64(w.interval) * 1.1)
		if got < lo-time.Microsecond || got > hi+time.Microsecond {
			t.Errorf("r=%v got=%v, want in [%v, %v]", r, got, lo, hi)
		}
	}
}

// T-S4-07 — idempotent: applying same drift twice → applier called again
// but state converges (mock applier just records calls).
func TestWorker_IdempotentDriftApply(t *testing.T) {
	src := &fakeSource{streams: []ActiveStream{{ID: "s1", CFUID: "u1", LiveState: "live"}}}
	cf := &fakeCF{byUID: map[string]*LiveInput{"u1": {Status: "idle"}}}
	app := &fakeApplier{}
	w := newTestWorker(t, src, cf, app, nil)

	_ = w.Tick(context.Background())
	_ = w.Tick(context.Background()) // DB state didn't change in mock → still sees drift
	if len(app.calls) < 2 {
		t.Errorf("apply called %d times, expected >= 2 idempotent calls", len(app.calls))
	}
	// All should target the same terminal state.
	for _, c := range app.calls {
		if c.state != "ended" {
			t.Errorf("unexpected state: %q", c.state)
		}
	}
}

// T-S4-08 — missed live_input.connected webhook recovered within one tick
func TestWorker_MissedConnectedWebhook_RecoveredWithinOneTick(t *testing.T) {
	src := &fakeSource{streams: []ActiveStream{{ID: "s1", CFUID: "u1", LiveState: "provisioning"}}}
	cf := &fakeCF{byUID: map[string]*LiveInput{"u1": {Status: "connected"}}}
	app := &fakeApplier{}
	w := newTestWorker(t, src, cf, app, nil)

	_ = w.Tick(context.Background())
	if len(app.calls) != 1 || app.calls[0].state != "live" {
		t.Errorf("expected single live transition, got %+v", app.calls)
	}
}

// Source error: tick propagates but does not panic
func TestWorker_SourceError_Propagates(t *testing.T) {
	src := &fakeSource{err: errors.New("db down")}
	w := newTestWorker(t, src, &fakeCF{}, &fakeApplier{}, nil)
	if err := w.Tick(context.Background()); err == nil {
		t.Error("expected error")
	}
}
