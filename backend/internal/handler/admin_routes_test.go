package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
)

// ──────────────────────── Route Registration ────────────────────────

func setupFullAdminRouter() *chi.Mux {
	r := chi.NewRouter()
	RegisterAdminRoutes(r, AdminDeps{})
	return r
}

func TestAdminRoutes_AllEndpointsRegistered(t *testing.T) {
	r := setupFullAdminRouter()

	expected := []string{
		"GET /api/v1/admin/users",
		"GET /api/v1/admin/users/{id}",
		"POST /api/v1/admin/users/{id}/suspend",
		"POST /api/v1/admin/users/{id}/reactivate",
		"POST /api/v1/admin/users/{id}/impersonate",
		"PUT /api/v1/admin/users/{id}/role",
		"GET /api/v1/admin/moderation",
		"PUT /api/v1/admin/moderation/{id}/approve",
		"PUT /api/v1/admin/moderation/{id}/reject",
		"PUT /api/v1/admin/moderation/{id}/escalate",
		"GET /api/v1/admin/workspaces",
		"GET /api/v1/admin/workspaces/{id}",
		"GET /api/v1/admin/revenue",
		"GET /api/v1/admin/revenue/timeseries",
		"GET /api/v1/admin/revenue/states",
		"GET /api/v1/admin/analytics/engagement",
		"GET /api/v1/admin/analytics/growth",
		"GET /api/v1/admin/analytics/features",
		"GET /api/v1/admin/export/users",
		"GET /api/v1/admin/export/revenue",
		"GET /api/v1/admin/system/metrics",
		"GET /api/v1/admin/system/thresholds",
		"GET /api/v1/admin/audit-logs",
		"GET /api/v1/admin/audit-logs/{id}",
	}

	registered := map[string]bool{}
	chi.Walk(r, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		registered[method+" "+route] = true
		return nil
	})

	for _, ep := range expected {
		assert.True(t, registered[ep], "missing route: %s", ep)
	}
}

// ──────────────────────── Auth Enforcement ────────────────────────

func TestAdminRoutes_UnauthenticatedReturns401(t *testing.T) {
	r := setupFullAdminRouter()

	endpoints := []string{
		"/api/v1/admin/users",
		"/api/v1/admin/moderation",
		"/api/v1/admin/workspaces",
		"/api/v1/admin/revenue",
		"/api/v1/admin/analytics/engagement",
		"/api/v1/admin/system/metrics",
		"/api/v1/admin/audit-logs",
		"/api/v1/admin/export/users",
	}

	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			rr := httptest.NewRecorder()
			r.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, ep, nil))
			assert.Equal(t, http.StatusUnauthorized, rr.Code)
		})
	}
}

func TestAdminRoutes_NonSuperAdminReturns403(t *testing.T) {
	r := setupFullAdminRouter()
	claims := map[string]any{"sub": "user-1", "role": "Owner", "platform_role": "photographer"}

	endpoints := []string{
		"/api/v1/admin/users",
		"/api/v1/admin/moderation",
		"/api/v1/admin/revenue",
		"/api/v1/admin/audit-logs",
	}

	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, ep, nil)
			req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
			rr := httptest.NewRecorder()
			r.ServeHTTP(rr, req)
			assert.Equal(t, http.StatusForbidden, rr.Code)
		})
	}
}

func TestAdminRoutes_DealerRoleReturns403(t *testing.T) {
	r := setupFullAdminRouter()
	claims := map[string]any{"sub": "dealer-1", "role": "Owner", "platform_role": "dealer"}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestAdminRoutes_EmptyRoleReturns403(t *testing.T) {
	r := setupFullAdminRouter()
	claims := map[string]any{"sub": "anon-user"}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// ──────────────────────── Users Handler Input Validation ────────────────────────

func TestAdminUsersHandler_GetByID_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Get("/api/v1/admin/users/{id}", h.GetByID)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users/not-a-uuid", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid user id")
}

func TestAdminUsersHandler_Suspend_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Post("/api/v1/admin/users/{id}/suspend", h.Suspend)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/bad-id/suspend",
		strings.NewReader(`{"reason":"test"}`))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid user id")
}

func TestAdminUsersHandler_Suspend_MissingReason(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Post("/api/v1/admin/users/{id}/suspend", h.Suspend)

	validID := "550e8400-e29b-41d4-a716-446655440000"
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/"+validID+"/suspend",
		strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "reason is required")
}

