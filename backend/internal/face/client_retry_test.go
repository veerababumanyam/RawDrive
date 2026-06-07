package face

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// okBody writes a valid one-face response (512-d zeros) the client accepts.
func okBody(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(DetectResponse{
		Faces: []Face{{Bbox: Bbox{W: 10, H: 10}, Embedding: make([]float32, EmbeddingDim), DetScore: 0.9}},
		Model: "buffalo_l",
	})
}

// Transient 503s during cold-start are retried with backoff, then succeed.
func TestDetectAndEmbed_RetriesThenSucceeds(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&calls, 1)
		if n < 3 { // fail the first two attempts
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		okBody(w)
	}))
	defer srv.Close()

	c, _ := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second, MaxRetries: 2, RetryBackoff: time.Millisecond})
	resp, err := c.DetectAndEmbed(context.Background(), []byte("x"), "")
	if err != nil {
		t.Fatalf("expected success after retries, got %v", err)
	}
	if len(resp.Faces) != 1 {
		t.Fatalf("got %d faces, want 1", len(resp.Faces))
	}
	if got := atomic.LoadInt32(&calls); got != 3 {
		t.Fatalf("expected 3 attempts (1 + 2 retries), got %d", got)
	}
}

// Persistent 503 exhausts retries and surfaces ErrServiceUnavailable.
func TestDetectAndEmbed_ExhaustsRetriesOn503(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c, _ := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second, MaxRetries: 2, RetryBackoff: time.Millisecond})
	_, err := c.DetectAndEmbed(context.Background(), []byte("x"), "")
	if err != ErrServiceUnavailable {
		t.Fatalf("got %v, want ErrServiceUnavailable", err)
	}
	if got := atomic.LoadInt32(&calls); got != 3 {
		t.Fatalf("expected 3 attempts, got %d", got)
	}
}

// 4xx is a terminal client error — never retried.
func TestDetectAndEmbed_NoRetryOn4xx(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		http.Error(w, "bad request", http.StatusBadRequest)
	}))
	defer srv.Close()

	c, _ := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second, MaxRetries: 3, RetryBackoff: time.Millisecond})
	if _, err := c.DetectAndEmbed(context.Background(), []byte("x"), ""); err == nil {
		t.Fatal("expected error on 400")
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("4xx must not be retried; got %d attempts", got)
	}
}

// 502/504 gateway errors are transient and retried.
func TestDetectAndEmbed_RetriesOnGatewayError(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			http.Error(w, "bad gateway", http.StatusBadGateway)
			return
		}
		okBody(w)
	}))
	defer srv.Close()

	c, _ := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second, MaxRetries: 2, RetryBackoff: time.Millisecond})
	if _, err := c.DetectAndEmbed(context.Background(), []byte("x"), ""); err != nil {
		t.Fatalf("expected success after gateway retry, got %v", err)
	}
	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Fatalf("expected 2 attempts, got %d", got)
	}
}

func TestDetectAndEmbed_ExhaustedGatewayErrorIsUnavailable(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		http.Error(w, "bad gateway", http.StatusBadGateway)
	}))
	defer srv.Close()

	c, _ := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second, MaxRetries: 2, RetryBackoff: time.Millisecond})
	_, err := c.DetectAndEmbed(context.Background(), []byte("x"), "")
	if !errors.Is(err, ErrServiceUnavailable) {
		t.Fatalf("got %v, want ErrServiceUnavailable", err)
	}
	if got := atomic.LoadInt32(&calls); got != 3 {
		t.Fatalf("expected 3 attempts, got %d", got)
	}
}

// MaxRetries:-1 disables retries — a single attempt, no backoff.
func TestDetectAndEmbed_RetriesDisabled(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c, _ := NewClient(Config{BaseURL: srv.URL, Timeout: 5 * time.Second, MaxRetries: -1})
	_, err := c.DetectAndEmbed(context.Background(), []byte("x"), "")
	if err != ErrServiceUnavailable {
		t.Fatalf("got %v, want ErrServiceUnavailable", err)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("retries disabled → 1 attempt, got %d", got)
	}
}
