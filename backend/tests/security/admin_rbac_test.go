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

// setupAdminRouter creates a minimal admin router with platform-role RBAC middleware.
// Admin routes require platform_role: super_admin OR admin (PRD 6.2.1, 6.2.2).
func setupAdminRouter() *chi.Mux {
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequirePlatformRole("super_admin", "admin"))
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
		"sub":           "user-123",
		"role":          "Owner",
		"platform_role": "photographer",
	}
	endpoints := []string{"/api/v1/admin/users", "/api/v1/admin/moderation", "/api/v1/admin/revenue", "/api/v1/admin/system/metrics", "/api/v1/admin/audit-logs"}
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			rr := requestWithClaims(r, http.MethodGet, ep, claims)
			assert.Equal(t, http.StatusForbidden, rr.Code, "photographer should be 403 on admin routes")
		})
	}
}

func TestAdminRBAC_SuperAdminAllowed(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub":           "admin-001",
		"role":          "Owner",
		"platform_role": "super_admin",
	}
	endpoints := []string{"/api/v1/admin/users", "/api/v1/admin/moderation", "/api/v1/admin/revenue", "/api/v1/admin/system/metrics", "/api/v1/admin/audit-logs"}
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			rr := requestWithClaims(r, http.MethodGet, ep, claims)
			assert.Equal(t, http.StatusOK, rr.Code, "super_admin should be 200")
		})
	}
}

func TestAdminRBAC_AdminRoleAllowed(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub":           "admin-002",
		"role":          "Owner",
		"platform_role": "admin",
	}
	endpoints := []string{"/api/v1/admin/users", "/api/v1/admin/moderation", "/api/v1/admin/revenue", "/api/v1/admin/system/metrics", "/api/v1/admin/audit-logs"}
	for _, ep := range endpoints {
		t.Run(ep, func(t *testing.T) {
			rr := requestWithClaims(r, http.MethodGet, ep, claims)
			assert.Equal(t, http.StatusOK, rr.Code, "admin platform role should be 200")
		})
	}
}

func TestAdminRBAC_DealerRoleDenied(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub":           "dealer-001",
		"role":          "Owner",
		"platform_role": "dealer",
	}
	rr := requestWithClaims(r, http.MethodGet, "/api/v1/admin/users", claims)
	assert.Equal(t, http.StatusForbidden, rr.Code, "dealer platform role should be 403 on admin routes")
}

func TestAdminRBAC_TeamMemberDenied(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub":           "team-001",
		"role":          "Editor",
		"platform_role": "team_member",
	}
	rr := requestWithClaims(r, http.MethodGet, "/api/v1/admin/users", claims)
	assert.Equal(t, http.StatusForbidden, rr.Code, "team_member should be 403 on admin routes")
}

func TestAdminRBAC_ClientDenied(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub":           "client-001",
		"role":          "Viewer",
		"platform_role": "client",
	}
	rr := requestWithClaims(r, http.MethodGet, "/api/v1/admin/users", claims)
	assert.Equal(t, http.StatusForbidden, rr.Code, "client should be 403 on admin routes")
}

func TestAdminRBAC_EmptyRoleDenied(t *testing.T) {
	r := setupAdminRouter()
	claims := map[string]interface{}{
		"sub": "user-no-role",
	}
	rr := requestWithClaims(r, http.MethodGet, "/api/v1/admin/users", claims)
	assert.Equal(t, http.StatusForbidden, rr.Code, "empty platform_role should be 403")
}

func TestAdminRBAC_ImpersonationBlocksMutations(t *testing.T) {
	r := chi.NewRouter()
	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequirePlatformRole("super_admin", "admin"))
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
		"role":          "Owner",
		"platform_role": "super_admin",
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

func TestAdminRBAC_ContextPropagation(t *testing.T) {
	claims := map[string]interface{}{
		"sub":           "admin-001",
		"role":          "Owner",
		"platform_role": "super_admin",
	}
	ctx := middleware.WithJWTClaims(context.Background(), claims)
	got := middleware.JWTClaimsFromContext(ctx)
	assert.NotNil(t, got)
	assert.Equal(t, "Owner", got["role"])
	assert.Equal(t, "super_admin", got["platform_role"])
}

// TestWorkspaceRoleMiddleware verifies the workspace-level role hierarchy check.
func TestWorkspaceRoleMiddleware(t *testing.T) {
	makeRouter := func(minRole string) *chi.Mux {
		r := chi.NewRouter()
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequireWorkspaceRole(minRole))
		r.Get("/test", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
		return r
	}

	tests := []struct {
		name     string
		minRole  string
		userRole string
		expected int
	}{
		{"Owner accessing Owner route", "Owner", "Owner", 200},
		{"Admin accessing Owner route", "Owner", "Admin", 403},
		{"Admin accessing Admin route", "Admin", "Admin", 200},
		{"Owner accessing Admin route", "Admin", "Owner", 200},
		{"Editor accessing Editor route", "Editor", "Editor", 200},
		{"Viewer accessing Editor route", "Editor", "Viewer", 403},
		{"Viewer accessing Viewer route", "Viewer", "Viewer", 200},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := makeRouter(tt.minRole)
			claims := map[string]interface{}{
				"sub":           "user-123",
				"role":          tt.userRole,
				"platform_role": "photographer",
			}
			rr := requestWithClaims(r, http.MethodGet, "/test", claims)
			assert.Equal(t, tt.expected, rr.Code)
		})
	}
}
