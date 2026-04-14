package handlers

import (
	"bufio"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/statepusher"
	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// --- fakes ----------------------------------------------------------------

type fakeViewerParser struct {
	claims *viewer.Claims
	err    error
}

func (f *fakeViewerParser) Parse(tok string) (*viewer.Claims, error) {
	if f.err != nil {
		return nil, f.err
	}
	if tok == "" {
		return nil, errors.New("empty token")
	}
	return f.claims, nil
}

type fakeSSEPusher struct {
	ch          chan statepusher.StateEvent
	cleanupCh   chan struct{}
	subscribed  bool
	lastEventID string
	err         error
}

func newFakeSSEPusher() *fakeSSEPusher {
	return &fakeSSEPusher{
		ch:        make(chan statepusher.StateEvent, 8),
		cleanupCh: make(chan struct{}, 1),
	}
}

func (f *fakeSSEPusher) Subscribe(ctx context.Context, streamID uuid.UUID, lastEventID string) (<-chan statepusher.StateEvent, func(), error) {
	if f.err != nil {
		return nil, nil, f.err
	}
	f.subscribed = true
	f.lastEventID = lastEventID
	cleanup := func() {
		select {
		case f.cleanupCh <- struct{}{}:
		default:
		}
	}
	return f.ch, cleanup, nil
}

type fakeSSEFlag struct{ enabled bool }

func (f *fakeSSEFlag) IsEnabled(_ context.Context, _ uuid.UUID) (bool, string) {
	return f.enabled, ""
}

// --- helpers --------------------------------------------------------------

func mountSSE(h *SSEStateHandler) http.Handler {
	r := chi.NewRouter()
	r.Get("/api/v1/public/streams/{streamID}/state", h.ServeHTTP)
	return r
}

func validClaimsFor(streamID uuid.UUID) *viewer.Claims {
	c := &viewer.Claims{
		StreamID:        streamID.String(),
		AccessLevel:     viewer.AccessLevelOpen,
		ViewerSessionID: uuid.NewString(),
	}
	return c
}

// --- tests ----------------------------------------------------------------

func TestSSEState_Unauthenticated_401(t *testing.T) {
	streamID := uuid.New()
	h := &SSEStateHandler{
		Parser: &fakeViewerParser{err: errors.New("nope")},
		Pusher: newFakeSSEPusher(),
		Flag:   &fakeSSEFlag{enabled: true},
	}
	srv := httptest.NewServer(mountSSE(h))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/v1/public/streams/" + streamID.String() + "/state")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d want 401", resp.StatusCode)
	}
}

func TestSSEState_InvalidToken_401(t *testing.T) {
	streamID := uuid.New()
	h := &SSEStateHandler{
		Parser: &fakeViewerParser{err: errors.New("bad sig")},
		Pusher: newFakeSSEPusher(),
		Flag:   &fakeSSEFlag{enabled: true},
	}
	srv := httptest.NewServer(mountSSE(h))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/v1/public/streams/" + streamID.String() + "/state?access_token=bogus")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d want 401", resp.StatusCode)
	}
}

func TestSSEState_StreamIDMismatch_401(t *testing.T) {
	streamID := uuid.New()
	otherID := uuid.New()
	h := &SSEStateHandler{
		Parser: &fakeViewerParser{claims: validClaimsFor(otherID)},
		Pusher: newFakeSSEPusher(),
		Flag:   &fakeSSEFlag{enabled: true},
	}
	srv := httptest.NewServer(mountSSE(h))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/v1/public/streams/" + streamID.String() + "/state?access_token=ok")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d want 401", resp.StatusCode)
	}
}

func TestSSEState_FeatureFlagOff_404(t *testing.T) {
	streamID := uuid.New()
	h := &SSEStateHandler{
		Parser: &fakeViewerParser{claims: validClaimsFor(streamID)},
		Pusher: newFakeSSEPusher(),
		Flag:   &fakeSSEFlag{enabled: false},
	}
	srv := httptest.NewServer(mountSSE(h))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/v1/public/streams/" + streamID.String() + "/state?access_token=ok")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d want 404", resp.StatusCode)
	}
}

