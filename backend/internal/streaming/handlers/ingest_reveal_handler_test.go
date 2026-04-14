// Tests for M34 Round 3 / story 34-4 — T-30 ingest-reveal HTTP handler.
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// ---------- test doubles ----------

type fakeRevealService struct {
	mu       sync.Mutex
	calls    int
	lastUser uuid.UUID
	lastIP   string
	lastUA   string
	lastWS   uuid.UUID
	lastStrm uuid.UUID
	result   *RevealResult
	err      error
}

func (f *fakeRevealService) Reveal(ctx context.Context, streamID, workspaceID, userID uuid.UUID, ip, ua string) (*RevealResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.lastStrm, f.lastWS, f.lastUser, f.lastIP, f.lastUA = streamID, workspaceID, userID, ip, ua
	return f.result, f.err
}

type fakeFeatureFlag struct {
	enabled bool
}

func (f *fakeFeatureFlag) IsEnabled(ctx context.Context, ws uuid.UUID) (bool, string) {
	return f.enabled, "test"
}

type fakeLimiter struct {
	mu      sync.Mutex
	allow   bool
	calls   int
	lastKey string
}

func (l *fakeLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.calls++
	l.lastKey = key
	return l.allow
}

// ---------- helpers ----------

func newRevealReq(streamID string, claims map[string]interface{}) (*httptest.ResponseRecorder, *http.Request) {
	path := "/api/v1/streams/" + streamID + "/ingest/reveal"
	req := httptest.NewRequest(http.MethodPost, path, nil)
	req.Header.Set("User-Agent", "go-test/1.0")
	req.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")
	if claims != nil {
		req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
	}
	return httptest.NewRecorder(), req
}

func newRevealHandler(svc *fakeRevealService, ff *fakeFeatureFlag, lim *fakeLimiter) *IngestRevealHandler {
	return &IngestRevealHandler{Reveal: svc, FeatureFlag: ff, RateLimiter: lim}
}

// ---------- tests ----------

func TestIngestReveal_Unauthenticated_401(t *testing.T) {
	svc := &fakeRevealService{}
	h := newRevealHandler(svc, &fakeFeatureFlag{enabled: true}, &fakeLimiter{allow: true})
	rr, req := newRevealReq(uuid.NewString(), nil)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d body=%s", rr.Code, rr.Body.String())
	}
	if svc.calls != 0 {
		t.Fatalf("service must not be called when unauthenticated")
	}
}

func TestIngestReveal_NonOwner_404(t *testing.T) {
	svc := &fakeRevealService{err: ErrStreamNotFound}
	h := newRevealHandler(svc, &fakeFeatureFlag{enabled: true}, &fakeLimiter{allow: true})
	rr, req := newRevealReq(uuid.NewString(), claimsFor(uuid.NewString(), "photographer"))
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-workspace: want 404 got %d body=%s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "stream_key") {
		t.Fatalf("error body must not mention stream_key: %s", rr.Body.String())
	}
}

func TestIngestReveal_BeforeT30_403_NoAuditRow(t *testing.T) {
	svc := &fakeRevealService{err: ErrOutsideRevealWindow}
	h := newRevealHandler(svc, &fakeFeatureFlag{enabled: true}, &fakeLimiter{allow: true})
	rr, req := newRevealReq(uuid.NewString(), claimsFor(uuid.NewString(), "photographer"))
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("pre T-30: want 403 got %d body=%s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "rtmp") || strings.Contains(rr.Body.String(), "stream_key") {
		t.Fatalf("403 body must not carry creds: %s", rr.Body.String())
	}
}

func TestIngestReveal_AfterStreamEnd_403(t *testing.T) {
	svc := &fakeRevealService{err: ErrStreamEnded}
	h := newRevealHandler(svc, &fakeFeatureFlag{enabled: true}, &fakeLimiter{allow: true})
	rr, req := newRevealReq(uuid.NewString(), claimsFor(uuid.NewString(), "photographer"))
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("post-end: want 403 got %d", rr.Code)
	}
}

func TestIngestReveal_WithinWindow_200_WritesAuditRow_ReturnsCreds(t *testing.T) {
	expires := time.Now().Add(2 * time.Hour).UTC().Truncate(time.Second)
	svc := &fakeRevealService{
		result: &RevealResult{
			RTMPURL:   "rtmps://live.cloudflare.com:443/live/",
			StreamKey: "sk_live_test_ABC",
			ExpiresAt: expires,
		},
	}
	h := newRevealHandler(svc, &fakeFeatureFlag{enabled: true}, &fakeLimiter{allow: true})
	userID := uuid.New()
	wsID := uuid.New().String()
	streamID := uuid.New().String()
	claims := map[string]interface{}{
		"sub":           userID.String(),
		"workspace_id":  wsID,
		"platform_role": "photographer",
	}
	rr, req := newRevealReq(streamID, claims)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if body["rtmp_url"] != "rtmps://live.cloudflare.com:443/live/" {
		t.Fatalf("missing rtmp_url in body: %v", body)
	}
	if body["stream_key"] != "sk_live_test_ABC" {
		t.Fatalf("missing stream_key in body: %v", body)
	}
	if _, ok := body["expires_at"].(string); !ok {
		t.Fatalf("missing expires_at in body: %v", body)
	}
	if svc.calls != 1 {
		t.Fatalf("service calls: want 1 got %d", svc.calls)
	}
	if svc.lastIP != "203.0.113.5" {
		t.Fatalf("client ip: want 203.0.113.5 got %q", svc.lastIP)
	}
	if svc.lastUA != "go-test/1.0" {
		t.Fatalf("user-agent: want go-test/1.0 got %q", svc.lastUA)
	}
	if svc.lastUser != userID {
		t.Fatalf("user id mismatch: want %s got %s", userID, svc.lastUser)
	}
	if svc.lastStrm.String() != streamID {
		t.Fatalf("stream id mismatch: want %s got %s", streamID, svc.lastStrm)
	}
}

func TestIngestReveal_RateLimitExceeded_429(t *testing.T) {
	svc := &fakeRevealService{}
	h := newRevealHandler(svc, &fakeFeatureFlag{enabled: true}, &fakeLimiter{allow: false})
	rr, req := newRevealReq(uuid.NewString(), map[string]interface{}{
		"sub":           uuid.New().String(),
		"workspace_id":  uuid.New().String(),
		"platform_role": "photographer",
	})
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429 got %d", rr.Code)
	}
	if svc.calls != 0 {
		t.Fatalf("service must not be called when rate-limited")
	}
	if rr.Header().Get("Retry-After") == "" {
		t.Fatalf("429 must carry Retry-After header")
	}
}

func TestIngestReveal_FeatureFlagOff_404(t *testing.T) {
	svc := &fakeRevealService{}
	h := newRevealHandler(svc, &fakeFeatureFlag{enabled: false}, &fakeLimiter{allow: true})
	rr, req := newRevealReq(uuid.NewString(), claimsFor(uuid.NewString(), "photographer"))
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("flag off: want 404 got %d", rr.Code)
	}
	if svc.calls != 0 {
		t.Fatalf("service must not be called when flag is off")
	}
}
