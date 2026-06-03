package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestGallerySessionTokenHeaderCookieOnly verifies the SEC-1 fix (security audit
// 2026-05-30): the DURABLE gallery-session token is read ONLY from the
// X-Gallery-Session header or the gallery_session cookie — NEVER from the URL
// query string (?gs= / ?gallery_session=), where it would leak into access logs,
// browser history and the Referer header. Header-less media loads use the
// short-lived ?at= asset-access token instead (see gallery_asset_token_test.go).
func TestGallerySessionTokenHeaderCookieOnly(t *testing.T) {
	// Header is read.
	req := httptest.NewRequest(http.MethodGet, "/g", nil)
	req.Header.Set("X-Gallery-Session", "header-token")
	if got := gallerySessionToken(req); got != "header-token" {
		t.Fatalf("header should be read, got %q", got)
	}

	// Cookie is read when no header.
	req = httptest.NewRequest(http.MethodGet, "/g", nil)
	req.AddCookie(&http.Cookie{Name: "gallery_session", Value: "cookie-token"})
	if got := gallerySessionToken(req); got != "cookie-token" {
		t.Fatalf("cookie should be read, got %q", got)
	}

	// Header wins over cookie.
	req = httptest.NewRequest(http.MethodGet, "/g", nil)
	req.AddCookie(&http.Cookie{Name: "gallery_session", Value: "cookie-token"})
	req.Header.Set("X-Gallery-Session", "header-token")
	if got := gallerySessionToken(req); got != "header-token" {
		t.Fatalf("header should win over cookie, got %q", got)
	}

	// SEC-1: query-string session tokens are IGNORED (this is the fix).
	for _, raw := range []string{"/g?gs=query-token", "/g?gallery_session=query-token"} {
		req = httptest.NewRequest(http.MethodGet, raw, nil)
		if got := gallerySessionToken(req); got != "" {
			t.Fatalf("query-string session token must be ignored for %q, got %q", raw, got)
		}
	}

	// Even with a query token present, only the cookie (a non-URL channel) is used.
	req = httptest.NewRequest(http.MethodGet, "/g?gs=query-token", nil)
	req.AddCookie(&http.Cookie{Name: "gallery_session", Value: "cookie-token"})
	if got := gallerySessionToken(req); got != "cookie-token" {
		t.Fatalf("cookie should be used, query ignored, got %q", got)
	}
}
