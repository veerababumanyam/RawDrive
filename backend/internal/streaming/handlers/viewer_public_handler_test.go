package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// --- test doubles ---------------------------------------------------------

type fakePresenceSrc struct {
	current int
}

func (f *fakePresenceSrc) GetViewerMetrics(_ context.Context, _ uuid.UUID) (*viewer.LiveViewerMetricsShim, error) {
	return &viewer.LiveViewerMetricsShim{Current: f.current, Peak: 999, Unique: 888}, nil
}

type fakeSigner struct {
	url     string
	expires time.Time
}

func (f *fakeSigner) SignPlaybackURL(_ context.Context, _ string, _ time.Duration) (string, time.Time, error) {
	return f.url, f.expires, nil
}

type fakeReplayRepo struct {
	meta *ReplayStreamMeta
	err  error
}

func (f *fakeReplayRepo) LoadReplay(_ context.Context, _ uuid.UUID) (*ReplayStreamMeta, error) {
	if f.err != nil {
		return nil, f.err
	}
	if f.meta == nil {
		return nil, ErrReplayStreamNotFound
	}
	return f.meta, nil
}

type fakeVPFlag struct{ enabled bool }

func (f *fakeVPFlag) IsEnabled(_ context.Context, _ uuid.UUID) (bool, string) {
	return f.enabled, "test"
}

// harness --------------------------------------------------------------

func newVPHarness(t *testing.T, flag bool, repo *fakeReplayRepo, presenceCurrent int, clock time.Time) (*viewer.Service, *ViewerPublicHandler, uuid.UUID, uuid.UUID) {
	t.Helper()
	svc := viewer.NewService(viewer.Config{
		SigningKey:  []byte("0123456789abcdef0123456789abcdef"),
		SlidingTTL:  time.Minute,
		MaxLifetime: time.Hour,
	})
	wsID := uuid.New()
	streamID := uuid.New()

	cache := viewer.NewViewerCountCache(&fakePresenceSrc{current: presenceCurrent}, time.Second, func() time.Time { return clock })
	gate := viewer.NewReplayGate(&fakeSigner{url: "https://cf.example/signed.m3u8", expires: clock.Add(5 * time.Minute)}, 48*time.Hour, func() time.Time { return clock })

	h := NewViewerPublicHandler(cache, gate, svc, repo, &fakeVPFlag{enabled: flag}, wsID, func() time.Time { return clock })
	return svc, h, wsID, streamID
}

func mountVPRouter(h *ViewerPublicHandler) http.Handler {
	r := chi.NewRouter()
	r.Get("/api/v1/public/streams/{id}/viewer-count", h.GetViewerCount)
	r.Get("/api/v1/public/streams/{id}/replay", h.GetReplay)
	return r
}

func issueVPToken(t *testing.T, svc *viewer.Service, streamID uuid.UUID) string {
	t.Helper()
	pair, err := svc.IssueSession(streamID.String(), viewer.AccessLevelOpen)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	return pair.AccessToken
}

