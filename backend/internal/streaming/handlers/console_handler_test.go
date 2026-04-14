package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// Fake store for console handler tests.
type fakeConsoleStore struct {
	stream          *ConsoleStream
	revealAuditRows int
	loadErr         error
}

func (f *fakeConsoleStore) LoadStreamForOwner(_ context.Context, streamID, workspaceID uuid.UUID) (*ConsoleStream, error) {
	if f.loadErr != nil {
		return nil, f.loadErr
	}
	if f.stream == nil {
		return nil, ErrStreamNotFound
	}
	if f.stream.WorkspaceID != workspaceID {
		return nil, ErrStreamNotFound
	}
	if f.stream.ID != streamID {
		return nil, ErrStreamNotFound
	}
	return f.stream, nil
}

func (f *fakeConsoleStore) CountRevealAudit(_ context.Context, _ uuid.UUID, _ uuid.UUID) (int, error) {
	return f.revealAuditRows, nil
}

type fakeFlag struct{ enabled bool }

func (f *fakeFlag) IsEnabled(_ context.Context, _ uuid.UUID) (bool, string) {
	return f.enabled, "test"
}

func mountConsoleRouter(h *ConsoleHandler) http.Handler {
	r := chi.NewRouter()
	r.Get("/api/v1/streaming/streams/{id}/console", h.GetConsole)
	return r
}

func newConsoleHandler(store ConsoleStore, ff ConsoleFeatureFlag, now time.Time) *ConsoleHandler {
	return NewConsoleHandler(store, ff, func() time.Time { return now })
}

func TestConsoleGet_Unauthenticated_401(t *testing.T) {
	h := newConsoleHandler(&fakeConsoleStore{}, &fakeFlag{enabled: true}, time.Now())
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/streaming/streams/"+uuid.New().String()+"/console", nil)
	mountConsoleRouter(h).ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d", rr.Code)
	}
}

func TestConsoleGet_NonOwner_404(t *testing.T) {
	owner := uuid.New()
	other := uuid.New()
	streamID := uuid.New()
	store := &fakeConsoleStore{
		stream: &ConsoleStream{ID: streamID, WorkspaceID: owner, Title: "t",
			StartAt: time.Now().Add(1 * time.Hour), EndAt: time.Now().Add(2 * time.Hour)},
	}
	h := newConsoleHandler(store, &fakeFlag{enabled: true}, time.Now())

	req := httptest.NewRequest(http.MethodGet, "/api/v1/streaming/streams/"+streamID.String()+"/console", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(other.String(), "photographer")))
	rr := httptest.NewRecorder()
	mountConsoleRouter(h).ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-ws anti-enum: want 404 got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestConsoleGet_Owner_200_ReturnsPayloadShape(t *testing.T) {
	ws := uuid.New()
	streamID := uuid.New()
	now := time.Date(2026, 4, 14, 10, 0, 0, 0, time.UTC)
	store := &fakeConsoleStore{
		stream: &ConsoleStream{ID: streamID, WorkspaceID: ws, Title: "t",
			Status:  "scheduled",
			StartAt: now.Add(2 * time.Hour),
			EndAt:   now.Add(3 * time.Hour),
		},
	}
	h := newConsoleHandler(store, &fakeFlag{enabled: true}, now)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/streaming/streams/"+streamID.String()+"/console", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ws.String(), "photographer")))
	rr := httptest.NewRecorder()
	mountConsoleRouter(h).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, k := range []string{"stream_meta", "tabs", "ingest_creds"} {
		if _, ok := payload[k]; !ok {
			t.Errorf("missing key %q in payload: %s", k, rr.Body.String())
		}
	}
	tabs, ok := payload["tabs"].(map[string]any)
	if !ok {
		t.Fatalf("tabs not object")
	}
	for _, tab := range []string{"overview", "setup", "live", "replay", "audit"} {
		if _, ok := tabs[tab]; !ok {
			t.Errorf("missing tab %q", tab)
		}
	}
	if payload["ingest_creds"] != nil {
		t.Errorf("ingest_creds MUST be nil pre-T30, got %v", payload["ingest_creds"])
	}
}

func TestConsoleGet_FeatureFlagOff_404(t *testing.T) {
	ws := uuid.New()
	streamID := uuid.New()
	store := &fakeConsoleStore{
		stream: &ConsoleStream{ID: streamID, WorkspaceID: ws,
			StartAt: time.Now().Add(1 * time.Hour), EndAt: time.Now().Add(2 * time.Hour)},
	}
	h := newConsoleHandler(store, &fakeFlag{enabled: false}, time.Now())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/streaming/streams/"+streamID.String()+"/console", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ws.String(), "photographer")))
	rr := httptest.NewRecorder()
	mountConsoleRouter(h).ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("flag off: want 404 got %d", rr.Code)
	}
}

func TestConsoleGet_WithinT30_IncludesIngestCredentials(t *testing.T) {
	ws := uuid.New()
	streamID := uuid.New()
	now := time.Date(2026, 4, 14, 10, 0, 0, 0, time.UTC)
	store := &fakeConsoleStore{
		stream: &ConsoleStream{
			ID: streamID, WorkspaceID: ws, Title: "t",
			Status:    "scheduled",
			StartAt:   now.Add(10 * time.Minute), // within T-30 window
			EndAt:     now.Add(70 * time.Minute),
			RTMPSURL:  "rtmps://cf.example/live",
			StreamKey: "secret-key-abc",
		},
		revealAuditRows: 1, // user has a prior reveal audit row
	}
	h := newConsoleHandler(store, &fakeFlag{enabled: true}, now)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/streaming/streams/"+streamID.String()+"/console", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ws.String(), "photographer")))
	rr := httptest.NewRecorder()
	mountConsoleRouter(h).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rr.Code)
	}
	var payload map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &payload)
	creds, ok := payload["ingest_creds"].(map[string]any)
	if !ok || creds == nil {
		t.Fatalf("expected ingest_creds within T-30 window; got %v", payload["ingest_creds"])
	}
	if creds["rtmps_url"] != "rtmps://cf.example/live" || creds["stream_key"] != "secret-key-abc" {
		t.Fatalf("cred contents wrong: %+v", creds)
	}
}

// Ensure ErrStreamNotFound is defined.
var _ = errors.New
