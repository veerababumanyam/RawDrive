package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// setupAdminRouterWithPolicy builds a chi router with a non-nil
// WorkspacePolicySvc wired into AdminDeps. The service is constructed with
// db: nil — in this configuration WorkspacePolicyService.Get falls back to
// PolicyModeStandard from cache and WorkspacePolicyService.Set writes to
// cache only (no DB persistence). This is sufficient for the success test
// to exercise the handler's full code path without needing Docker.
//
// For Round 3 GREEN with real DB integration, swap NewWorkspacePolicyService
// with one backed by testsupport.PgvectorPool — that's the integration-test
// follow-up tracked in the M16 Round 3 RED batch B checkpoint.
func setupAdminRouterWithPolicy() *chi.Mux {
	r := chi.NewRouter()
	policySvc := service.NewWorkspacePolicyService(nil, nil) // in-memory cache mode
	RegisterAdminRoutes(r, AdminDeps{WorkspacePolicySvc: policySvc})
	return r
}

// ─────────────────────────────────────────────────────────────────────────────
// M16 E49-S1 / E49-S2 — Round 3 RED tests for admin workspace policy handler.
//
// These tests cover:
//   - FR-UPS-031: an admin can update a workspace's upload policy mode
//   - NFR-UPS-011: a non-admin user cannot reach the policy endpoint
//
// Round 3 RED state:
//   TestAdminPolicy_AdminUser_Success    → FAIL (skeleton returns 501)
//   TestAdminPolicy_NonAdmin_Forbidden   → PASS (middleware blocks before handler)
//
// Round 3 GREEN state (after wiring):
//   Both tests pass.
//
// The tests construct the router with AdminDeps{} (no services) — same pattern
// as admin_routes_test.go. The route-registration test (existing) verifies
// the routes are mounted; these tests verify the auth + handler behavior.
// ─────────────────────────────────────────────────────────────────────────────

const (
	testWorkspaceID   = "11111111-1111-1111-1111-111111111111"
	uploadPolicyPath  = "/api/v1/admin/workspaces/" + testWorkspaceID + "/upload-policy"
	platformAdminRole = "admin"
	platformPhotoRole = "photographer"
	// M16-BUG-04 follow-up: sub claims must be real UUIDs because the
	// production handler now reads the actor id from JWT claims and parses
	// it as a UUID before writing audit log entries. Previously the
	// placeholder actorIDFromContext() returned uuid.Nil regardless of
	// input so any string worked here.
	jwtSubAdminUser = "22222222-2222-2222-2222-222222222222"
	jwtSubPhotoUser = "33333333-3333-3333-3333-333333333333"
)

// adminClaims returns a JWT-claims map for a platform admin actor.
func adminClaims(sub string) map[string]interface{} {
	return map[string]interface{}{
		"sub":           sub,
		"role":          "Owner",
		"platform_role": platformAdminRole,
	}
}

// nonAdminClaims returns a JWT-claims map for a non-admin (photographer) actor.
func nonAdminClaims(sub string) map[string]interface{} {
	return map[string]interface{}{
		"sub":           sub,
		"role":          "Owner",
		"platform_role": platformPhotoRole,
	}
}

// TestAdminPolicy_AdminUser_Success covers FR-UPS-031: an authenticated
// platform admin can set a workspace's upload policy mode and receive a
// 200 OK response with the new mode echoed back.
//
// Round 3 GREEN: this test passes because setupAdminRouterWithPolicy wires
// a real WorkspacePolicyService (in-memory cache mode — no DB needed for
// the in-handler-logic test). The DB-backed integration test variant is
// tracked as a Round 3 follow-up in 03-round-3-red-batch-b.json.
func TestAdminPolicy_AdminUser_Success(t *testing.T) {
	r := setupAdminRouterWithPolicy()

	body := SetWorkspacePolicyRequest{Mode: "strict_client_scan"}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPut, uploadPolicyPath, bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), adminClaims(jwtSubAdminUser)))

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	// Round 3 GREEN expectation: 200 OK with echoed-back policy mode.
	assert.Equal(t, http.StatusOK, rr.Code,
		"expected admin SetWorkspacePolicy to return 200 OK; got %d. Body: %s",
		rr.Code, rr.Body.String())

	if rr.Code == http.StatusOK {
		var resp WorkspacePolicyResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		assert.Equal(t, testWorkspaceID, resp.WorkspaceID)
		assert.Equal(t, "strict_client_scan", resp.Mode)
	}
}

// TestAdminPolicy_NonAdmin_Forbidden covers NFR-UPS-011: a non-admin user
// (photographer role) cannot reach the workspace policy endpoint. The
// platform-role middleware (RequirePlatformRole) must reject the request
// with 403 Forbidden BEFORE the handler is called.
//
// This test acts as a regression guard: it should pass in BOTH RED and GREEN
// state because the rejection happens at the middleware layer, not the
// handler layer. Its job is to confirm the new endpoint is mounted behind
// the correct middleware stack so a future refactor cannot accidentally
// expose it to non-admin users.
func TestAdminPolicy_NonAdmin_Forbidden(t *testing.T) {
	r := setupFullAdminRouter()

	body := SetWorkspacePolicyRequest{Mode: "strict_client_scan"}
	bodyBytes, err := json.Marshal(body)
	require.NoError(t, err)

	// PUT — write attempt by non-admin must be forbidden.
	req := httptest.NewRequest(http.MethodPut, uploadPolicyPath, bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), nonAdminClaims(jwtSubPhotoUser)))

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code,
		"non-admin PUT to %s must return 403; got %d. Body: %s",
		uploadPolicyPath, rr.Code, rr.Body.String())

	// GET — read attempt by non-admin must also be forbidden.
	getReq := httptest.NewRequest(http.MethodGet, uploadPolicyPath, nil)
	getReq = getReq.WithContext(middleware.WithJWTClaims(getReq.Context(), nonAdminClaims(jwtSubPhotoUser)))

	getRR := httptest.NewRecorder()
	r.ServeHTTP(getRR, getReq)

	assert.Equal(t, http.StatusForbidden, getRR.Code,
		"non-admin GET to %s must return 403; got %d. Body: %s",
		uploadPolicyPath, getRR.Code, getRR.Body.String())
}
