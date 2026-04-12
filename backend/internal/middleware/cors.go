package middleware

import (
	"net/http"
	"os"
	"strings"
)

// CORS adds Cross-Origin Resource Sharing headers.
// In development, it allows all origins; in production, it restricts to FRONTEND_URL.
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
			if !isProduction && (goEnv == "development" || goEnv == "dev" || appEnv == "development" || appEnv == "dev" || (goEnv == "" && appEnv == "")) {
				// Dev: allow any localhost origin
				if strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1") {
					allowedOrigin = origin
				}
			}
			// Also allow the configured frontend URL
			if frontendURL != "" && strings.TrimRight(origin, "/") == strings.TrimRight(frontendURL, "/") {
				allowedOrigin = origin
			}
		}

		if allowedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Requested-With")
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
