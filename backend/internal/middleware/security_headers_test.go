package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/middleware"
)

// Tests for F-010 (audit 2026-04-10): the SecurityHeaders middleware must set
// a baseline set of hardened response headers. Before this fix the middleware
// only set X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, and
// Strict-Transport-Security — no CSP, no Referrer-Policy, no Permissions-Policy.
// OWASP A05 scored red for exactly this gap.

// helper — run a no-op inner handler through the middleware and return the
// recorded response.
func runSecurityHeaders(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := middleware.SecurityHeaders(next)
	req := httptest.NewRequest(http.MethodGet, "/anything", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestSecurityHeaders_PreexistingHeadersStillSet(t *testing.T) {
	rr := runSecurityHeaders(t)

	assert.Equal(t, "DENY", rr.Header().Get("X-Frame-Options"),
		"X-Frame-Options must still be DENY (regression guard)")
	assert.Equal(t, "nosniff", rr.Header().Get("X-Content-Type-Options"),
		"X-Content-Type-Options must still be nosniff")
	assert.Contains(t, rr.Header().Get("Strict-Transport-Security"), "max-age=",
		"HSTS must still be present")
}

func TestSecurityHeaders_ContentSecurityPolicySet(t *testing.T) {
	rr := runSecurityHeaders(t)

	csp := rr.Header().Get("Content-Security-Policy")
	assert.NotEmpty(t, csp, "Content-Security-Policy must be set (F-010)")
	// Spot-check the critical directives. Exact form can evolve as the CSP
	// tightens over time, but these four should never drop.
	assert.Contains(t, csp, "default-src 'self'",
		"CSP must set a 'self' default-src fallback")
	assert.Contains(t, csp, "object-src 'none'",
		"CSP must block plugin/object embedding")
	assert.Contains(t, csp, "frame-ancestors 'none'",
		"CSP must prevent clickjacking via frame-ancestors")
	assert.Contains(t, csp, "base-uri 'self'",
		"CSP must restrict base-uri to prevent base-tag injection")
}

func TestSecurityHeaders_ReferrerPolicySet(t *testing.T) {
	rr := runSecurityHeaders(t)

	rp := rr.Header().Get("Referrer-Policy")
	assert.NotEmpty(t, rp, "Referrer-Policy must be set (F-010)")
	// strict-origin-when-cross-origin is the modern default that balances
	// analytics utility (origin only) with privacy (no path/query leakage).
	assert.Contains(t, strings.ToLower(rp), "strict-origin-when-cross-origin",
		"Referrer-Policy should be strict-origin-when-cross-origin")
}

func TestSecurityHeaders_PermissionsPolicySet(t *testing.T) {
	rr := runSecurityHeaders(t)

	pp := rr.Header().Get("Permissions-Policy")
	assert.NotEmpty(t, pp, "Permissions-Policy must be set (F-010)")
	// Lock down the sensor/credential APIs that RawDrive does not use. The
	// camera/microphone APIs are only needed by the WebRTC-based streaming
	// features, which negotiate permissions at the point of use rather than
	// relying on the top-level policy header. If streaming starts failing
	// in production because of this header, the fix is to remove 'camera'
	// and 'microphone' — not to drop the whole header.
	assert.Contains(t, pp, "camera=()",
		"Permissions-Policy should deny camera by default")
	assert.Contains(t, pp, "microphone=()",
		"Permissions-Policy should deny microphone by default")
	assert.Contains(t, pp, "geolocation=()",
		"Permissions-Policy should deny geolocation by default")
}
