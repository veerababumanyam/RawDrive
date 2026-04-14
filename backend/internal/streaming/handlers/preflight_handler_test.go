package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/preflight"
)

// ---- fakes ----

type fakePreflightSvc struct {
	mu             sync.Mutex
	sessionOwner   map[uuid.UUID]uuid.UUID // sid -> workspaceID
	startErr       error
	startCount     int
	bandwidthCalls []preflight.BandwidthResult
	obsBody        []byte
	obsErr         error
	testStarted    bool
	testStopped    bool
	verdict        preflight.Verdict
	completeErr    error
	startedAt      time.Time
}

func newFakePreflightSvc() *fakePreflightSvc {
	return &fakePreflightSvc{
		sessionOwner: map[uuid.UUID]uuid.UUID{},
		obsBody: []byte("[output]\nrtmps_url=rtmps://live.example/in\nstream_key=PREFLIGHT-KEY-ONLY\n" +
			"video_bitrate=4200\nresolution=1920x1080\n"),
		verdict: preflight.Verdict{
			Status:          "pass",
			RecommendedTier: "1080p30",
			RecommendedKbps: 4200,
			Reasons:         []string{"uplink healthy"},
		},
	}
}

func (f *fakePreflightSvc) StartSession(_ context.Context, actorID, workspaceID uuid.UUID) (preflight.Session, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.startErr != nil {
		return preflight.Session{}, f.startErr
	}
	f.startCount++
	sid := uuid.New()
	f.sessionOwner[sid] = workspaceID
	return preflight.Session{
		ID:                     sid,
		WorkspaceID:            workspaceID,
		TestBroadcastID:        "preflight-" + sid.String()[:8],
		RTMPSUrl:               "rtmps://preflight.example/in",
		RTMPSKey:               "preflight-key-" + sid.String()[:8],
		ExpiresAt:              time.Now().UTC().Add(60 * time.Second),
		RecommendedBitrateKbps: 4500,
	}, nil
}

func (f *fakePreflightSvc) SessionWorkspace(_ context.Context, sid uuid.UUID) (uuid.UUID, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	ws, ok := f.sessionOwner[sid]
	if !ok {
		return uuid.Nil, preflight.ErrSessionNotFound
	}
	return ws, nil
}

func (f *fakePreflightSvc) RecordBandwidth(_ context.Context, sid uuid.UUID, r preflight.BandwidthResult) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.bandwidthCalls = append(f.bandwidthCalls, r)
	return nil
}

func (f *fakePreflightSvc) GenerateOBSProfile(_ context.Context, sid uuid.UUID) ([]byte, string, error) {
	if f.obsErr != nil {
		return nil, "", f.obsErr
	}
	return f.obsBody, "rawdrive-obs-1080p30.ini", nil
}

func (f *fakePreflightSvc) StartTestBroadcast(_ context.Context, sid uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.testStarted = true
	f.startedAt = time.Now().UTC()
	return nil
}

func (f *fakePreflightSvc) StopTestBroadcast(_ context.Context, sid uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.testStopped = true
	return nil
}

func (f *fakePreflightSvc) CompleteSession(_ context.Context, sid uuid.UUID) (preflight.Verdict, error) {
	if f.completeErr != nil {
		return preflight.Verdict{}, f.completeErr
	}
	return f.verdict, nil
}

// ---- harness ----

func mountPreflightRouter(h *PreflightHandler) http.Handler {
	r := chi.NewRouter()
	r.Route("/api/v1/streams/preflight", func(r chi.Router) {
		r.Post("/start", h.Start)
		r.Post("/{sid}/bandwidth", h.Bandwidth)
		r.Get("/{sid}/obs-profile", h.OBSProfile)
		r.Post("/{sid}/test-broadcast/start", h.TestBroadcastStart)
		r.Post("/{sid}/test-broadcast/stop", h.TestBroadcastStop)
		r.Post("/{sid}/complete", h.Complete)
	})
	return r
}

func newPreflightHandlerForTest(svc PreflightService, flagOn bool) *PreflightHandler {
	h := NewPreflightHandler(svc)
	if flagOn {
		h.FeatureFlag = func() bool { return true }
	} else {
		h.FeatureFlag = func() bool { return false }
	}
	return h
}

