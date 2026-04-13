package cf

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// newTestClient returns a LiveInputClient wired to the given httptest server.
// Retries use a fake sleep (no real waits) so tests run fast.
func newTestClient(t *testing.T, srv *httptest.Server) (*cfLiveInputClient, *int32) {
	t.Helper()
	cfg := &Config{
		AccountID: "test-account",
		APIToken:  "test-token-from-config",
		AllowedOrigins: []string{"https://studio.example"},
	}
	hc := NewHTTPClient(cfg, srv.URL)
	var slept int32
	hc.sleep = func(d time.Duration) { atomic.AddInt32(&slept, 1) }
	hc.http.Timeout = 2 * time.Second
	c := &cfLiveInputClient{cfg: cfg, c: hc}
	return c, &slept
}

func writeCFSuccess(w http.ResponseWriter, result any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"errors":  []any{},
		"result":  result,
	})
}

func sampleLiveInput() map[string]any {
	return map[string]any{
		"uid":        "abc123",
		"streamKey":  "live_secret_key",
		"rtmpsUrl":   "rtmps://live.cloudflare.com:443/live/",
		"srtUrl":     "srt://live.cloudflare.com:778",
		"srtPasskey": "srt_secret",
		"status":     "idle",
		"created":    "2026-04-13T10:00:00Z",
		"modified":   "2026-04-13T10:00:00Z",
	}
}

// ---- T-S1-01 ----------------------------------------------------------------
func TestCreateLiveInput_HappyPath(t *testing.T) {
	var gotAuth, gotMethod, gotPath, gotContentType string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotContentType = r.Header.Get("Content-Type")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		writeCFSuccess(w, sampleLiveInput())
	}))
	defer srv.Close()

	c, _ := newTestClient(t, srv)
	li, err := c.Create(context.Background(), map[string]string{"stream_id": "s-1"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if li == nil || li.UID != "abc123" {
		t.Fatalf("unexpected live input: %+v", li)
	}
	if gotMethod != "POST" {
		t.Errorf("method = %q, want POST", gotMethod)
	}
	if !strings.HasSuffix(gotPath, "/accounts/test-account/stream/live_inputs") {
		t.Errorf("path = %q", gotPath)
	}
	if gotAuth != "Bearer test-token-from-config" {
		t.Errorf("auth = %q (bearer MUST come from *Config)", gotAuth)
	}
	if gotContentType != "application/json" {
		t.Errorf("content-type = %q", gotContentType)
	}
	// AC: CF Stream API requires requireSignedURLs to live UNDER `recording`,
	// NOT at the top level of the request body. T-S1-11 verifies the nested
	// location to catch any regression that re-introduces the flag at top level.
	if _, leaked := gotBody["requireSignedURLs"]; leaked {
		t.Errorf("requireSignedURLs must NOT be at top level — CF rejects that shape; got body=%+v", gotBody)
	}
	rec, _ := gotBody["recording"].(map[string]any)
	if rec == nil {
		t.Fatalf("recording block missing: body=%+v", gotBody)
	}
	if v, ok := rec["requireSignedURLs"].(bool); !ok || !v {
		t.Errorf("recording.requireSignedURLs = %v, want true", rec["requireSignedURLs"])
	}
}

// ---- T-S1-02 ----------------------------------------------------------------
func TestCreateLiveInput_Unauthorized_Returns401Typed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad token", http.StatusUnauthorized)
	}))
	defer srv.Close()
	c, _ := newTestClient(t, srv)

	_, err := c.Create(context.Background(), nil)
	if err == nil {
		t.Fatal("expected error")
	}
	var cfErr *CFError
	if !errors.As(err, &cfErr) {
		t.Fatalf("err not *CFError: %T", err)
	}
	if cfErr.Code != 401 || cfErr.Type != "unauthorized" {
		t.Errorf("got %+v", cfErr)
	}
}

// ---- T-S1-03 ----------------------------------------------------------------
func TestCreateLiveInput_RateLimited_RetriesThenFails(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		http.Error(w, "slow down", http.StatusTooManyRequests)
	}))
	defer srv.Close()
	c, slept := newTestClient(t, srv)

	_, err := c.Create(context.Background(), nil)
	if err == nil {
		t.Fatal("expected error")
	}
	var cfErr *CFError
	if !errors.As(err, &cfErr) || cfErr.Code != 429 {
		t.Fatalf("want 429 *CFError, got %v", err)
	}
	if atomic.LoadInt32(&calls) != 3 {
		t.Errorf("calls = %d, want 3 (maxRetry)", calls)
	}
	if atomic.LoadInt32(slept) < 2 {
		t.Errorf("sleep invocations = %d, want >= 2", *slept)
	}
}

// ---- T-S1-04 ----------------------------------------------------------------
func TestCreateLiveInput_ServerError_RetriesThenFails(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	c, _ := newTestClient(t, srv)

	_, err := c.Create(context.Background(), nil)
	var cfErr *CFError
	if !errors.As(err, &cfErr) || cfErr.Code != 500 {
		t.Fatalf("want 500, got %v", err)
	}
	if atomic.LoadInt32(&calls) != 3 {
		t.Errorf("calls = %d, want 3", calls)
	}
}

// ---- T-S1-05 ----------------------------------------------------------------
func TestCreateLiveInput_NetworkFailure_ReturnsErrCFNetwork(t *testing.T) {
	// Point at an unreachable address — immediate connection error
	cfg := &Config{AccountID: "x", APIToken: "t"}
	hc := NewHTTPClient(cfg, "http://127.0.0.1:1") // port 1 typically refused
	hc.sleep = func(time.Duration) {}
	hc.http.Timeout = 500 * time.Millisecond
	c := &cfLiveInputClient{cfg: cfg, c: hc}

	_, err := c.Create(context.Background(), nil)
	if err == nil {
		t.Fatal("expected error")
	}
	if !errors.Is(err, ErrCFNetwork) {
		t.Errorf("err = %v, want ErrCFNetwork", err)
	}
}

