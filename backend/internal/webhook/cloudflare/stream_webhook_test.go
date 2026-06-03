package cloudflare

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// ---- fixtures ---------------------------------------------------------------

type fakeRepo struct {
	mu           sync.Mutex
	byUID        map[string]*Stream
	liveState    map[string]string
	replayState  map[string]string
	replayURL    map[string]string
	notFoundUIDs map[string]bool
	writeErr     error
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		byUID:        map[string]*Stream{},
		liveState:    map[string]string{},
		replayState:  map[string]string{},
		replayURL:    map[string]string{},
		notFoundUIDs: map[string]bool{},
	}
}

func (f *fakeRepo) GetByCFUID(ctx context.Context, uid string) (*Stream, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.notFoundUIDs[uid] {
		return nil, nil
	}
	s, ok := f.byUID[uid]
	if !ok {
		return nil, nil
	}
	return s, nil
}

func (f *fakeRepo) UpdateLiveState(ctx context.Context, id, state string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.writeErr != nil {
		return f.writeErr
	}
	f.liveState[id] = state
	return nil
}

func (f *fakeRepo) UpdateReplayState(ctx context.Context, id, state, url string, exp *time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.writeErr != nil {
		return f.writeErr
	}
	f.replayState[id] = state
	f.replayURL[id] = url
	return nil
}

type fakeDelivery struct {
	mu      sync.Mutex
	entries []StreamEvent
}

func (d *fakeDelivery) LogEvent(ctx context.Context, id string, e StreamEvent) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.entries = append(d.entries, e)
	return nil
}

type fakeReplayReconciler struct {
	called bool
	err    error
}

func (r *fakeReplayReconciler) OnRecordingReady(ctx context.Context, uid, videoID, url string) error {
	r.called = true
	return r.err
}

// signHeader builds a valid Webhook-Signature header for body at now.
func signHeader(secret string, body []byte, now time.Time) string {
	ts := fmt.Sprintf("%d", now.Unix())
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts))
	mac.Write([]byte{'.'})
	mac.Write(body)
	return "time=" + ts + ",sig1=" + hex.EncodeToString(mac.Sum(nil))
}

