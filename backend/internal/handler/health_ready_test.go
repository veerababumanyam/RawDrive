package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestReady_NotReadyWithoutPool verifies the readiness gate fails closed: with
// no database pool it must return 503 not_ready, never 200. This is the
// property the deploy pipeline and load balancer rely on.
func TestReady_NotReadyWithoutPool(t *testing.T) {
	h := NewHealthHandler(nil, nil, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)

	h.Ready(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}
	var body DeepHealthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON body: %v", err)
	}
	if body.Status != "not_ready" {
		t.Errorf("status = %q, want not_ready", body.Status)
	}
	if got := body.Components["database"].Status; got != "unhealthy" {
		t.Errorf("database component = %q, want unhealthy", got)
	}
}

// TestPingerInterfaceShape is a compile-time guard that NATSPinger and
// ValkeyPinger stay shaped as Ping(ctx) error, so the main.go type assertion
// against *events.NATSPublisher keeps working.
func TestPingerInterfaceShape(t *testing.T) {
	var _ NATSPinger = fakePinger{}
	var _ ValkeyPinger = fakePinger{}
}

type fakePinger struct{}

func (fakePinger) Ping(_ context.Context) error { return nil }
