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

// RED-phase tests for M34 R3 analytics HTTP layer.
// Handler stubs return 501 so every assertion fails.

func newStubAnalyticsHandler() *AnalyticsHandler {
	return NewAnalyticsHandler(analytics.New(nil), nil)
}

func claimsFor(wsID, role string) map[string]interface{} {
	return map[string]interface{}{
		"sub":           uuid.New().String(),
		"workspace_id":  wsID,
		"platform_role": role,
	}
}

// T005 GET /streams/{id}/analytics — owner 200 contract shape; cross-ws 403.
func TestStreamAnalyticsHandler_OwnerSees200ContractShape(t *testing.T) {
	h := newStubAnalyticsHandler()
	streamID := uuid.New()
	ownerWS := uuid.New().String()

	// Owner call. ?owner encodes the stream's workspace for nil-db unit mode.
	req := httptest.NewRequest(http.MethodGet, "/streams/"+streamID.String()+"/analytics?owner="+ownerWS, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ownerWS, "photographer")))
	rr := httptest.NewRecorder()
	h.StreamAnalytics(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("owner: want 200 got %d", rr.Code)
	}
	var m analytics.StreamMetrics
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatalf("contract shape decode: %v body=%s", err, rr.Body.String())
	}
}

func TestStreamAnalyticsHandler_CrossWorkspaceForbidden(t *testing.T) {
	h := newStubAnalyticsHandler()
	streamID := uuid.New()
	ownerWS := uuid.New().String()
	otherWS := uuid.New().String()

	req := httptest.NewRequest(http.MethodGet, "/streams/"+streamID.String()+"/analytics?owner="+ownerWS, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(otherWS, "photographer")))
	rr := httptest.NewRecorder()
	h.StreamAnalytics(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("cross-ws: want 403 got %d", rr.Code)
	}
}

// T006 GET /workspace/analytics?month=YYYY-MM → WorkspaceMetrics fields.
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
