package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// RED-phase tests for M34 R3 story 34-3: GET /api/v1/credits/balance alias.

type stubBalanceProvider struct {
	view BalanceView
	err  error
}

func (s *stubBalanceProvider) BalanceForWorkspace(_ context.Context, _ uuid.UUID) (BalanceView, error) {
	return s.view, s.err
}

func flagOn(string) bool  { return true }
func flagOff(string) bool { return false }

func newCreditBalanceHandler(minutes int) *CreditBalanceHandler {
	return &CreditBalanceHandler{
		Balance: &stubBalanceProvider{
			view: BalanceView{
				Minutes:   minutes,
				Seconds:   minutes * 60,
				UpdatedAt: time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC),
			},
		},
		FeatureFlag: flagOn,
	}
}

func TestCreditBalance_Unauthenticated_401(t *testing.T) {
	h := newCreditBalanceHandler(100)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/credits/balance", nil)
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestCreditBalance_Returns200WithExpectedShape(t *testing.T) {
	h := newCreditBalanceHandler(120)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/credits/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(),
		claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, k := range []string{"balance_minutes", "balance_seconds", "updated_at", "low_balance", "low_balance_threshold_minutes"} {
		if _, ok := body[k]; !ok {
			t.Fatalf("missing field %q in body: %v", k, body)
		}
	}
	if thr, _ := body["low_balance_threshold_minutes"].(float64); int(thr) != 30 {
		t.Fatalf("low_balance_threshold_minutes: want 30 got %v", body["low_balance_threshold_minutes"])
	}
}

func TestCreditBalance_LowBalanceTrueWhenUnder30Min(t *testing.T) {
	h := newCreditBalanceHandler(29)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/credits/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(),
		claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rr.Code)
	}
	var body map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if low, _ := body["low_balance"].(bool); !low {
		t.Fatalf("low_balance: want true got %v", body["low_balance"])
	}
}

func TestCreditBalance_LowBalanceFalseWhenOver30Min(t *testing.T) {
	h := newCreditBalanceHandler(30)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/credits/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(),
		claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	var body map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if low, _ := body["low_balance"].(bool); low {
		t.Fatalf("low_balance at 30 min: want false got true")
	}
}

func TestCreditBalance_FeatureFlagOff_404(t *testing.T) {
	h := newCreditBalanceHandler(100)
	h.FeatureFlag = flagOff
	req := httptest.NewRequest(http.MethodGet, "/api/v1/credits/balance", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(),
		claimsFor(uuid.New().String(), "photographer")))
	rr := httptest.NewRecorder()
	h.GetBalance(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("flag off: want 404 got %d", rr.Code)
	}
}
