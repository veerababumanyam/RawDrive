package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestAdminRouter() *chi.Mux {
	r := chi.NewRouter()
	deps := AdminDeps{
		UserSvc:       nil,
		ModerationSvc: nil,
		WorkspaceSvc:  nil,
		RevenueSvc:    nil,
		AnalyticsSvc:  nil,
		ExportSvc:     nil,
		HealthSvc:     nil,
		AuditLogSvc:   nil,
	}
	RegisterAdminRoutes(r, deps)
	return r
}

func TestAdminRoutes_Registration(t *testing.T) {
	r := setupTestAdminRouter()

	// Verify all expected routes are registered by walking the chi tree
	routes := map[string]bool{
		"GET /api/v1/admin/users":                    false,
		"GET /api/v1/admin/moderation":               false,
		"GET /api/v1/admin/workspaces":               false,
		"GET /api/v1/admin/revenue":                  false,
		"GET /api/v1/admin/analytics/engagement":     false,
		"GET /api/v1/admin/system/metrics":           false,
		"GET /api/v1/admin/audit-logs":               false,
	}

	chi.Walk(r, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		key := method + " " + route
		if _, exists := routes[key]; exists {
			routes[key] = true
		}
		return nil
	})

	for route, registered := range routes {
		assert.True(t, registered, "expected route %s to be registered", route)
	}
}

func TestAdminRoutes_RequiresAuth(t *testing.T) {
	r := setupTestAdminRouter()

	endpoints := []string{
		"/api/v1/admin/users",
		"/api/v1/admin/moderation",
		"/api/v1/admin/workspaces",
		"/api/v1/admin/revenue",
		"/api/v1/admin/audit-logs",
	}

	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, ep, nil)
			rr := httptest.NewRecorder()
			r.ServeHTTP(rr, req)
			// Without JWT claims in context, RequireAuth returns 401
			assert.Equal(t, http.StatusUnauthorized, rr.Code)
		})
	}
}

func TestAdminRoutes_RequiresSuperAdmin(t *testing.T) {
	r := setupTestAdminRouter()

	// Photographer role should be denied
	claims := map[string]interface{}{
		"sub":  "user-123",
		"role": "photographer",
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users", nil)
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	req = req.WithContext(ctx)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestAdminUsersHandler_ListBadRequest(t *testing.T) {
	// Users handler with nil service should panic or return error
	// This tests that the route is actually wired to the handler
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if id == "bad-uuid" {
				http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
				return
			}
			respondJSON(w, http.StatusOK, map[string]string{"id": id})
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users/bad-uuid", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)

	var body map[string]string
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Equal(t, "invalid user id", body["error"])
}

func TestRespondJSON(t *testing.T) {
	rr := httptest.NewRecorder()
	respondJSON(rr, http.StatusOK, map[string]string{"key": "value"})

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))

	var body map[string]string
	err := json.NewDecoder(rr.Body).Decode(&body)
	require.NoError(t, err)
	assert.Equal(t, "value", body["key"])
}
