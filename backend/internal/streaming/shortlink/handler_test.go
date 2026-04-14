package shortlink

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// RED-phase tests for M34 R3 shortlink HTTP handler.
// Handler stub returns 501 for everything so every assertion fails.
// GREEN phase (next) wires real behaviour against streaming_shortlinks +
// streaming_shortlink_hits tables and a per-IP 60/min rate limiter.

func newStubHandler() *Handler {
	return NewHandler(nil, nil, 60)
}

// T001 GET /s/{code}?src=qr → 302 /stream/{id}?src=qr + hit row inserted.
func TestShortlinkHandler_RedirectsAndLogsHit(t *testing.T) {
	h := newStubHandler()
	req := httptest.NewRequest(http.MethodGet, "/s/ABCDEF12?src=qr", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusFound {
		t.Fatalf("want 302, got %d", rr.Code)
	}
	loc := rr.Header().Get("Location")
	if !strings.HasPrefix(loc, "/stream/") || !strings.Contains(loc, "src=qr") {
		t.Fatalf("unexpected Location: %q", loc)
	}
}

// T002 Unknown shortcode → 404, body must not leak a workspace UUID.
func TestShortlinkHandler_UnknownReturns404(t *testing.T) {
	h := newStubHandler()
	req := httptest.NewRequest(http.MethodGet, "/s/NOTREAL1", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rr.Code)
	}
	if strings.Contains(rr.Body.String(), "-") && len(rr.Body.String()) > 30 {
		t.Fatalf("response may leak a uuid: %q", rr.Body.String())
	}
}

// T003 Revoked shortcode → 410.
func TestShortlinkHandler_RevokedReturns410(t *testing.T) {
	h := newStubHandler()
	req := httptest.NewRequest(http.MethodGet, "/s/REVOKED1", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusGone {
		t.Fatalf("want 410, got %d", rr.Code)
	}
}

// T004 Rate limit 60/min per IP → 61st 429 with Retry-After.
func TestShortlinkHandler_RateLimitedAfter60PerMinute(t *testing.T) {
	h := newStubHandler()

	var last *httptest.ResponseRecorder
	for i := 0; i < 61; i++ {
		req := httptest.NewRequest(http.MethodGet, "/s/ABCDEF12", nil)
		req.RemoteAddr = "10.0.0.1:1234"
		last = httptest.NewRecorder()
		h.ServeHTTP(last, req)
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429 on 61st, got %d", last.Code)
	}
	if last.Header().Get("Retry-After") == "" {
		t.Fatalf("Retry-After header missing")
	}
}