func doVPReq(t *testing.T, router http.Handler, path, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

// --- viewer-count --------------------------------------------------------

func TestPublicViewerCount_Success_ReturnsOnlyCurrentAndAsOf(t *testing.T) {
	clock := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	svc, h, _, streamID := newVPHarness(t, true, &fakeReplayRepo{}, 7, clock)
	router := mountVPRouter(h)
	token := issueVPToken(t, svc, streamID)

	rr := doVPReq(t, router, "/api/v1/public/streams/"+streamID.String()+"/viewer-count", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	if strings.Contains(body, "peak") || strings.Contains(body, "unique") {
		t.Fatalf("response leaked owner fields: %s", body)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if c, _ := out["current"].(float64); int(c) != 7 {
		t.Fatalf("current = %v, want 7", out["current"])
	}
	if _, ok := out["as_of"]; !ok {
		t.Fatalf("missing as_of: %v", out)
	}
}

func TestPublicViewerCount_Unauthenticated_401(t *testing.T) {
	clock := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	_, h, _, streamID := newVPHarness(t, true, &fakeReplayRepo{}, 1, clock)
	router := mountVPRouter(h)

	rr := doVPReq(t, router, "/api/v1/public/streams/"+streamID.String()+"/viewer-count", "")
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rr.Code)
	}
}

func TestPublicViewerCount_FeatureFlagOff_404(t *testing.T) {
	clock := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	svc, h, _, streamID := newVPHarness(t, false, &fakeReplayRepo{}, 1, clock)
	router := mountVPRouter(h)
	token := issueVPToken(t, svc, streamID)

	rr := doVPReq(t, router, "/api/v1/public/streams/"+streamID.String()+"/viewer-count", token)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// --- replay -------------------------------------------------------------

func TestPublicReplay_BeforeExpiry_200_ReturnsSignedPlayback(t *testing.T) {
	clock := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	repo := &fakeReplayRepo{meta: &ReplayStreamMeta{
		WorkspaceID:   uuid.New(), // irrelevant for 200 check; handler uses its own ws
		State:         viewer.ReplayAvailable,
		ExpiresAt:     clock.Add(72 * time.Hour),
		ReplayVideoID: "vid-1",
	}}
	svc, h, wsID, streamID := newVPHarness(t, true, repo, 0, clock)
	repo.meta.WorkspaceID = wsID
	router := mountVPRouter(h)
	token := issueVPToken(t, svc, streamID)

	rr := doVPReq(t, router, "/api/v1/public/streams/"+streamID.String()+"/replay", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", rr.Code, rr.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if u, _ := out["playback_url"].(string); u == "" {
		t.Fatalf("missing playback_url: %v", out)
	}
	if _, ok := out["expires_at"]; !ok {
		t.Fatalf("missing expires_at: %v", out)
	}
	// > 48h out → banner_flag must be false
	if bf, _ := out["banner_flag"].(bool); bf {
		t.Fatalf("banner_flag true but expiry >48h out")
	}
}

func TestPublicReplay_AfterExpiry_410(t *testing.T) {
	clock := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	repo := &fakeReplayRepo{meta: &ReplayStreamMeta{
		State:         viewer.ReplayAvailable,
		ExpiresAt:     clock.Add(-time.Hour),
		ReplayVideoID: "vid-1",
	}}
	svc, h, wsID, streamID := newVPHarness(t, true, repo, 0, clock)
	repo.meta.WorkspaceID = wsID
	router := mountVPRouter(h)
	token := issueVPToken(t, svc, streamID)

	rr := doVPReq(t, router, "/api/v1/public/streams/"+streamID.String()+"/replay", token)
	if rr.Code != http.StatusGone {
		t.Fatalf("status = %d, want 410", rr.Code)
	}
}

func TestPublicReplay_48hWindow_IncludesBannerFlag(t *testing.T) {
	clock := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	repo := &fakeReplayRepo{meta: &ReplayStreamMeta{
		State:         viewer.ReplayAvailable,
		ExpiresAt:     clock.Add(24 * time.Hour), // inside 48h warn window
		ReplayVideoID: "vid-1",
	}}
	svc, h, wsID, streamID := newVPHarness(t, true, repo, 0, clock)
	repo.meta.WorkspaceID = wsID
	router := mountVPRouter(h)
	token := issueVPToken(t, svc, streamID)

	rr := doVPReq(t, router, "/api/v1/public/streams/"+streamID.String()+"/replay", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var out map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	if bf, _ := out["banner_flag"].(bool); !bf {
		t.Fatalf("banner_flag = false, want true when expiry within 48h: %v", out)
	}
}

func TestPublicReplay_NotFound_404(t *testing.T) {
	clock := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	repo := &fakeReplayRepo{err: ErrReplayStreamNotFound}
	svc, h, _, streamID := newVPHarness(t, true, repo, 0, clock)
	router := mountVPRouter(h)
	token := issueVPToken(t, svc, streamID)

	rr := doVPReq(t, router, "/api/v1/public/streams/"+streamID.String()+"/replay", token)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body=%s)", rr.Code, rr.Body.String())
	}
}
