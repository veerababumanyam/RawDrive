package middleware

import (
	"net/http"
	"net/url"
	"os"
	"strings"
)

// CORS adds Cross-Origin Resource Sharing headers.
// In development, it allows loopback origins; in production, it allows the
// configured FRONTEND_URL and RawDrive first-party HTTPS origins.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		frontendURL := os.Getenv("FRONTEND_URL")
		origin := r.Header.Get("Origin")

		// Determine allowed origin. APP_ENV is the canonical deployment
		// environment knob; GO_ENV remains as a backward-compatible alias.
		allowedOrigin := ""
		if origin != "" {
			appEnv := strings.ToLower(os.Getenv("APP_ENV"))
			goEnv := strings.ToLower(os.Getenv("GO_ENV"))
			isProduction := appEnv == "production" || appEnv == "prod" || goEnv == "production" || goEnv == "prod"
			if !isProduction {
				// Non-prod local work often runs the Next.js dev server on a
				// different port than the Go API. Parse the host instead of
				// prefix-matching so localhost.evil is not accidentally allowed.
				if isLoopbackOrigin(origin) {
					allowedOrigin = origin
				}
			}
			// Also allow the configured frontend URL
			if frontendURL != "" && strings.TrimRight(origin, "/") == strings.TrimRight(frontendURL, "/") {
				allowedOrigin = origin
			}
			if isProduction && isRawDriveFirstPartyOrigin(origin) {
				allowedOrigin = origin
			}
		}

		if allowedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			// Include TUS-style resumable upload headers so the chunked
			// upload flow (PATCH /api/v1/uploads/{id} with Upload-Offset +
			// Upload-Length and the Tus-Resumable version marker) passes
			// the browser preflight. Without these, Chromium blocks the
			// actual PATCH request with "Request header field upload-offset
			// is not allowed by Access-Control-Allow-Headers in preflight
			// response." — the exact error that surfaced for image uploads
			// from the gallery page.
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Requested-With, Upload-Offset, Upload-Length, Tus-Resumable")
			// Expose those same TUS headers so the frontend reader can
			// observe the server's Upload-Offset after each PATCH (that's
			// how resumable upload clients track progress).
			w.Header().Set("Access-Control-Expose-Headers", "Upload-Offset, Upload-Length, Tus-Resumable")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}

		// Handle preflight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func isRawDriveFirstPartyOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if parsed.Scheme != "https" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "rawdrive.in" || host == "www.rawdrive.in"
}

func isLoopbackOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
