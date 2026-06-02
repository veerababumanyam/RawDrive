package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGallerySessionTokenReadsHeaderCookieAndQuery(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/g?gs=query-token", nil)
	if got := gallerySessionToken(req); got != "query-token" {
		t.Fatalf("expected gs query token, got %q", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/g?gallery_session=query-token", nil)
	if got := gallerySessionToken(req); got != "query-token" {
		t.Fatalf("expected gallery_session query token, got %q", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/g?gs=query-token", nil)
	req.AddCookie(&http.Cookie{Name: "gallery_session", Value: "cookie-token"})
	if got := gallerySessionToken(req); got != "cookie-token" {
		t.Fatalf("cookie should win over query token, got %q", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/g?gs=query-token", nil)
	req.AddCookie(&http.Cookie{Name: "gallery_session", Value: "cookie-token"})
	req.Header.Set("X-Gallery-Session", "header-token")
	if got := gallerySessionToken(req); got != "header-token" {
		t.Fatalf("header should win over cookie/query token, got %q", got)
	}
}
