package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/analytics"
)

// Analytics HTTP tests for M34 baseline + M35 R3 story 35-6 extensions.
// Handler runs in nil-db mode; ?owner encodes stream ownership for unit tests.

func newStubAnalyticsHandler() *AnalyticsHandler {
	return NewAnalyticsHandler(analytics.New(nil), nil)
}

func newStubAnalyticsHandlerWithFlag(enabled bool) *AnalyticsHandler {
	return NewAnalyticsHandler(analytics.New(nil), nil).
		WithFeatureFlag(&fakeFlag{enabled: enabled})
}

func claimsFor(wsID, role string) map[string]interface{} {
	return map[string]interface{}{
		"sub":           uuid.New().String(),
		"workspace_id":  wsID,
		"platform_role": role,
	}
}

// ---------------------------------------------------------------------------
// M34 baseline
// ---------------------------------------------------------------------------

func TestStreamAnalyticsHandler_OwnerSees200ContractShape(t *testing.T) {
	h := newStubAnalyticsHandler()
	streamID := uuid.New()
	ownerWS := uuid.New().String()

	req := httptest.NewRequest(http.MethodGet, "/streams/"+streamID.String()+"/analytics?owner="+ownerWS, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ownerWS, "photographer")))
	rr := httptest.NewRecorder()
	h.StreamAnalytics(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("owner: want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	var m analytics.StreamMetrics
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatalf("contract decode: %v body=%s", err, rr.Body.String())
	}
}

// Cross-workspace returns 404 (anti-enum — never 403, per 35-6 spec §Security).
func TestStreamAnalyticsHandler_CrossWorkspace_404(t *testing.T) {
	h := newStubAnalyticsHandler()
	streamID := uuid.New()
	ownerWS := uuid.New().String()
	otherWS := uuid.New().String()

	req := httptest.NewRequest(http.MethodGet, "/streams/"+streamID.String()+"/analytics?owner="+ownerWS, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(otherWS, "photographer")))
	rr := httptest.NewRecorder()
	h.StreamAnalytics(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-ws: want 404 got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestWorkspaceAnalyticsHandler_MonthRollup(t *testing.T) {
	h := newStubAnalyticsHandler()
	ws := uuid.New().String()

	req := httptest.NewRequest(http.MethodGet, "/workspace/analytics?month=2026-04", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ws, "photographer")))
	rr := httptest.NewRecorder()
	h.WorkspaceAnalytics(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	for _, f := range []string{`"month":"2026-04"`, `"streamsCount"`, `"creditsConsumed"`, `"topStreams"`, `"byDayCredits"`} {
		if !strings.Contains(body, f) {
			t.Errorf("missing field %q in body: %s", f, body)
		}
	}
}

// ---------------------------------------------------------------------------
// 35-6: new coverage
// ---------------------------------------------------------------------------

func TestGetStreamAnalytics_Unauthenticated_401(t *testing.T) {
	h := newStubAnalyticsHandler()
	streamID := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/streams/"+streamID.String()+"/analytics", nil)
	// No WithJWTClaims — context is empty.
	rr := httptest.NewRecorder()
	h.StreamAnalytics(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestGetStreamAnalytics_Success_IncludesNewFields(t *testing.T) {
	h := newStubAnalyticsHandler()
	streamID := uuid.New()
	ownerWS := uuid.New().String()
	req := httptest.NewRequest(http.MethodGet, "/streams/"+streamID.String()+"/analytics?owner="+ownerWS, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ownerWS, "photographer")))
	rr := httptest.NewRecorder()
	h.StreamAnalytics(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	for _, f := range []string{
		`"avgWatchTimeSec"`,
		`"chatMessages"`,
		`"chatMsgsPerMin"`,
		`"reactions"`,
		`"replayViews"`,
		`"conversionBySrc"`,
	} {
		if !strings.Contains(body, f) {
			t.Errorf("missing field %q in body: %s", f, body)
		}
	}
	if got := rr.Header().Get("Cache-Control"); !strings.Contains(got, "max-age=30") {
		t.Errorf("Cache-Control: want max-age=30 got %q", got)
	}
}

func TestGetStreamAnalytics_FeatureFlagOff_404(t *testing.T) {
	h := newStubAnalyticsHandlerWithFlag(false)
	streamID := uuid.New()
	ws := uuid.New().String()
	req := httptest.NewRequest(http.MethodGet, "/streams/"+streamID.String()+"/analytics?owner="+ws, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ws, "photographer")))
	rr := httptest.NewRecorder()
	h.StreamAnalytics(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("flag off: want 404 got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestGetWorkspaceAnalytics_Unauthenticated_401(t *testing.T) {
	h := newStubAnalyticsHandler()
	req := httptest.NewRequest(http.MethodGet, "/workspace/analytics", nil)
	rr := httptest.NewRecorder()
	h.WorkspaceAnalytics(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d", rr.Code)
	}
}

func TestGetWorkspaceAnalytics_Success_IncludesTopPerformers(t *testing.T) {
	h := newStubAnalyticsHandler()
	ws := uuid.New().String()
	req := httptest.NewRequest(http.MethodGet, "/workspace/analytics?month=2026-04", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ws, "photographer")))
	rr := httptest.NewRecorder()
	h.WorkspaceAnalytics(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	var got analytics.WorkspaceMetrics
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v body=%s", err, rr.Body.String())
	}
	if got.Month != "2026-04" {
		t.Errorf("month: want 2026-04 got %q", got.Month)
	}
	if got.TopStreams == nil {
		t.Error("topStreams must be non-nil slice (empty array, not null)")
	}
	if got.ByDayCredits == nil {
		t.Error("byDayCredits must be non-nil slice")
	}
	body := rr.Body.String()
	// TopStream contract must include M35 additive fields.
	for _, f := range []string{`"topStreams"`, `"byDayCredits"`, `"streamsCount"`, `"creditsConsumed"`} {
		if !strings.Contains(body, f) {
			t.Errorf("missing field %q in body: %s", f, body)
		}
	}
}

func TestGetWorkspaceAnalytics_FeatureFlagOff_404(t *testing.T) {
	h := newStubAnalyticsHandlerWithFlag(false)
	ws := uuid.New().String()
	req := httptest.NewRequest(http.MethodGet, "/workspace/analytics", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ws, "photographer")))
	rr := httptest.NewRecorder()
	h.WorkspaceAnalytics(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("flag off: want 404 got %d", rr.Code)
	}
}

func TestGetWorkspaceAnalytics_InvalidMonth_400(t *testing.T) {
	h := newStubAnalyticsHandler()
	ws := uuid.New().String()
	req := httptest.NewRequest(http.MethodGet, "/workspace/analytics?month=2026-13", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ws, "photographer")))
	rr := httptest.NewRecorder()
	h.WorkspaceAnalytics(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("want 400 got %d body=%s", rr.Code, rr.Body.String())
	}
}