func authCtx(wsID uuid.UUID) context.Context {
	return middleware.WithJWTClaims(context.Background(), map[string]interface{}{
		"sub":           uuid.New().String(),
		"workspace_id":  wsID.String(),
		"platform_role": "photographer",
	})
}

func doJSON(t *testing.T, router http.Handler, method, path string, ctx context.Context, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	if ctx != nil {
		req = req.WithContext(ctx)
	}
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

// ---- tests ----

func TestPreflightStart_Unauthenticated_401(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", context.Background(), nil)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d", rr.Code)
	}
}

func TestPreflightStart_Success_201_ReturnsSessionID(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", authCtx(ws), nil)
	if rr.Code != http.StatusCreated {
		t.Fatalf("want 201 got %d body=%s", rr.Code, rr.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &resp)
	if _, ok := resp["sessionId"].(string); !ok {
		t.Fatalf("missing sessionId in body: %s", rr.Body.String())
	}
	if _, ok := resp["rtmpsUrl"].(string); !ok {
		t.Fatalf("missing rtmpsUrl: %s", rr.Body.String())
	}
}

func TestPreflightStart_RateLimitExceeded_429(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	ctx := authCtx(ws)
	if rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", ctx, nil); rr.Code != http.StatusCreated {
		t.Fatalf("first call: want 201 got %d", rr.Code)
	}
	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", ctx, nil)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("second call within 60s: want 429 got %d", rr.Code)
	}
}

func TestPreflightBandwidth_UnknownSession_404(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	sid := uuid.New()
	body := preflight.BandwidthResult{UplinkKbps: 5000, DownlinkKbps: 10000, JitterMs: 12, LossPct: 0.2, Source: "xhr"}
	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/"+sid.String()+"/bandwidth", authCtx(uuid.New()), body)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("want 404 got %d", rr.Code)
	}
}

func TestPreflightBandwidth_NonOwnerSession_404(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	// start session belonging to ws
	startRR := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", authCtx(ws), nil)
	var sresp map[string]any
	_ = json.Unmarshal(startRR.Body.Bytes(), &sresp)
	sid := sresp["sessionId"].(string)
	// now a different ws calls
	other := uuid.New()
	body := preflight.BandwidthResult{UplinkKbps: 5000}
	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/"+sid+"/bandwidth", authCtx(other), body)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("want 404 got %d", rr.Code)
	}
}

func TestPreflightBandwidth_ValidPayload_200_StoresResult(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	startRR := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", authCtx(ws), nil)
	var sresp map[string]any
	_ = json.Unmarshal(startRR.Body.Bytes(), &sresp)
	sid := sresp["sessionId"].(string)
	body := preflight.BandwidthResult{UplinkKbps: 6000, DownlinkKbps: 20000, JitterMs: 10, LossPct: 0.1, Source: "xhr"}
	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/"+sid+"/bandwidth", authCtx(ws), body)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	if len(svc.bandwidthCalls) != 1 {
		t.Fatalf("want 1 bandwidth call got %d", len(svc.bandwidthCalls))
	}
	if svc.bandwidthCalls[0].UplinkKbps != 6000 {
		t.Fatalf("payload not forwarded: %+v", svc.bandwidthCalls[0])
	}
}

func TestPreflightOBSProfile_ReturnsIniFile_ContentTypeTextPlain_NoLeakProductionKeys(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	startRR := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", authCtx(ws), nil)
	var sresp map[string]any
	_ = json.Unmarshal(startRR.Body.Bytes(), &sresp)
	sid := sresp["sessionId"].(string)

	rr := doJSON(t, router, http.MethodGet, "/api/v1/streams/preflight/"+sid+"/obs-profile", authCtx(ws), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rr.Code)
	}
	ct := rr.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/plain") {
		t.Fatalf("Content-Type: want text/plain got %q", ct)
	}
	cd := rr.Header().Get("Content-Disposition")
	if !strings.Contains(cd, "attachment") || !strings.Contains(cd, ".ini") {
		t.Fatalf("Content-Disposition: want attachment .ini got %q", cd)
	}
	body := rr.Body.String()
	// Must not leak anything that looks like a production stream key marker.
	if strings.Contains(body, "PRODUCTION") || strings.Contains(body, "streams.stream_key") {
		t.Fatalf("OBS body appears to leak production keys: %s", body)
	}
}

