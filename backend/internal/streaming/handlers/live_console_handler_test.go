package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// RED-phase shell tests for M34 story 34-6 live console endpoints.
// Coverage matrix per endpoint: Unauthenticated_401, NonOwner_404,
// FeatureFlagOff_404, Authenticated_Owner_200. 7 endpoints × 4 cases = 28 tests.

// --- test doubles ---------------------------------------------------------

type fakeLiveConsoleDeps struct {
	streamID    uuid.UUID
	workspaceID uuid.UUID
}

func (f *fakeLiveConsoleDeps) AssertOwner(_ context.Context, streamID, workspaceID uuid.UUID) (*LiveStreamMeta, error) {
	if f.streamID != streamID || f.workspaceID != workspaceID {
		return nil, ErrLiveStreamNotFound
	}
	return &LiveStreamMeta{ID: streamID, WorkspaceID: workspaceID, Status: "live"}, nil
}

func (f *fakeLiveConsoleDeps) GetIngestHealth(_ context.Context, _ uuid.UUID) (*LiveIngestHealth, error) {
	return &LiveIngestHealth{Connected: true, Status: "connected"}, nil
}

func (f *fakeLiveConsoleDeps) GetViewerMetrics(_ context.Context, _ uuid.UUID) (*LiveViewerMetrics, error) {
	return &LiveViewerMetrics{Current: 1, Peak: 2, Unique: 3}, nil
}

func (f *fakeLiveConsoleDeps) GetWaitingRoomSnapshot(_ context.Context, _ uuid.UUID) (*LiveWaitingRoomSnapshot, error) {
	return &LiveWaitingRoomSnapshot{Title: "t"}, nil
}

func (f *fakeLiveConsoleDeps) Moderate(_ context.Context, _ LiveModerationRequest) error {
	return nil
}

func (f *fakeLiveConsoleDeps) SetSlowMode(_ context.Context, _ uuid.UUID, _ int) error {
	return nil
}

func (f *fakeLiveConsoleDeps) EndStream(_ context.Context, _ uuid.UUID, _ string, _ uuid.UUID) error {
	return nil
}

type fakeLiveFlag struct{ enabled bool }

func (f *fakeLiveFlag) IsEnabled(_ context.Context, _ uuid.UUID) (bool, string) {
	return f.enabled, "test"
}

// --- harness --------------------------------------------------------------

func mountLiveConsoleRouter(h *LiveConsoleHandler) http.Handler {
	r := chi.NewRouter()
	r.Route("/api/v1/streams/{id}", func(r chi.Router) {
		r.Get("/health", h.GetHealth)
		r.Get("/viewers", h.GetViewers)
		r.Get("/chat", h.ChatStream)
		r.Post("/chat/{msgId}/moderate", h.Moderate)
		r.Post("/chat/slow-mode", h.SetSlowMode)
		r.Get("/waiting-room", h.GetWaitingRoom)
		r.Post("/end", h.EndStream)
	})
	return r
}

type liveEndpoint struct {
	name   string
	method string
	path   func(streamID uuid.UUID) string
	body   string
}

func liveEndpoints(streamID uuid.UUID) []liveEndpoint {
	msgID := uuid.New()
	_ = msgID
	return []liveEndpoint{
		{"Health", http.MethodGet, func(id uuid.UUID) string { return "/api/v1/streams/" + id.String() + "/health" }, ""},
		{"Viewers", http.MethodGet, func(id uuid.UUID) string { return "/api/v1/streams/" + id.String() + "/viewers" }, ""},
		{"Chat", http.MethodGet, func(id uuid.UUID) string { return "/api/v1/streams/" + id.String() + "/chat" }, ""},
		{"Moderate", http.MethodPost, func(id uuid.UUID) string {
			return "/api/v1/streams/" + id.String() + "/chat/" + msgID.String() + "/moderate"
		}, `{"action":"delete"}`},
		{"SlowMode", http.MethodPost, func(id uuid.UUID) string { return "/api/v1/streams/" + id.String() + "/chat/slow-mode" }, `{"interval_seconds":5}`},
		{"WaitingRoom", http.MethodGet, func(id uuid.UUID) string { return "/api/v1/streams/" + id.String() + "/waiting-room" }, ""},
		{"End", http.MethodPost, func(id uuid.UUID) string { return "/api/v1/streams/" + id.String() + "/end" }, `{"reason":"manual"}`},
	}
}