// ---- T-S1-06 ----------------------------------------------------------------
func TestUpdateLiveInput_PatchesCorrectly(t *testing.T) {
	var gotMethod, gotPath string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		writeCFSuccess(w, sampleLiveInput())
	}))
	defer srv.Close()
	c, _ := newTestClient(t, srv)

	origins := []string{"https://a.example"}
	_, err := c.Update(context.Background(), "abc123", LiveInputPatch{
		Recording: &RecordingConfig{AllowedOrigins: origins},
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if gotMethod != "PUT" {
		t.Errorf("method = %q, want PUT", gotMethod)
	}
	if !strings.HasSuffix(gotPath, "/live_inputs/abc123") {
		t.Errorf("path = %q", gotPath)
	}
	rec, _ := gotBody["recording"].(map[string]any)
	if rec == nil {
		t.Fatalf("recording block missing: %+v", gotBody)
	}
	got, _ := json.Marshal(rec["allowedOrigins"])
	want, _ := json.Marshal(origins)
	if string(got) != string(want) {
		t.Errorf("recording.allowedOrigins = %s, want %s", got, want)
	}
	// Top-level requireSignedURLs/allowedOrigins must never be present.
	if _, ok := gotBody["requireSignedURLs"]; ok {
		t.Errorf("requireSignedURLs leaked to top level of patch")
	}
	if _, ok := gotBody["allowedOrigins"]; ok {
		t.Errorf("allowedOrigins leaked to top level of patch")
	}
}

// ---- T-S1-07 ----------------------------------------------------------------
func TestDisableLiveInput_HappyPath(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		writeCFSuccess(w, sampleLiveInput())
	}))
	defer srv.Close()
	c, _ := newTestClient(t, srv)

	if err := c.Disable(context.Background(), "abc123"); err != nil {
		t.Fatalf("Disable: %v", err)
	}
	rec, _ := gotBody["recording"].(map[string]any)
	if rec == nil || rec["mode"] != "off" {
		t.Errorf("recording.mode = %v, want 'off' — body=%+v", rec, gotBody)
	}
}

// ---- T-S1-08 ----------------------------------------------------------------
func TestDeleteLiveInput_TreatsNotFoundAsSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "gone", http.StatusNotFound)
	}))
	defer srv.Close()
	c, _ := newTestClient(t, srv)

	if err := c.Delete(context.Background(), "abc123"); err != nil {
		t.Errorf("Delete should tolerate 404, got %v", err)
	}
}

// ---- T-S1-09 ----------------------------------------------------------------
func TestGetLiveInput_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("method = %s, want GET", r.Method)
		}
		writeCFSuccess(w, sampleLiveInput())
	}))
	defer srv.Close()
	c, _ := newTestClient(t, srv)

	li, err := c.Get(context.Background(), "abc123")
	if err != nil || li == nil || li.UID != "abc123" {
		t.Fatalf("li=%+v err=%v", li, err)
	}
}

// ---- T-S1-10 ----------------------------------------------------------------
func TestHTTPClient_ExponentialBackoff(t *testing.T) {
	var delays []time.Duration
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "tmr", http.StatusTooManyRequests)
	}))
	defer srv.Close()
	cfg := &Config{AccountID: "x", APIToken: "t"}
	hc := NewHTTPClient(cfg, srv.URL)
	hc.sleep = func(d time.Duration) { delays = append(delays, d) }
	c := &cfLiveInputClient{cfg: cfg, c: hc}

	_, _ = c.Create(context.Background(), nil)
	if len(delays) != 2 {
		t.Fatalf("sleep count = %d, want 2 (attempts 2 and 3)", len(delays))
	}
	if !(delays[1] > delays[0]) {
		t.Errorf("delays not monotonically increasing: %v", delays)
	}
}

// ---- T-S1-11 (covered alongside T-S1-01 but made explicit) ------------------
func TestCreate_AlwaysSetsRequireSignedURLs(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		writeCFSuccess(w, sampleLiveInput())
	}))
	defer srv.Close()
	c, _ := newTestClient(t, srv)
	_, _ = c.Create(context.Background(), nil)

	if _, leaked := gotBody["requireSignedURLs"]; leaked {
		t.Error("requireSignedURLs must NOT be at top level — CF expects it under recording")
	}
	rec, _ := gotBody["recording"].(map[string]any)
	if v, _ := rec["requireSignedURLs"].(bool); !v {
		t.Error("recording.requireSignedURLs must be true")
	}
}

// ---- T-S1-12 — bearer sourced from Config, never hardcoded -----------------
func TestCreate_BearerSourcedFromConfig_NotHardcoded(t *testing.T) {
	cases := []string{"tok-A", "tok-B", "tok-C"}
	for _, tok := range cases {
		var gotAuth string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotAuth = r.Header.Get("Authorization")
			writeCFSuccess(w, sampleLiveInput())
		}))
		cfg := &Config{AccountID: "a", APIToken: tok}
		hc := NewHTTPClient(cfg, srv.URL)
		hc.sleep = func(time.Duration) {}
		c := &cfLiveInputClient{cfg: cfg, c: hc}
		_, err := c.Create(context.Background(), nil)
		srv.Close()
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		want := fmt.Sprintf("Bearer %s", tok)
		if gotAuth != want {
			t.Errorf("auth = %q, want %q", gotAuth, want)
		}
	}
}