func TestPreflightTestBroadcastStart_Success_201_IsolatedCFName(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	startRR := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", authCtx(ws), nil)
	var sresp map[string]any
	_ = json.Unmarshal(startRR.Body.Bytes(), &sresp)
	sid := sresp["sessionId"].(string)
	tbID := sresp["testBroadcastId"].(string)
	if !strings.HasPrefix(tbID, "preflight-") {
		t.Fatalf("CF testBroadcastId must start with 'preflight-', got %q", tbID)
	}

	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/"+sid+"/test-broadcast/start", authCtx(ws), nil)
	if rr.Code != http.StatusCreated {
		t.Fatalf("want 201 got %d body=%s", rr.Code, rr.Body.String())
	}
	if !svc.testStarted {
		t.Fatalf("service StartTestBroadcast not called")
	}
}

func TestPreflightTestBroadcastStop_Success_200(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	startRR := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", authCtx(ws), nil)
	var sresp map[string]any
	_ = json.Unmarshal(startRR.Body.Bytes(), &sresp)
	sid := sresp["sessionId"].(string)

	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/"+sid+"/test-broadcast/stop", authCtx(ws), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rr.Code)
	}
	if !svc.testStopped {
		t.Fatalf("service StopTestBroadcast not called")
	}
}

func TestPreflightComplete_Success_200_ReturnsVerdict(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	startRR := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", authCtx(ws), nil)
	var sresp map[string]any
	_ = json.Unmarshal(startRR.Body.Bytes(), &sresp)
	sid := sresp["sessionId"].(string)

	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/"+sid+"/complete", authCtx(ws), nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	var v map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &v)
	status, _ := v["status"].(string)
	if status != "pass" && status != "warn" && status != "fail" {
		t.Fatalf("verdict status must be pass|warn|fail, got %v", v["status"])
	}
	if _, ok := v["recommendedTier"].(string); !ok {
		t.Fatalf("missing recommendedTier: %s", rr.Body.String())
	}
	if _, ok := v["reasons"]; !ok {
		t.Fatalf("missing reasons: %s", rr.Body.String())
	}
}

func TestPreflightComplete_CompleteErrorSurfaces500(t *testing.T) {
	svc := newFakePreflightSvc()
	svc.completeErr = errors.New("boom")
	h := newPreflightHandlerForTest(svc, true)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	startRR := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/start", authCtx(ws), nil)
	var sresp map[string]any
	_ = json.Unmarshal(startRR.Body.Bytes(), &sresp)
	sid := sresp["sessionId"].(string)
	rr := doJSON(t, router, http.MethodPost, "/api/v1/streams/preflight/"+sid+"/complete", authCtx(ws), nil)
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("want 500 got %d", rr.Code)
	}
}

func TestPreflightFeatureFlagOff_404(t *testing.T) {
	svc := newFakePreflightSvc()
	h := newPreflightHandlerForTest(svc, false)
	router := mountPreflightRouter(h)
	ws := uuid.New()
	ctx := authCtx(ws)

	paths := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/api/v1/streams/preflight/start"},
		{http.MethodPost, "/api/v1/streams/preflight/" + uuid.New().String() + "/bandwidth"},
		{http.MethodGet, "/api/v1/streams/preflight/" + uuid.New().String() + "/obs-profile"},
		{http.MethodPost, "/api/v1/streams/preflight/" + uuid.New().String() + "/test-broadcast/start"},
		{http.MethodPost, "/api/v1/streams/preflight/" + uuid.New().String() + "/test-broadcast/stop"},
		{http.MethodPost, "/api/v1/streams/preflight/" + uuid.New().String() + "/complete"},
	}
	for _, p := range paths {
		rr := doJSON(t, router, p.method, p.path, ctx, nil)
		if rr.Code != http.StatusNotFound {
			t.Fatalf("flag off %s %s: want 404 got %d", p.method, p.path, rr.Code)
		}
	}
}
