package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
)

func TestStateCheck_WithState(t *testing.T) {
	handler := middleware.RequireState(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{
		"state_id":     "state-uuid-valid",
		"workspace_id": "ws-uuid-valid",
	})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestStateCheck_WithoutState(t *testing.T) {
	handler := middleware.RequireState(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{
		"workspace_id": "ws-uuid-valid",
		// no state_id
	})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code, "missing state should return 403")
}

func TestStateCheck_NullState(t *testing.T) {
	handler := middleware.RequireState(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{
		"state_id":     "",
		"workspace_id": "ws-uuid-valid",
	})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code, "null/empty state should return 403")
}

func TestStateCheck_AfterAuth(t *testing.T) {
	// State check should work after auth middleware has set claims
	authMiddleware := middleware.TenantContext(&mockDBContext{}, &mockAuditLog{})
	stateMiddleware := middleware.RequireState

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Chain: auth -> state -> handler
	handler := authMiddleware(stateMiddleware(inner))

	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{
		"workspace_id": "ws-uuid-chain",
		"state_id":     "state-uuid-chain",
	})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestStateCheck_ExcludesOnboarding(t *testing.T) {
	handler := middleware.RequireState(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Onboarding routes should skip state check
	req := httptest.NewRequest(http.MethodPost, "/onboarding/complete", nil)
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{
		"workspace_id": "ws-uuid-onboard",
		// no state_id — normally would be 403
	})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code, "onboarding routes should skip state check")
}
