package handler_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/handler"
	uploadhandlers "github.com/rawdrive/backend/internal/upload/handlers"
)

// stubBalanceReader lets the admin balance tests run without a real
// upload/credit.Service. Satisfies uploadhandlers.BalanceProvider.
type stubBalanceReader struct {
	view uploadhandlers.UploadBalanceView
	err  error
}

func (s *stubBalanceReader) UploadBalance(_ context.Context, _ uuid.UUID) (uploadhandlers.UploadBalanceView, error) {
	if s.err != nil {
		return uploadhandlers.UploadBalanceView{}, s.err
	}
	return s.view, nil
}

func newAdminHandlerWithBalance(reader uploadhandlers.BalanceProvider) *handler.AdminUploadCreditsHandler {
	h := handler.NewAdminUploadCreditsHandler(nil /* grant svc not used */)
	h.BalanceReader = reader
	return h
}

func chiReqWithWS(method, wsID string) *http.Request {
	r := httptest.NewRequest(method, "/api/v1/admin/workspaces/"+wsID+"/upload-credits/balance", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", wsID)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

func TestAdminBalance_ReturnsFullShape(t *testing.T) {
	wsID := uuid.New()
	view := uploadhandlers.UploadBalanceView{
		Available:   1234,
		PlanGranted: 200,
		Purchased:   500,
		Reserved:    0,
		Consumed:    -66,
		Refunded:    100,
		UpdatedAt:   time.Date(2026, 4, 21, 10, 0, 0, 0, time.UTC),
	}
	h := newAdminHandlerWithBalance(&stubBalanceReader{view: view})

	rec := httptest.NewRecorder()
	h.Balance(rec, chiReqWithWS(http.MethodGet, wsID.String()))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		WorkspaceID         string `json:"workspace_id"`
		AvailableCredits    int64  `json:"available_credits"`
		PlanGranted         int64  `json:"plan_granted"`
		Purchased           int64  `json:"purchased"`
		LowBalance          bool   `json:"low_balance"`
		LowBalanceThreshold int    `json:"low_balance_threshold"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v body=%s", err, rec.Body.String())
	}
	if body.WorkspaceID != wsID.String() {
		t.Errorf("workspace_id echoed wrong: got %q, want %q", body.WorkspaceID, wsID.String())
	}
	if body.AvailableCredits != 1234 {
		t.Errorf("available_credits: got %d, want 1234", body.AvailableCredits)
	}
	if body.PlanGranted != 200 {
		t.Errorf("plan_granted: got %d, want 200", body.PlanGranted)
	}
	if body.Purchased != 500 {
		t.Errorf("purchased: got %d, want 500", body.Purchased)
	}
	if body.LowBalance {
		t.Errorf("low_balance should be false when available=1234")
	}
	if body.LowBalanceThreshold == 0 {
		t.Errorf("low_balance_threshold must be echoed so client isn't hardcoded")
	}
}

func TestAdminBalance_LowBalanceFlag(t *testing.T) {
	wsID := uuid.New()
	h := newAdminHandlerWithBalance(&stubBalanceReader{
		view: uploadhandlers.UploadBalanceView{Available: 42, UpdatedAt: time.Now().UTC()},
	})
	rec := httptest.NewRecorder()
	h.Balance(rec, chiReqWithWS(http.MethodGet, wsID.String()))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"low_balance":true`) {
		t.Errorf("low_balance=true expected when available=42 < threshold: %s", rec.Body.String())
	}
}

func TestAdminBalance_MalformedWorkspaceID_400(t *testing.T) {
	h := newAdminHandlerWithBalance(&stubBalanceReader{})
	rec := httptest.NewRecorder()
	h.Balance(rec, chiReqWithWS(http.MethodGet, "not-a-uuid"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "INVALID_WORKSPACE_ID") {
		t.Errorf("expected structured error code INVALID_WORKSPACE_ID, got %s", rec.Body.String())
	}
}

func TestAdminBalance_ProviderError_500(t *testing.T) {
	// Admin must see errors truthfully — unlike the user-facing pill we
	// do NOT fall back to a zero view, because a hidden zero could lead
	// an admin to grant credits against a workspace whose lookup is
	// actually broken (silent data problem).
	wsID := uuid.New()
	h := newAdminHandlerWithBalance(&stubBalanceReader{err: errors.New("db down")})
	rec := httptest.NewRecorder()
	h.Balance(rec, chiReqWithWS(http.MethodGet, wsID.String()))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 on provider error, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAdminBalance_BalanceReaderUnset_503(t *testing.T) {
	h := handler.NewAdminUploadCreditsHandler(nil /* grant svc unused */)
	// Leaving BalanceReader unset must yield 503 so bootstrap/test call
	// sites without a real service surface the gap instead of crashing.
	rec := httptest.NewRecorder()
	h.Balance(rec, chiReqWithWS(http.MethodGet, uuid.New().String()))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when BalanceReader is unset, got %d body=%s", rec.Code, rec.Body.String())
	}
}
