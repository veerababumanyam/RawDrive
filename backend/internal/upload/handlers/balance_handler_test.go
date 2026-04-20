package handlers_test

// M40 / Upload Credit Meter — balance handler tests (R3 RED-first).
//
// Mirrors backend/internal/streaming/handlers/credit_balance_handler_test.go.
// Uses a stub BalanceProvider so the test is decoupled from the
// upload/credit package wiring and the real DB.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	uhandlers "github.com/rawdrive/backend/internal/upload/handlers"
)

type stubUploadBalanceProvider struct {
	view uhandlers.UploadBalanceView
	err  error
}

func (s *stubUploadBalanceProvider) UploadBalance(_ context.Context, _ uuid.UUID) (uhandlers.UploadBalanceView, error) {
	return s.view, s.err
}

func flagOn(string) bool  { return true }
func flagOff(string) bool { return false }

func claims(wsID string) map[string]interface{} {
	return map[string]interface{}{
		"sub":           uuid.New().String(),
		"workspace_id":  wsID,
		"platform_role": "photographer",
	}
}

func newUploadBalanceHandler(view uhandlers.UploadBalanceView) *uhandlers.UploadBalanceHandler {
	return &uhandlers.UploadBalanceHandler{
		Balance:     &stubUploadBalanceProvider{view: view},
		FeatureFlag: flagOn,
	}
}

func TestUploadBalance_Unauthenticated_401(t *testing.T) {
	h := newUploadBalanceHandler(uhandlers.UploadBalanceView{Available: 5000})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/balance", nil)
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d body=%s", rr.Code, rr.Body.String())
	}
}

// M40-API-001: a valid sub claim but missing/malformed workspace_id must
// return 400 WORKSPACE_ID_MISSING — not a zero-credits 200 that masks an
// auth-integration bug as "you're broke". The DB-provider-error zero
// fallback stays intact for transient infra failures (see
// TestUploadBalance_ProviderErrorFallsBackToZero below).
func TestUploadBalance_MissingWorkspaceID_400(t *testing.T) {
	h := newUploadBalanceHandler(uhandlers.UploadBalanceView{Available: 5000})
	// Sub is present but workspace_id is absent from the claim map.
	claimsMap := map[string]interface{}{
		"sub":           uuid.New().String(),
		"platform_role": "photographer",
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsMap))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("missing workspace_id: want 400 got %d body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "WORKSPACE_ID_MISSING") {
		t.Fatalf("expected WORKSPACE_ID_MISSING in body, got: %s", rr.Body.String())
	}
}

func TestUploadBalance_FeatureFlagOff_404(t *testing.T) {
	// Mirrors the streaming/credit feature-gated-404 pattern enshrined in
	// PR #32 — the frontend hook treats 404 as "feature disabled" and
	// stops polling, so toggling the flag must return 404 (not 403/200).
	h := newUploadBalanceHandler(uhandlers.UploadBalanceView{Available: 5000})
	h.FeatureFlag = flagOff
	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims(uuid.New().String())))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("flag off: want 404 got %d", rr.Code)
	}
}

func TestUploadBalance_Returns200_ShapeAndFields(t *testing.T) {
	updated := time.Date(2026, 4, 20, 12, 0, 0, 0, time.UTC)
	h := newUploadBalanceHandler(uhandlers.UploadBalanceView{
		Available:   5000,
		PlanGranted: 5000,
		Purchased:   1000,
		Reserved:    0,
		Consumed:    0,
		Refunded:    0,
		UpdatedAt:   updated,
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims(uuid.New().String())))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Required fields for the frontend pill contract.
	for _, k := range []string{"available_credits", "plan_granted", "purchased", "reserved", "updated_at", "low_balance", "low_balance_threshold"} {
		if _, ok := body[k]; !ok {
			t.Fatalf("missing field %q in body: %v", k, body)
		}
	}
	if got, _ := body["available_credits"].(float64); int(got) != 5000 {
		t.Fatalf("available_credits: want 5000 got %v", body["available_credits"])
	}
	if got, _ := body["low_balance"].(bool); got {
		t.Fatalf("low_balance at 5000: want false got true")
	}
}

func TestUploadBalance_LowBalanceTrue_WhenUnderThreshold(t *testing.T) {
	// Threshold for upload credits defaults to 100 — when available < 100 the
	// pill should show a warning style. This is a UI contract; the server
	// just surfaces the boolean + threshold so the client has a single
	// source of truth.
	h := newUploadBalanceHandler(uhandlers.UploadBalanceView{Available: 50, UpdatedAt: time.Now().UTC()})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims(uuid.New().String())))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	var body map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if low, _ := body["low_balance"].(bool); !low {
		t.Fatalf("low_balance at 50 credits: want true got %v", body["low_balance"])
	}
	if thr, _ := body["low_balance_threshold"].(float64); int(thr) != uhandlers.LowBalanceThresholdCredits {
		t.Fatalf("low_balance_threshold: want %d got %v", uhandlers.LowBalanceThresholdCredits, body["low_balance_threshold"])
	}
}

func TestUploadBalance_ProviderErrorFallsBackToZero(t *testing.T) {
	// If the credit service fails (e.g. DB hiccup) the endpoint degrades to
	// zero-balance rather than 500, matching the streaming credit pattern.
	h := &uhandlers.UploadBalanceHandler{
		Balance: &stubUploadBalanceProvider{
			view: uhandlers.UploadBalanceView{},
			err:  context.DeadlineExceeded,
		},
		FeatureFlag: flagOn,
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims(uuid.New().String())))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 (degraded) got %d", rr.Code)
	}
	var body map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if got, _ := body["available_credits"].(float64); int(got) != 0 {
		t.Fatalf("degraded response: want 0 credits got %v", body["available_credits"])
	}
}
