package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/rawdrive/backend/internal/middleware"
)

// newAdminSettingsRouterForTest builds a router with the admin settings routes
// registered exactly as production wires them (on a JWT-only group, mirroring
// main.go's `api` group), then injects the given claims into the request
// context the same way middleware.JWTAuth does (a plain claims map keyed by
// "platform_role"). A nil `claims` simulates an unauthenticated/no-claims
// request, which RequirePlatformRole rejects with 401.
//
// The repo is intentionally nil: every denial case (401/403) is rejected by the
// RequirePlatformRole gate BEFORE the handler runs, so the repo is never
// touched. For allowed requests that reach the handler, the nil repo would
// panic on a DB call; chimiddleware.Recoverer converts that into a 500, which
// is enough to prove the request passed the auth gate (i.e. it was NOT blocked
// with 401/403).
func newAdminSettingsRouterForTest(claims map[string]interface{}) http.Handler {
	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if claims != nil {
				req = req.WithContext(middleware.WithJWTClaims(req.Context(), claims))
			}
			next.ServeHTTP(w, req)
		})
	})

	RegisterAdminSettingsRoutes(r, nil)
	return r
}

// platformRoleClaims returns a JWT-claims map for the given platform role,
// matching the shape middleware.JWTAuth populates (see RequirePlatformRole,
// which reads claims["platform_role"]).
func platformRoleClaims(sub, platformRole string) map[string]interface{} {
	return map[string]interface{}{
		"sub":           sub,
		"role":          "Owner",
		"platform_role": platformRole,
	}
}

