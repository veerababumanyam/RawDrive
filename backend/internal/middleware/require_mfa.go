package middleware

import (
	"encoding/json"
	"net/http"
)

// F-007 (M17 wave 4): RequireMFA middleware.
//
// Rejects requests whose access token does NOT carry mfa_verified=true.
// Mounted on routes that must only serve MFA-verified sessions — e.g.
// platform admin endpoints, sensitive workspace settings, or security
// pages. Wave 4 introduces the middleware; actual enforcement (which
// routes it wraps) is layered in per endpoint as a follow-up.
//
// Design choice: the middleware returns 403 (not 401) because the user
// IS authenticated — they just lack the second factor. 401 would
// suggest "re-login", which is incorrect; the client should route to
// the MFA step-up flow instead. The JSON body includes mfa_required
// so SPA clients can detect this case and redirect accordingly.

// RequireMFA returns an http middleware that allows only requests with
// mfa_verified=true in their JWT claim map. Must be mounted AFTER
// JWTAuth so the claim context is populated.
func RequireMFA(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := JWTClaimsFromContext(r.Context())
		if claims == nil {
			writeMFAError(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		verified, _ := claims["mfa_verified"].(bool)
		if !verified {
			writeMFAError(w, http.StatusForbidden, "mfa_required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeMFAError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"error":        code,
		"mfa_required": code == "mfa_required",
	})
}
