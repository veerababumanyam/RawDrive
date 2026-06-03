package middleware

import "net/http"

// Content-Security-Policy applied to all API responses. Kept as a package-level
// constant so it can be referenced from tests and adjusted in one place.
//
// F-010 (audit 2026-04-10): this CSP is deliberately NOT a nonce-based strict
// policy because the API does not serve HTML — requests hitting a JSON
// endpoint never render a browser document. The policy is still set on API
// responses as a defense-in-depth measure in case a downstream proxy or
// caching layer ever misroutes an HTML payload through this origin. The
// frontend (Next.js) sets its own CSP via next.config.ts headers().
//
// Directives explained:
//   - default-src 'self'            — same-origin fallback for anything not covered
//   - script-src 'self'             — scripts only from our origin; rejects inline
//   - style-src 'self' 'unsafe-inline' — inline styles allowed (needed for some
//     error pages rendered by Chi)
//   - img-src 'self' data: blob: https: — WebP derivatives + data URIs for tiny icons
//   - connect-src 'self' https:     — WebSocket/XHR to our origin + HTTPS upstreams
//   - font-src 'self' data:         — self-hosted fonts + data: for inline glyphs
//   - object-src 'none'             — zero Flash/plugin legacy
//   - frame-ancestors 'none'        — anti-clickjacking (mirrors X-Frame-Options)
//   - base-uri 'self'               — prevents base-tag injection URL rewriting
//   - form-action 'self'            — form submissions only to our origin
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob: https:; " +
	"connect-src 'self' https:; " +
	"font-src 'self' data:; " +
	"object-src 'none'; " +
	"frame-ancestors 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'"

// permissionsPolicy locks down browser capability APIs the API does not use.
// camera/microphone are negotiated at-use by the streaming client, not via
// top-level policy — if streaming ever breaks because of this header, the
// fix is to relax THESE two entries, not drop the whole header.
const permissionsPolicy = "camera=(), microphone=(), geolocation=(), " +
	"payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), " +
	"fullscreen=(self)"

// SecurityHeaders adds standard security headers to every response.
//
// F-010 (audit 2026-04-10): expanded from the original 4-header set to cover
// the modern OWASP A05 baseline: CSP, Referrer-Policy, and Permissions-Policy
// were all absent. The pre-existing X-Frame-Options / X-Content-Type-Options /
// HSTS / X-XSS-Protection are retained for backward compat with older clients
// (X-XSS-Protection is a no-op on modern browsers but harmless).
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Legacy headers retained for compat.
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")

		// F-010 additions: modern OWASP A05 baseline.
		w.Header().Set("Content-Security-Policy", contentSecurityPolicy)
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", permissionsPolicy)

		next.ServeHTTP(w, r)
	})
}