// gateRequest issues a request against the router and returns the status code.
func gateRequest(t *testing.T, h http.Handler, method, path string) int {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

// TestF100_AdminSettings_RejectsUnlistedCategory is the regression test for
// F-100: the platform settings CRUD handlers accepted any {category} path
// param with no allowlist, letting a super_admin create/read/delete rows under
// arbitrary undefined categories (table pollution). The fix adds an allowlist
// {storage, auth, payments, ai, email, messaging} and 400s on anything else,
// on every parameterized handler (ListByCategory, GetSetting, UpsertSetting,
// DeleteSetting).
//
// All requests use a super_admin so they clear the auth gate (see F-003) and
// reach the handler — this isolates the category check from the role check.
// The repo is nil: an *unlisted* category must be rejected with 400 by the
// allowlist guard BEFORE the nil repo is touched. (A *valid* category would
// instead reach the repo, nil-panic, and Recoverer would return 500 — proving
// the 400 comes from the allowlist, not from a generic failure.) On the pre-fix
// code the unlisted-category requests reach the nil repo and return 500 (or, with
// a real repo, succeed), so each sub-assertion fails before the fix.
func TestF100_AdminSettings_RejectsUnlistedCategory(t *testing.T) {
	const base = "/api/v1/admin/settings"
	const bogus = "bogus_undefined_category"

	h := newAdminSettingsRouterForTest(platformRoleClaims("superadmin-user", "super_admin"))

	// Every handler that takes a {category} path param must 400 on an unlisted
	// category. GET {category} -> ListByCategory; GET/PUT/DELETE {category}/{key}
	// -> GetSetting/UpsertSetting/DeleteSetting.
	endpoints := []struct {
		method string
		path   string
	}{
		{http.MethodGet, base + "/" + bogus},
		{http.MethodGet, base + "/" + bogus + "/SOME_KEY"},
		{http.MethodPut, base + "/" + bogus + "/SOME_KEY"},
		{http.MethodDelete, base + "/" + bogus + "/SOME_KEY"},
	}

	t.Run("unlisted category rejected with 400 on every handler", func(t *testing.T) {
		for _, ep := range endpoints {
			if got := gateRequest(t, h, ep.method, ep.path); got != http.StatusBadRequest {
				t.Errorf("%s %s: expected 400 for unlisted category, got %d", ep.method, ep.path, got)
			}
		}
	})

	t.Run("allowlisted categories are accepted by the gate", func(t *testing.T) {
		// Assert the allowlist at the unit boundary rather than driving a valid
		// category through the full HTTP stack into the nil test repo (which
		// would panic). This proves the gate keys off the allowlist (accepts the
		// six canonical categories) and does not reject everything — the
		// complement of the 400-on-unlisted HTTP assertion above.
		for _, c := range []string{"storage", "auth", "payments", "ai", "email", "messaging"} {
			if !isValidCategory(c) {
				t.Errorf("isValidCategory(%q) = false, want true (canonical category must pass the gate)", c)
			}
		}
	})
}

// TestF003_AdminSettings_RequiresPlatformRole is the regression test for F-003:
// the platform settings CRUD endpoints were registered on the JWT-only `api`
// group with NO RequirePlatformRole gate, so any authenticated workspace user
// could enumerate setting metadata and overwrite/delete platform secrets via
// PUT/DELETE. This test asserts that all endpoints now enforce platform roles.
//
// On the pre-fix (ungated) code, the no-claims and non-platform-user sub-tests
// fail because the requests reach the handler (nil repo panics -> 500, or, with
// a real repo, would succeed) instead of being rejected with 401/403.
func TestF003_AdminSettings_RequiresPlatformRole(t *testing.T) {
	const base = "/api/v1/admin/settings"

	allEndpoints := []struct {
		method string
		path   string
	}{
		{http.MethodGet, base + "/categories"},
		{http.MethodGet, base + "/storage"},
		{http.MethodGet, base + "/storage/B2_APPLICATION_KEY"},
		{http.MethodPut, base + "/storage/B2_APPLICATION_KEY"},
		{http.MethodDelete, base + "/storage/B2_APPLICATION_KEY"},
	}

	mutating := []struct {
		method string
		path   string
	}{
		{http.MethodPut, base + "/storage/B2_APPLICATION_KEY"},
		{http.MethodDelete, base + "/storage/B2_APPLICATION_KEY"},
	}

	t.Run("no claims rejected with 401", func(t *testing.T) {
		h := newAdminSettingsRouterForTest(nil)
		for _, ep := range allEndpoints {
			if got := gateRequest(t, h, ep.method, ep.path); got != http.StatusUnauthorized {
				t.Errorf("%s %s: expected 401 for unauthenticated request, got %d", ep.method, ep.path, got)
			}
		}
	})

	t.Run("non-platform user rejected with 403 on every endpoint", func(t *testing.T) {
		// A regular authenticated workspace user (photographer) with no
		// elevated platform role — this is the F-003 attacker.
		h := newAdminSettingsRouterForTest(platformRoleClaims("photographer-user", "photographer"))
		for _, ep := range allEndpoints {
			if got := gateRequest(t, h, ep.method, ep.path); got != http.StatusForbidden {
				t.Errorf("%s %s: expected 403 for non-platform user, got %d", ep.method, ep.path, got)
			}
		}
	})

	t.Run("admin cannot mutate (PUT/DELETE require super_admin)", func(t *testing.T) {
		h := newAdminSettingsRouterForTest(platformRoleClaims("admin-user", "admin"))
		for _, ep := range mutating {
			if got := gateRequest(t, h, ep.method, ep.path); got != http.StatusForbidden {
				t.Errorf("%s %s: expected 403 for admin on mutating route, got %d", ep.method, ep.path, got)
			}
		}
	})

	t.Run("admin passes the read gate", func(t *testing.T) {
		h := newAdminSettingsRouterForTest(platformRoleClaims("admin-user", "admin"))
		// Passing the gate reaches the handler, which hits the nil repo and
		// panics -> Recoverer returns 500. The assertion is only that it is
		// neither 401 nor 403 (i.e. the auth gate let it through).
		got := gateRequest(t, h, http.MethodGet, base+"/categories")
		if got == http.StatusUnauthorized || got == http.StatusForbidden {
			t.Errorf("GET %s/categories: admin should pass the read gate, but got %d", base, got)
		}
	})

	t.Run("super_admin passes the mutation gate", func(t *testing.T) {
		h := newAdminSettingsRouterForTest(platformRoleClaims("superadmin-user", "super_admin"))
		for _, ep := range mutating {
			got := gateRequest(t, h, ep.method, ep.path)
			if got == http.StatusUnauthorized || got == http.StatusForbidden {
				t.Errorf("%s %s: super_admin should pass the mutation gate, but got %d", ep.method, ep.path, got)
			}
		}
	})
}
