package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/middleware"
)

// f100SettingsRouter mounts the admin-settings routes behind a stub that injects
// a super_admin platform role, so the category-allowlist guards can be exercised
// without a real JWT or DB. The repo is nil on purpose: every assertion here
// targets the allowlist guard, which returns 400 for an unlisted category BEFORE
// any repo call, so the nil repo is never dereferenced on the tested paths.
func f100SettingsRouter(repo any) http.Handler {
	h := NewAdminSettingsHandler(nil)
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			claims := &middleware.JWTClaims{PlatformRole: "super_admin"}
			ctx := middleware.WithJWTClaims(req.Context(), claims)
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	r.Route("/api/v1/admin/settings", func(r chi.Router) {
		r.Get("/{category}", h.ListByCategory)
		r.Get("/{category}/{key}", h.GetSetting)
		r.Put("/{category}/{key}", h.UpsertSetting)
		r.Delete("/{category}/{key}", h.DeleteSetting)
	})
	return r
}

// TestF100_IsValidCategory locks in the allowlist itself: the six canonical
// platform-settings categories are accepted and anything else is rejected.
func TestF100_IsValidCategory(t *testing.T) {
	for _, c := range []string{"storage", "auth", "payments", "ai", "email", "messaging"} {
		if !isValidCategory(c) {
			t.Errorf("isValidCategory(%q) = false, want true (canonical category)", c)
		}
	}
	for _, c := range []string{"bogus", "", "STORAGE", "../auth", "secrets"} {
		if isValidCategory(c) {
			t.Errorf("isValidCategory(%q) = true, want false (not in allowlist)", c)
		}
	}
}

// TestF100_AdminSettings_RejectsUnlistedCategory verifies the HTTP guard: every
// parametrized settings handler must reject an unlisted {category} with 400
// before touching the repo (proven by the nil repo never panicking).
func TestF100_AdminSettings_RejectsUnlistedCategory(t *testing.T) {
	router := f100SettingsRouter(nil)

	cases := []struct {
		method string
		target string
		body   string
	}{
		{http.MethodGet, "/api/v1/admin/settings/bogus", ""},
		{http.MethodGet, "/api/v1/admin/settings/bogus/key", ""},
		{http.MethodPut, "/api/v1/admin/settings/bogus/key", `{"value":"x"}`},
		{http.MethodDelete, "/api/v1/admin/settings/bogus/key", ""},
	}
	for _, tc := range cases {
		var req *http.Request
		if tc.body != "" {
			req = httptest.NewRequest(tc.method, tc.target, bytes.NewBufferString(tc.body))
		} else {
			req = httptest.NewRequest(tc.method, tc.target, nil)
		}
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Errorf("%s %s: got %d, want 400 (unlisted category must be rejected before the repo)",
				tc.method, tc.target, rr.Code)
		}
	}
}
