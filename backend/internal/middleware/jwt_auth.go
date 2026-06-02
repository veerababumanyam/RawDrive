package middleware

import (
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

			// Inject claims into context as map[string]interface{} for TenantContext.
			// "user_id" mirrors "sub" (the authenticated user's UUID) because
			// several handlers read claims["user_id"] directly (gallery
			// duplication created_by, design-collab presence/lock sessions,
			// design templates). Without this key those reads returned "" and
			// uuid.Parse("") silently yielded uuid.Nil, losing user identity.
			claimsMap := map[string]interface{}{
				"sub":           claims.Sub,
				"user_id":       claims.Sub,
				"workspace_id":  claims.WorkspaceID,
				"role":          claims.Role,
				"platform_role": claims.PlatformRole,
				"state_id":      claims.StateID,
				"mfa_verified":  claims.MFAVerified,
				// S5-G1: surface the impersonation marker so RejectImpersonationWrites
				// (and any handler) can read it via JWTClaimsFromContext. False for
				// normal tokens; true only for admin-minted impersonation sessions.
				"impersonation": claims.Impersonation,
			}

			ctx := WithJWTClaims(r.Context(), claimsMap)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