func newLiveConsoleHandlerForTest(streamID, workspaceID uuid.UUID, flagOn bool) *LiveConsoleHandler {
	deps := &fakeLiveConsoleDeps{streamID: streamID, workspaceID: workspaceID}
	return NewLiveConsoleHandler(deps, &fakeLiveFlag{enabled: flagOn})
}

func doLive(t *testing.T, h *LiveConsoleHandler, ep liveEndpoint, streamID uuid.UUID, claims map[string]interface{}) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(ep.method, ep.path(streamID), strings.NewReader(ep.body))
	if ep.body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if claims != nil {
		req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
	}
	// Use a ctx with cancel for SSE handler so it returns.
	if ep.name == "Chat" {
		ctx, cancel := context.WithCancel(req.Context())
		cancel()
		req = req.WithContext(ctx)
		if claims != nil {
			req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
		}
	}
	rr := httptest.NewRecorder()
	mountLiveConsoleRouter(h).ServeHTTP(rr, req)
	return rr
}

// --- Unauthenticated_401 --------------------------------------------------

func TestLiveConsole_Unauthenticated_401(t *testing.T) {
	streamID := uuid.New()
	workspaceID := uuid.New()
	h := newLiveConsoleHandlerForTest(streamID, workspaceID, true)
	for _, ep := range liveEndpoints(streamID) {
		t.Run(ep.name, func(t *testing.T) {
			rr := doLive(t, h, ep, streamID, nil)
			if rr.Code != http.StatusUnauthorized {
				t.Fatalf("%s: want 401 got %d body=%s", ep.name, rr.Code, rr.Body.String())
			}
		})
	}
}

// --- NonOwner_404 ---------------------------------------------------------

func TestLiveConsole_NonOwner_404(t *testing.T) {
	streamID := uuid.New()
	ownerWS := uuid.New()
	otherWS := uuid.New()
	h := newLiveConsoleHandlerForTest(streamID, ownerWS, true)
	for _, ep := range liveEndpoints(streamID) {
		t.Run(ep.name, func(t *testing.T) {
			rr := doLive(t, h, ep, streamID, claimsFor(otherWS.String(), "photographer"))
			if rr.Code != http.StatusNotFound {
				t.Fatalf("%s: cross-ws want 404 got %d body=%s", ep.name, rr.Code, rr.Body.String())
			}
		})
	}
}

// --- FeatureFlagOff_404 ---------------------------------------------------

func TestLiveConsole_FeatureFlagOff_404(t *testing.T) {
	streamID := uuid.New()
	workspaceID := uuid.New()
	h := newLiveConsoleHandlerForTest(streamID, workspaceID, false)
	for _, ep := range liveEndpoints(streamID) {
		t.Run(ep.name, func(t *testing.T) {
			rr := doLive(t, h, ep, streamID, claimsFor(workspaceID.String(), "photographer"))
			if rr.Code != http.StatusNotFound {
				t.Fatalf("%s: flag off want 404 got %d body=%s", ep.name, rr.Code, rr.Body.String())
			}
		})
	}
}

// --- Authenticated_Owner_200 ---------------------------------------------

func TestLiveConsole_Authenticated_Owner_200(t *testing.T) {
	streamID := uuid.New()
	workspaceID := uuid.New()
	h := newLiveConsoleHandlerForTest(streamID, workspaceID, true)
	for _, ep := range liveEndpoints(streamID) {
		t.Run(ep.name, func(t *testing.T) {
			rr := doLive(t, h, ep, streamID, claimsFor(workspaceID.String(), "photographer"))
			if rr.Code != http.StatusOK {
				t.Fatalf("%s: owner want 200 got %d body=%s", ep.name, rr.Code, rr.Body.String())
			}
			if ep.name == "Chat" {
				if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
					t.Fatalf("Chat Content-Type: want text/event-stream got %q", ct)
				}
			}
		})
	}
}
