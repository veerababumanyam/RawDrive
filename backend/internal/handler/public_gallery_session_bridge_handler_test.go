package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandlePublicGallerySessionBridgeSetsHttpOnlyCookie(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/public-gallery-session", strings.NewReader(`{"slug":"ravi-and-priya","token":"minted-session-token-abc"}`))
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()

	HandlePublicGallerySessionBridge(rec, req)

	res := rec.Result()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", res.StatusCode, rec.Body.String())
	}
	if got := res.Header.Get("Cache-Control"); got != "no-store" {
		t.Fatalf("expected Cache-Control no-store, got %q", got)
	}
	cookies := res.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %d", len(cookies))
	}
	cookie := cookies[0]
	if cookie.Name != "gallery_session" {
		t.Fatalf("expected gallery_session cookie, got %q", cookie.Name)
	}
	if cookie.Value != "minted-session-token-abc" {
		t.Fatalf("unexpected cookie value %q", cookie.Value)
	}
	if !cookie.HttpOnly {
		t.Fatal("expected cookie to be HttpOnly")
	}
	if !cookie.Secure {
		t.Fatal("expected cookie to be Secure behind HTTPS")
	}
	if cookie.SameSite != http.SameSiteStrictMode {
		t.Fatalf("expected SameSite strict, got %v", cookie.SameSite)
	}
	if cookie.Path != "/" {
		t.Fatalf("expected Path=/, got %q", cookie.Path)
	}
	if cookie.MaxAge != 86400 {
		t.Fatalf("expected MaxAge 86400, got %d", cookie.MaxAge)
	}
}

func TestHandlePublicGallerySessionBridgeAllowsPlainHTTPDevCookie(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/public-gallery-session", strings.NewReader(`{"slug":"ravi-and-priya","token":"minted-session-token-abc"}`))
	rec := httptest.NewRecorder()

	HandlePublicGallerySessionBridge(rec, req)

	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %d", len(cookies))
	}
	if cookies[0].Secure {
		t.Fatal("plain HTTP dev requests should not force Secure")
	}
}

func TestHandlePublicGallerySessionBridgeValidatesBody(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "invalid json", body: `not-json`},
		{name: "missing slug", body: `{"token":"minted-session-token-abc"}`},
		{name: "blank slug", body: `{"slug":"  ","token":"minted-session-token-abc"}`},
		{name: "missing token", body: `{"slug":"ravi-and-priya"}`},
		{name: "blank token", body: `{"slug":"ravi-and-priya","token":"  "}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/public-gallery-session", strings.NewReader(tc.body))
			rec := httptest.NewRecorder()

			HandlePublicGallerySessionBridge(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", rec.Code)
			}
			if got := rec.Result().Header.Get("Set-Cookie"); got != "" {
				t.Fatalf("expected no cookie, got %q", got)
			}
			if got := rec.Result().Header.Get("Cache-Control"); got != "no-store" {
				t.Fatalf("expected Cache-Control no-store, got %q", got)
			}
		})
	}
}
