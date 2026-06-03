package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/middleware"
)

// postVerifyPIN fires one POST to the public gallery verify-pin route for the
// given slug from the given client IP and returns the HTTP status code.
//
// The first few requests reach the (nil-service) VerifyPIN handler, which
// fails JSON decode on the empty body and returns 400 before touching the
// nil share service — so no panic occurs. The throttled request is
// short-circuited at the middleware (429) before reaching the handler. We
// recover defensively in case the handler path changes.
func postVerifyPIN(r http.Handler, slug, clientIP string) int {
	path := "/api/v1/public/galleries/" + slug + "/verify-pin"
	req := httptest.NewRequest(http.MethodPost, path, http.NoBody)
	req.RemoteAddr = clientIP
	rr := httptest.NewRecorder()
	func() {
		defer func() { _ = recover() }()
		r.ServeHTTP(rr, req)
	}()
	return rr.Code
}

// TestF009_GalleryVerifyPINRateLimited is the regression test for F-009.
//
// Before the fix the public gallery verify-pin route was mounted as a bare
// r.Post(...) with no PIN-specific limiter, so a numeric PIN could be
// brute-forced under only the loose global 600/min IP limit. The fix wraps
// the route with aliasGalleryPINKey + middleware.RequirePINRateLimit, keyed
// on (clientIP, slug) — mirroring the M8 stream verify-pin hardening.
//
// This test wires a real in-memory limiter (5 attempts / 5 min) through
// M2Dependencies, fires 6 POSTs to the same slug from the same client IP, and
// asserts the 6th is throttled with 429. It fails before the .With wrapper is
// added (every request reaches the handler, so none returns 429) and passes
// after.
func TestF009_GalleryVerifyPINRateLimited(t *testing.T) {
	r := chi.NewRouter()
	deps := M2Dependencies{
		// Same limiter configuration the stream verify-pin endpoint uses:
		// 5 attempts per 5-minute window, keyed on client IP + slug.
		PINRateLimiter: middleware.NewMemoryPINRateLimiter(5, 5*time.Minute),
	}
	RegisterPublicGalleryRoutes(r, deps)

	const slug = "private-wedding"
	const clientIP = "203.0.113.7:51000"

	// First 5 attempts are within budget — none should be throttled yet.
	for i := 1; i <= 5; i++ {
		if code := postVerifyPIN(r, slug, clientIP); code == http.StatusTooManyRequests {
			t.Fatalf("attempt %d unexpectedly throttled (429) before the 5-attempt budget was exhausted", i)
		}
	}

	// 6th attempt from the same IP + slug must be throttled. If verify-pin is
	// not wrapped with the PIN limiter (or the limiter never sees a non-empty
	// key), this is never a 429 and the test fails — which is exactly the
	// pre-fix behavior.
	if code := postVerifyPIN(r, slug, clientIP); code != http.StatusTooManyRequests {
		t.Fatalf("expected 6th verify-pin attempt to be rate limited (429), got %d — verify-pin route is not protected by RequirePINRateLimit", code)
	}
}

// TestF009_GalleryVerifyPINPerSlugIsolation proves the limiter keys on the
// gallery slug (via aliasGalleryPINKey), not just the client IP. If the alias
// were missing, RequirePINRateLimit would read an empty "id" param and pass
// every request through unthrottled — so exhausting one slug's budget would
// (wrongly) appear to leave it open, and more importantly a different slug
// must remain independently available. Burning slug A from one IP must not
// consume slug B's budget for the same IP.
func TestF009_GalleryVerifyPINPerSlugIsolation(t *testing.T) {
	r := chi.NewRouter()
	deps := M2Dependencies{
		PINRateLimiter: middleware.NewMemoryPINRateLimiter(5, 5*time.Minute),
	}
	RegisterPublicGalleryRoutes(r, deps)

	const clientIP = "198.51.100.4:40000"

	// Exhaust slug A's budget from this IP.
	for i := 1; i <= 6; i++ {
		postVerifyPIN(r, "gallery-a", clientIP)
	}
	// Confirm slug A is now actually throttled (guards against the alias being
	// a no-op, which would make the limiter never engage).
	if code := postVerifyPIN(r, "gallery-a", clientIP); code != http.StatusTooManyRequests {
		t.Fatalf("expected gallery-a to be throttled (429) after exhausting its budget, got %d", code)
	}

	// A different slug from the same IP must still have budget — proving the
	// limiter key includes the slug, not just the IP.
	if code := postVerifyPIN(r, "gallery-b", clientIP); code == http.StatusTooManyRequests {
		t.Fatalf("gallery-b was throttled despite having its own budget — limiter is not keyed per-slug")
	}
}
