package middleware

// api_key_auth.go — middleware for authenticating requests via developer
// platform API keys (M9 E25-S1).
//
// Usage: mount on routes that should accept API key auth. Looks for the
// key in the Authorization header in two formats:
//
//	Authorization: Bearer rd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//	Authorization: Api-Key rd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//
// On success, the request context is enriched with:
//	- workspaceIDKey      (so RLS works without a JWT)
//	- ctxkeys.WorkspaceID (typed key for the ai package)
//	- apiKeyKey           (the *repository.APIKey itself, for scope checks)
//
// On failure, returns 401 with a JSON error body. The verifier is passed
// in as an interface so the middleware doesn't depend on the service
// package directly (avoids cycle).

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/rawdrive/backend/internal/ctxkeys"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// APIKeyVerifier is the narrow surface api_key_auth needs from the
// service. *service.APIKeyService satisfies it.
type APIKeyVerifier interface {
	VerifyKey(ctx context.Context, cleartext string) (*repository.APIKey, error)
}

const apiKeyKey contextKey = "api_key"

// APIKeyFromContext returns the verified API key, or nil if the request
// was not authenticated via API key.
func APIKeyFromContext(ctx context.Context) *repository.APIKey {
	if v, ok := ctx.Value(apiKeyKey).(*repository.APIKey); ok {
		return v
	}
	return nil
}

// APIKeyAuth returns chi middleware that authenticates requests with an
// API key in the Authorization header. When verifier is nil the middleware
// is a no-op (all requests pass through unauthenticated) so callers can
// wire it conditionally without changing the route definition.
func APIKeyAuth(verifier APIKeyVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if verifier == nil {
				next.ServeHTTP(w, r)
				return
			}
			cleartext, ok := extractBearerOrAPIKey(r.Header.Get("Authorization"))
			if !ok {
				http.Error(w, `{"error":"missing or malformed Authorization header"}`, http.StatusUnauthorized)
				return
			}
			key, err := verifier.VerifyKey(r.Context(), cleartext)
			if err != nil {
				// Translate known errors to 401 with a stable message; do
				// NOT echo the verifier's error text since it may leak
				// internal hashing details on edge cases.
				switch {
				case errors.Is(err, service.ErrAPIKeyMalformed),
					errors.Is(err, service.ErrAPIKeyNotFound),
					errors.Is(err, service.ErrAPIKeyRevoked),
					errors.Is(err, service.ErrAPIKeyExpired):
					http.Error(w, `{"error":"invalid api key"}`, http.StatusUnauthorized)
				default:
					http.Error(w, `{"error":"api key verification failed"}`, http.StatusInternalServerError)
				}
				return
			}

			// Enrich the context: API key + workspace identifiers so the
			// rest of the request stack behaves as if a JWT had been used.
			ctx := context.WithValue(r.Context(), apiKeyKey, key)
			ctx = context.WithValue(ctx, workspaceIDKey, key.WorkspaceID.String())
			ctx = context.WithValue(ctx, ctxkeys.WorkspaceID, key.WorkspaceID.String())

			// Synthesize JWT claims so handlers under /api/v1/dp/* that read
			// middleware.JWTClaimsFromContext (or GetActorID / RequireWorkspaceRole)
			// behave identically whether the request authenticated via a session
			// JWT or an API key. Without this, those reads returned nil/"" and
			// uuid.Parse("") silently yielded uuid.Nil — attributing API-key
			// actions to the nil actor and 401-ing role-gated dp routes despite
			// valid key auth (S5-G3). The shape mirrors JWTAuth's claimsMap
			// (including the "user_id" mirror of "sub").
			//
			// Actor identity: prefer the key's owner (CreatedBy). Some keys may
			// predate owner tracking (CreatedBy nil); fall back to the key's own
			// ID so the actor is a stable, non-nil UUID rather than uuid.Nil.
			actorID := key.ID
			if key.CreatedBy != nil {
				actorID = *key.CreatedBy
			}
			// Workspace role for API keys is "Admin": sufficient for the
			// programmatic dp surface (Editor/Admin-gated routes) without
			// claiming "Owner", which is reserved for the human account owner
			// and gates the most destructive operations. The key's real
			// capability boundary is enforced separately by RequireAPIKeyScope.
			claimsMap := map[string]interface{}{
				"sub":           actorID.String(),
				"user_id":       actorID.String(),
				"workspace_id":  key.WorkspaceID.String(),
				"role":          "Admin",
				"platform_role": "",
				"state_id":      "",
				"mfa_verified":  false,
			}
			ctx = WithJWTClaims(ctx, claimsMap)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAPIKeyScope returns middleware that checks the verified API key
// has the named scope. Mount AFTER APIKeyAuth.
func RequireAPIKeyScope(scope string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := APIKeyFromContext(r.Context())
			if key == nil {
				http.Error(w, `{"error":"api key required"}`, http.StatusUnauthorized)
				return
			}
			for _, s := range key.Scopes {
				if s == scope {
					next.ServeHTTP(w, r)
					return
				}
			}
			http.Error(w, `{"error":"insufficient scope"}`, http.StatusForbidden)
		})
	}
}

// extractBearerOrAPIKey parses the Authorization header. Accepts both
// "Bearer <token>" and "Api-Key <token>" forms (case-insensitive scheme).
func extractBearerOrAPIKey(header string) (string, bool) {
	if header == "" {
		return "", false
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 {
		return "", false
	}
	scheme := strings.ToLower(parts[0])
	if scheme != "bearer" && scheme != "api-key" {
		return "", false
	}
	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", false
	}
	return token, true
}

