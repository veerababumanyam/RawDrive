package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/rawdrive/backend/internal/auth"
)

// JWTAuth creates a middleware that validates Bearer tokens and injects claims into context.
func JWTAuth(jwtSvc auth.JWTService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := parts[1]
			claims, err := jwtSvc.ParseAccessToken(r.Context(), tokenStr)
			if err != nil {
				http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			// Inject claims into context as map[string]interface{} for TenantContext
			claimsMap := map[string]interface{}{
				"sub":           claims.Sub,
				"workspace_id":  claims.WorkspaceID,
				"role":          claims.Role,
				"platform_role": claims.PlatformRole,
				"state_id":      claims.StateID,
			}

			ctx := WithJWTClaims(r.Context(), claimsMap)
			// Also set user_id for handlers that need it directly
			ctx = context.WithValue(ctx, contextKey("user_id"), claims.Sub)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
