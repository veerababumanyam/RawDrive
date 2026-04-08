package security_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
)

// setupAdminRouter creates a minimal admin router with RBAC middleware.
func setupAdminRouter() *chi.Mux {
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequireRole("super_admin"))
		r.Get("/users", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"data":[],"total":0}`))
		})
		r.Get("/moderation", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"data":[],"total":0}`))
		})
		r.Get("/revenue", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{}`))
		})
		r.Get("/system/metrics", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{}`))
		})
		r.Get("/audit-logs", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"data":[],"total":0}`))
		})
	})
	return r
}

func requestWithClaims(r *chi.Mux, method, path string, claims map[string]interface{}) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if claims != nil {
		ctx := middleware.WithJWTClaims(req.Context(), claims)
		req = req.WithContext(ctx)
	}
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func TestAdminRBAC_UnauthenticatedDenied(t *testing.T) {
	r := setupAdminRouter()
	endpoints := []string{"/api/v1/admin/users", "/api/v1/admin/moderation", "/api/v1/admin/revenue", "/api/v1/admin/system/metrics", "/api/v1/admin/audit-logs"}
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			rr := requestWithClaims(r, http.MethodGet, ep, nil)
			assert.Equal(t, http.StatusUnauthorized, rr.Code, "unauthenticated request should be 401")
		})
	}
}

func TestAdminRBAC_NonAdminDenied(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub":  "user-123",
		"role": "photographer",
	}
	endpoints := []string{"/api/v1/admin/users", "/api/v1/admin/moderation", "/api/v1/admin/revenue", "/api/v1/admin/system/metrics", "/api/v1/admin/audit-logs"}
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			rr := requestWithClaims(r, http.MethodGet, ep, claims)
			assert.Equal(t, http.StatusForbidden, rr.Code, "non-admin should be 403")
		})
	}
}

func TestAdminRBAC_SuperAdminAllowed(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub":  "admin-001",
		"role": "super_admin",
	}
	endpoints := []string{"/api/v1/admin/users", "/api/v1/admin/moderation", "/api/v1/admin/revenue", "/api/v1/admin/system/metrics", "/api/v1/admin/audit-logs"}
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			rr := requestWithClaims(r, http.MethodGet, ep, claims)
			assert.Equal(t, http.StatusOK, rr.Code, "super_admin should be 200")
		})
	}
}

func TestAdminRBAC_DealerRoleDenied(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub":  "dealer-001",
		"role": "dealer",
	}
	rr := requestWithClaims(r, http.MethodGet, "/api/v1/admin/users", claims)
	assert.Equal(t, http.StatusForbidden, rr.Code, "dealer role should be 403 on admin routes")
}

func TestAdminRBAC_EmptyRoleDenied(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub": "user-no-role",
	}
	rr := requestWithClaims(r, http.MethodGet, "/api/v1/admin/users", claims)
	assert.Equal(t, http.StatusForbidden, rr.Code, "empty role should be 403")
}

func TestAdminRBAC_ImpersonationBlocksMutations(t *testing.T) {
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequireRole("super_admin"))
		r.Use(middleware.RejectImpersonationWrites)
		r.Get("/users", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
		r.Post("/users/{id}/suspend", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})

	claims := map[string]interface{}{
		"sub":           "admin-001",
		"role":          "super_admin",
		"impersonation": true,
	}

	t.Run("GET allowed under impersonation", func(t *testing.T) {
		rr := requestWithClaims(r, http.MethodGet, "/api/v1/admin/users", claims)
		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("POST blocked under impersonation", func(t *testing.T) {
		rr := requestWithClaims(r, http.MethodPost, "/api/v1/admin/users/u1/suspend", claims)
		assert.Equal(t, http.StatusForbidden, rr.Code)
	})
}

// Ensure context propagation works.
func TestAdminRBAC_ContextPropagation(t *testing.T) {
	claims := map[string]interface{}{
		"sub":  "admin-001",
		"role": "super_admin",
	}
	ctx := middleware.WithJWTClaims(context.Background(), claims)
	got := middleware.JWTClaimsFromContext(ctx)
	assert.NotNil(t, got)
	assert.Equal(t, "super_admin", got["role"])
}