func TestSSEState_Success_WritesConnectedEvent_AndHoldsOpen(t *testing.T) {
	streamID := uuid.New()
	pusher := newFakeSSEPusher()
	h := &SSEStateHandler{
		Parser: &fakeViewerParser{claims: validClaimsFor(streamID)},
		Pusher: pusher,
		Flag:   &fakeSSEFlag{enabled: true},
	}
	srv := httptest.NewServer(mountSSE(h))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET",
		srv.URL+"/api/v1/public/streams/"+streamID.String()+"/state?access_token=ok", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("content-type = %q", ct)
	}
	if cc := resp.Header.Get("Cache-Control"); cc != "no-cache" {
		t.Fatalf("cache-control = %q", cc)
	}

	br := bufio.NewReader(resp.Body)
	done := make(chan string, 1)
	go func() {
		var buf strings.Builder
		for i := 0; i < 4; i++ {
			line, err := br.ReadString('\n')
			if err != nil {
				break
			}
			buf.WriteString(line)
			if strings.Contains(buf.String(), "event: connected") {
				done <- buf.String()
				return
			}
		}
		done <- buf.String()
	}()

	select {
	case got := <-done:
		if !strings.Contains(got, "event: connected") {
			t.Fatalf("did not see connected event; got %q", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for connected event")
	}

	// Push an event and confirm it's written.
	ev := statepusher.StateEvent{
		ID:    "evt-1",
		Kind:  "state_change",
		State: "live",
		At:    time.Now().UTC(),
	}
	pusher.ch <- ev

	gotCh := make(chan string, 1)
	go func() {
		var buf strings.Builder
		deadline := time.Now().Add(2 * time.Second)
		sawID := false
		for time.Now().Before(deadline) {
			line, err := br.ReadString('\n')
			if err != nil {
				break
			}
			buf.WriteString(line)
			if strings.Contains(buf.String(), "evt-1") {
				sawID = true
			}
			if sawID && strings.Contains(buf.String(), "event: state_change") {
				gotCh <- buf.String()
				return
			}
		}
		gotCh <- buf.String()
	}()

	select {
	case got := <-gotCh:
		if !strings.Contains(got, "evt-1") || !strings.Contains(got, "event: state_change") {
			t.Fatalf("expected state_change evt-1, got %q", got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for state event")
	}
}

func TestSSEState_LastEventID_ForwardedToPusher(t *testing.T) {
	streamID := uuid.New()
	pusher := newFakeSSEPusher()
	h := &SSEStateHandler{
		Parser: &fakeViewerParser{claims: validClaimsFor(streamID)},
		Pusher: pusher,
		Flag:   &fakeSSEFlag{enabled: true},
	}
	srv := httptest.NewServer(mountSSE(h))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET",
		srv.URL+"/api/v1/public/streams/"+streamID.String()+"/state?access_token=ok", nil)
	req.Header.Set("Last-Event-ID", "evt-42")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		cancel()
		t.Fatalf("GET: %v", err)
	}
	// Give handler a moment to subscribe.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if pusher.subscribed {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	resp.Body.Close()

	if !pusher.subscribed {
		t.Fatal("pusher.Subscribe was never called")
	}
	if pusher.lastEventID != "evt-42" {
		t.Fatalf("lastEventID = %q want evt-42", pusher.lastEventID)
	}
}

func TestSSEState_ContextCancel_Cleanup(t *testing.T) {
	streamID := uuid.New()
	pusher := newFakeSSEPusher()
	h := &SSEStateHandler{
		Parser: &fakeViewerParser{claims: validClaimsFor(streamID)},
		Pusher: pusher,
		Flag:   &fakeSSEFlag{enabled: true},
	}
	srv := httptest.NewServer(mountSSE(h))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET",
		srv.URL+"/api/v1/public/streams/"+streamID.String()+"/state?access_token=ok", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	// Wait until the handler has subscribed.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if pusher.subscribed {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	resp.Body.Close()

	select {
	case <-pusher.cleanupCh:
	case <-time.After(2 * time.Second):
		t.Fatal("cleanup was not invoked after context cancel")
	}
}