func newTestHandler(t *testing.T, now time.Time) (*Handler, *fakeRepo, *fakeDelivery, *fakeReplayReconciler, string) {
	t.Helper()
	secret := "test-webhook-secret-32-bytes-xxx"
	repo := newFakeRepo()
	del := &fakeDelivery{}
	rec := &fakeReplayReconciler{}
	h := NewHandler(
		NewHMACVerifier(secret, 5*time.Minute),
		repo, del, rec,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	h.clock = func() time.Time { return now }
	return h, repo, del, rec, secret
}

func postJSON(t *testing.T, h http.Handler, body []byte, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/cloudflare-stream", bytes.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	h.ServeHTTP(rr, req)
	return rr
}

// ---- tests ------------------------------------------------------------------

// T-S3-01 Valid signature → 200 + state updated
func TestWebhook_ValidSignature_200UpdatesState(t *testing.T) {
	now := time.Now().UTC()
	h, repo, del, _, secret := newTestHandler(t, now)
	repo.byUID["uid-A"] = &Stream{ID: "s1", CFUID: "uid-A", PlanTier: "standard"}

	evt := StreamEvent{Type: EvtLiveInputConnected, UID: "uid-A", OccurredAt: now}
	body, _ := json.Marshal(evt)

	rr := postJSON(t, h, body, map[string]string{
		"Webhook-Signature": signHeader(secret, body, now),
		"Content-Type":      "application/json",
	})
	if rr.Code != 200 {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	if repo.liveState["s1"] != "live" {
		t.Errorf("live_state = %q", repo.liveState["s1"])
	}
	if len(del.entries) != 1 {
		t.Errorf("delivery entries = %d", len(del.entries))
	}
}

// T-S3-02 Invalid signature → 401
func TestWebhook_InvalidSignature_401(t *testing.T) {
	now := time.Now().UTC()
	h, _, _, _, _ := newTestHandler(t, now)

	body := []byte(`{"type":"live_input.connected","uid":"u"}`)
	rr := postJSON(t, h, body, map[string]string{
		"Webhook-Signature": "time=" + fmt.Sprintf("%d", now.Unix()) + ",sig1=deadbeef",
	})
	if rr.Code != 401 {
		t.Errorf("status = %d", rr.Code)
	}
}

// T-S3-03 Old timestamp → 401
func TestWebhook_OldTimestamp_401(t *testing.T) {
	now := time.Now().UTC()
	h, _, _, _, secret := newTestHandler(t, now)
	old := now.Add(-10 * time.Minute)

	body := []byte(`{"type":"live_input.connected","uid":"u"}`)
	rr := postJSON(t, h, body, map[string]string{
		"Webhook-Signature": signHeader(secret, body, old),
	})
	if rr.Code != 401 {
		t.Errorf("status = %d", rr.Code)
	}
}

// T-S3-04 Missing header → 401
func TestWebhook_MissingSignatureHeader_401(t *testing.T) {
	now := time.Now().UTC()
	h, _, _, _, _ := newTestHandler(t, now)
	rr := postJSON(t, h, []byte(`{}`), nil)
	if rr.Code != 401 {
		t.Errorf("status = %d", rr.Code)
	}
}

// T-S3-05 Unknown event type → 200 (logged, no state change)
func TestWebhook_UnknownEventType_200Logged(t *testing.T) {
	now := time.Now().UTC()
	h, repo, _, _, secret := newTestHandler(t, now)
	repo.byUID["u"] = &Stream{ID: "s1", CFUID: "u"}

	body, _ := json.Marshal(map[string]any{"type": "surprise.new.event", "uid": "u", "occurredAt": now})
	rr := postJSON(t, h, body, map[string]string{"Webhook-Signature": signHeader(secret, body, now)})
	if rr.Code != 200 {
		t.Errorf("status = %d", rr.Code)
	}
	if len(repo.liveState) != 0 {
		t.Errorf("state should not change for unknown event")
	}
}

// T-S3-06 Malformed JSON → 400
func TestWebhook_MalformedJSON_400(t *testing.T) {
	now := time.Now().UTC()
	h, _, _, _, secret := newTestHandler(t, now)
	body := []byte(`{not json`)
	rr := postJSON(t, h, body, map[string]string{"Webhook-Signature": signHeader(secret, body, now)})
	if rr.Code != 400 {
		t.Errorf("status = %d", rr.Code)
	}
}

// T-S3-07 Unknown stream UID → 200 (log dead-letter, do not retry-storm CF)
func TestWebhook_UnknownStreamUID_200Logged(t *testing.T) {
	now := time.Now().UTC()
	h, _, _, _, secret := newTestHandler(t, now)
	body, _ := json.Marshal(StreamEvent{Type: EvtLiveInputConnected, UID: "ghost", OccurredAt: now})
	rr := postJSON(t, h, body, map[string]string{"Webhook-Signature": signHeader(secret, body, now)})
	if rr.Code != 200 {
		t.Errorf("status = %d", rr.Code)
	}
}

// T-S3-08 DB write failure → 500 (CF retries)
func TestWebhook_DBWriteFailure_500(t *testing.T) {
	now := time.Now().UTC()
	h, repo, _, _, secret := newTestHandler(t, now)
	repo.byUID["u"] = &Stream{ID: "s1", CFUID: "u"}
	repo.writeErr = errors.New("db down")

	body, _ := json.Marshal(StreamEvent{Type: EvtLiveInputConnected, UID: "u", OccurredAt: now})
	rr := postJSON(t, h, body, map[string]string{"Webhook-Signature": signHeader(secret, body, now)})
	if rr.Code != 500 {
		t.Errorf("status = %d", rr.Code)
	}
}

// T-S3-09 Each event type → correct transition
func TestWebhook_EachEventType_CorrectTransition(t *testing.T) {
	cases := []struct {
		typ         EventType
		wantLive    string
		wantReplay  string
		checkReplay bool
	}{
		{EvtLiveInputConnected, "live", "", false},
		{EvtLiveInputDisconnected, "ended", "", false},
		{EvtLiveInputErrored, "failed", "", false},
		{EvtRecordingDeleted, "", "deleted", true},
	}
	for _, tc := range cases {
		t.Run(string(tc.typ), func(t *testing.T) {
			now := time.Now().UTC()
			h, repo, _, _, secret := newTestHandler(t, now)
			repo.byUID["u"] = &Stream{ID: "s1", CFUID: "u"}

			body, _ := json.Marshal(StreamEvent{Type: tc.typ, UID: "u", OccurredAt: now})
			rr := postJSON(t, h, body, map[string]string{"Webhook-Signature": signHeader(secret, body, now)})
			if rr.Code != 200 {
				t.Fatalf("status = %d body=%s", rr.Code, rr.Body.String())
			}
			if tc.wantLive != "" && repo.liveState["s1"] != tc.wantLive {
				t.Errorf("live = %q, want %q", repo.liveState["s1"], tc.wantLive)
			}
			if tc.checkReplay && repo.replayState["s1"] != tc.wantReplay {
				t.Errorf("replay = %q, want %q", repo.replayState["s1"], tc.wantReplay)
			}
		})
	}
}

// T-S3-10 Benchmark: p95 < 500ms (NFR-014-PERF-02). In-memory fakes — the
// bench proves the handler overhead alone sits well under budget.
func BenchmarkWebhook_Under500ms(b *testing.B) {
	now := time.Now().UTC()
	secret := "bench-secret"
	repo := newFakeRepo()
	repo.byUID["u"] = &Stream{ID: "s1", CFUID: "u"}
	h := NewHandler(NewHMACVerifier(secret, 5*time.Minute), repo, &fakeDelivery{}, &fakeReplayReconciler{},
		slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.clock = func() time.Time { return now }

	body, _ := json.Marshal(StreamEvent{Type: EvtLiveInputConnected, UID: "u", OccurredAt: now})
	sig := signHeader(secret, body, now)

	b.ResetTimer()
	start := time.Now()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
		req.Header.Set("Webhook-Signature", sig)
		h.ServeHTTP(httptest.NewRecorder(), req)
	}
	if b.N > 100 {
		avg := time.Since(start) / time.Duration(b.N)
		if avg > 500*time.Millisecond {
			b.Fatalf("avg = %v, budget 500ms", avg)
		}
	}
}

// T-S3-11 Replay recording.ready routes to reconciler
func TestWebhook_RecordingReady_CallsReconciler(t *testing.T) {
	now := time.Now().UTC()
	h, repo, _, rec, secret := newTestHandler(t, now)
	repo.byUID["u"] = &Stream{ID: "s1", CFUID: "u", PlanTier: "standard"}

	payload := json.RawMessage(`{"replayUrl":"https://rp.example/v1"}`)
	body, _ := json.Marshal(StreamEvent{Type: EvtRecordingReady, UID: "u", VideoID: "vid-1", OccurredAt: now, Payload: payload})
	rr := postJSON(t, h, body, map[string]string{"Webhook-Signature": signHeader(secret, body, now)})
	if rr.Code != 200 {
		t.Fatalf("status = %d body=%s", rr.Code, rr.Body.String())
	}
	if !rec.called {
		t.Error("ReplayReconciler.OnRecordingReady not called")
	}
}

// T-S3-12 Body too large → 413
func TestWebhook_BodyTooLarge_413(t *testing.T) {
	now := time.Now().UTC()
	h, _, _, _, secret := newTestHandler(t, now)
	huge := bytes.Repeat([]byte("a"), maxBodyBytes+10)
	rr := postJSON(t, h, huge, map[string]string{"Webhook-Signature": signHeader(secret, huge, now)})
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d", rr.Code)
	}
}

// Sanity: wrong method → 405
func TestWebhook_WrongMethod_405(t *testing.T) {
	now := time.Now().UTC()
	h, _, _, _, _ := newTestHandler(t, now)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", strings.NewReader(""))
	h.ServeHTTP(rr, req)
	if rr.Code != 405 {
		t.Errorf("status = %d", rr.Code)
	}
}
