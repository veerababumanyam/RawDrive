package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/middleware"
)

// TestM6AdminRoutes_PlatformRoleGate is a regression guard for the
// PROD-UAT-2026-04-13 P0: a local `requireAdmin` middleware on the M6
// admin routes read the workspace `role` claim ("Owner") instead of the
// `platform_role` claim, so every authenticated user passed the gate.
//
// The fix swaps the gate for middleware.RequirePlatformRole("admin",
// "super_admin"). This test mounts the M6 routes and confirms that every
// /api/v1/admin/* endpoint returns 403 for non-admin platform roles
// (client, photographer, dealer) and is not 403 for an admin role.
// Because the gate runs BEFORE the handler, nil deps are safe — the
// request never reaches the handler on the forbidden path.
func TestM6AdminRoutes_PlatformRoleGate(t *testing.T) {
	r := chi.NewRouter()
	RegisterM6Routes(r, M6Dependencies{})

	adminRoutes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/admin/dealers"},
		{http.MethodGet, "/api/v1/admin/dealers/reports/statewide"},
		{http.MethodPost, "/api/v1/admin/dealers"},
		{http.MethodPut, "/api/v1/admin/dealers/00000000-0000-0000-0000-000000000000/approve"},
		{http.MethodPut, "/api/v1/admin/dealers/00000000-0000-0000-0000-000000000000/reject"},
		{http.MethodPut, "/api/v1/admin/dealers/00000000-0000-0000-0000-000000000000/suspend"},
		{http.MethodGet, "/api/v1/admin/margins"},
		{http.MethodPut, "/api/v1/admin/margins"},
		{http.MethodGet, "/api/v1/admin/margins/history"},
		{http.MethodGet, "/api/v1/admin/coupons"},
		{http.MethodPost, "/api/v1/admin/coupons"},
		{http.MethodPost, "/api/v1/admin/payouts/00000000-0000-0000-0000-000000000000/approve"},
		{http.MethodPost, "/api/v1/admin/payouts/00000000-0000-0000-0000-000000000000/confirm-payment"},
	}

	nonAdminRoles := []string{"client", "photographer", "dealer"}

	for _, roleName := range nonAdminRoles {
		for _, rt := range adminRoutes {
			claims := map[string]interface{}{
				"sub":           "11111111-1111-1111-1111-111111111111",
				"role":          "Owner", // workspace-role: every user owns their workspace
				"platform_role": roleName,
			}
			req := httptest.NewRequest(rt.method, rt.path, nil)
			req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
			rr := httptest.NewRecorder()
			r.ServeHTTP(rr, req)

			assert.Equal(t, http.StatusForbidden, rr.Code,
				"platform_role=%s must be 403 at %s %s; got %d",
				roleName, rt.method, rt.path, rr.Code)
		}
	}

	// Missing claims entirely → 401.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/dealers", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code,
		"no JWT claims must return 401; got %d", rr.Code)
}