func TestAdminUsersHandler_Suspend_EmptyBody(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Post("/api/v1/admin/users/{id}/suspend", h.Suspend)

	validID := "550e8400-e29b-41d4-a716-446655440000"
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/"+validID+"/suspend",
		strings.NewReader(""))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAdminUsersHandler_Suspend_MalformedJSON(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Post("/api/v1/admin/users/{id}/suspend", h.Suspend)

	validID := "550e8400-e29b-41d4-a716-446655440000"
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/"+validID+"/suspend",
		strings.NewReader("{bad json"))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAdminUsersHandler_Reactivate_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Post("/api/v1/admin/users/{id}/reactivate", h.Reactivate)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/xyz/reactivate", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAdminUsersHandler_Impersonate_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Post("/api/v1/admin/users/{id}/impersonate", h.Impersonate)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users/nope/impersonate", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAdminUsersHandler_ChangeRole_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Put("/api/v1/admin/users/{id}/role", h.ChangeRole)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/users/bad/role",
		strings.NewReader(`{"role":"admin"}`))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAdminUsersHandler_ChangeRole_MissingRole(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminUsersHandler(nil)
	r.Put("/api/v1/admin/users/{id}/role", h.ChangeRole)

	validID := "550e8400-e29b-41d4-a716-446655440000"
	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/users/"+validID+"/role",
		strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "role is required")
}

// ──────────────────────── Moderation Handler Input Validation ────────────────────────

func TestAdminModerationHandler_Approve_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminModerationHandler(nil)
	r.Put("/api/v1/admin/moderation/{id}/approve", h.Approve)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/moderation/bad-id/approve", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid id")
}

func TestAdminModerationHandler_Reject_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminModerationHandler(nil)
	r.Put("/api/v1/admin/moderation/{id}/reject", h.Reject)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/moderation/bad/reject",
		strings.NewReader(`{"reason":"spam"}`))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAdminModerationHandler_Reject_MissingReason(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminModerationHandler(nil)
	r.Put("/api/v1/admin/moderation/{id}/reject", h.Reject)

	validID := "550e8400-e29b-41d4-a716-446655440000"
	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/moderation/"+validID+"/reject",
		strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "reason is required")
}

func TestAdminModerationHandler_Escalate_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminModerationHandler(nil)
	r.Put("/api/v1/admin/moderation/{id}/escalate", h.Escalate)

	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/moderation/nope/escalate", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// ──────────────────────── Workspace Handler Input Validation ────────────────────────

func TestAdminWorkspacesHandler_GetByID_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminWorkspacesHandler(nil)
	r.Get("/api/v1/admin/workspaces/{id}", h.GetByID)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/workspaces/not-uuid", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid workspace id")
}

// ──────────────────────── Audit Logs Handler Input Validation ────────────────────────

func TestAdminAuditLogsHandler_GetDetail_InvalidUUID(t *testing.T) {
	r := chi.NewRouter()
	h := NewAdminAuditLogsHandler(nil)
	r.Get("/api/v1/admin/audit-logs/{id}", h.GetDetail)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/audit-logs/bad-id", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid id")
}

// ──────────────────────── respondJSON utility ────────────────────────

func TestRespondJSON_SetsHeaders(t *testing.T) {
	rr := httptest.NewRecorder()
	respondJSON(rr, http.StatusCreated, map[string]string{"created": "yes"})
	assert.Equal(t, http.StatusCreated, rr.Code)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))

	var body map[string]string
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, "yes", body["created"])
}

func TestRespondJSON_StatusOK(t *testing.T) {
	rr := httptest.NewRecorder()
	respondJSON(rr, http.StatusOK, []int{1, 2, 3})
	assert.Equal(t, http.StatusOK, rr.Code)

	var body []int
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&body))
	assert.Equal(t, []int{1, 2, 3}, body)
}

// ──────────────────────── Wrong HTTP Method ────────────────────────

func TestAdminRoutes_WrongMethodReturns405(t *testing.T) {
	r := setupFullAdminRouter()
	claims := map[string]any{"sub": "admin-1", "role": "Owner", "platform_role": "super_admin"}

	// POST to a GET-only endpoint
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/revenue", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
}
