package middleware

import (
	"context"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ──────────────────────────── Context Keys ────────────────────────────

type contextKey string

const (
	jwtClaimsKey   contextKey = "jwt_claims"
	workspaceIDKey contextKey = "workspace_id"
	stateIDKey     contextKey = "state_id"
)

func WithJWTClaims(ctx context.Context, claims map[string]interface{}) context.Context {
	return context.WithValue(ctx, jwtClaimsKey, claims)
}

func JWTClaimsFromContext(ctx context.Context) map[string]interface{} {
	if v, ok := ctx.Value(jwtClaimsKey).(map[string]interface{}); ok {
		return v
	}
	return nil
}

func WorkspaceIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(workspaceIDKey).(string); ok {
		return v
	}
	return ""
}

// WithWorkspaceID sets the workspace ID on the context using the typed key
// that WorkspaceIDFromContext reads. Intended for tests and any code path
// that needs to inject workspace context without going through the full
// TenantContext middleware chain (which requires DBContext + AuditLog deps).
//
// Production code should normally enter the workspace ID via TenantContext
// from JWT claims, not by calling this directly.
func WithWorkspaceID(ctx context.Context, workspaceID string) context.Context {
	return context.WithValue(ctx, workspaceIDKey, workspaceID)
}

func StateIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(stateIDKey).(string); ok {
		return v
	}
	return ""
}

// ──────────────────────────── Interfaces ────────────────────────────

type DBContext interface {
	SetWorkspaceID(ctx context.Context, workspaceID string) error
}

type AuditLog interface {
	LogAccess(ctx context.Context, workspaceID, action string)
}

// ──────────────────────────── Tenant Middleware ────────────────────────────

func TenantContext(db DBContext, audit AuditLog) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := JWTClaimsFromContext(r.Context())
			if claims == nil {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}

			wsID, _ := claims["workspace_id"].(string)
			stateID, _ := claims["state_id"].(string)

			if wsID == "" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}

			// Cross-workspace protection: if the URL targets a different workspace, deny.
			// EXCEPTION: platform admins (super_admin / admin) operating on the
			// /api/v1/admin/* surface are explicitly allowed to act on workspaces
			// other than their own — that IS the point of the admin surface
			// (impersonation, moderation, policy management). Without this
			// exception M16's admin workspace policy + upload moderation endpoints
			// were architecturally unreachable: a super_admin's JWT carries their
			// own personal workspace_id, never the workspace they are managing,
			// so the strict same-workspace check would 403 every cross-workspace
			// admin request. (M16-BUG-01 — caught during functional testing.)
			isPlatformAdminOnAdminPath := false
			if platformRole, _ := claims["platform_role"].(string); platformRole == "super_admin" || platformRole == "admin" {
				if strings.HasPrefix(r.URL.Path, "/api/v1/admin/") {
					isPlatformAdminOnAdminPath = true
				}
			}

			if !isPlatformAdminOnAdminPath && strings.Contains(r.URL.Path, "/workspaces/") {
				parts := strings.Split(r.URL.Path, "/workspaces/")
				if len(parts) > 1 {
					urlWS := strings.Split(parts[1], "/")[0]
					// Exempt the literal "current" keyword. Handlers that sit
					// under /api/v1/workspaces/current/* (e.g. GetCurrentPlan
					// from F-011) intentionally read the workspace id from
					// JWT claims rather than the URL so the client cannot
					// spoof a different workspace. The strict same-uuid
					// check would otherwise 403 them because "current" never
					// equals the JWT's workspace UUID. (UAT 2026-04-12 —
					// /settings/storage loaded with a 403 from
					// /api/v1/workspaces/current/plan for @pho_pro.)
					if urlWS != "" && urlWS != wsID && urlWS != "current" {
						http.Error(w, "Forbidden", http.StatusForbidden)
						return
					}
				}
			}

			// Set DB context for RLS
			_ = db.SetWorkspaceID(r.Context(), wsID)

			// Log access
			audit.LogAccess(r.Context(), wsID, r.Method+" "+r.URL.Path)

			// Enrich context
			ctx := context.WithValue(r.Context(), workspaceIDKey, wsID)
			ctx = context.WithValue(ctx, stateIDKey, stateID)
			ctx = context.WithValue(ctx, "workspace_id", wsID) // plain key for ai package (import cycle prevents typed key sharing)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ──────────────────────────── State Check Middleware ────────────────────────────

func RequireState(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip onboarding routes
		if strings.HasPrefix(r.URL.Path, "/onboarding") {
			next.ServeHTTP(w, r)
			return
		}

		claims := JWTClaimsFromContext(r.Context())
		if claims == nil {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		stateID, _ := claims["state_id"].(string)
		if stateID == "" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ──────────────────────────── Rate Limit Middleware ────────────────────────────

type rateLimitEntry struct {
	count     int
	windowEnd time.Time
}

func RateLimit(maxRequests int, window time.Duration) func(http.Handler) http.Handler {
	var mu sync.Mutex
	entries := make(map[string]*rateLimitEntry)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip, _, _ := net.SplitHostPort(r.RemoteAddr)
			if ip == "" {
				ip = r.RemoteAddr
			}

			mu.Lock()
			now := time.Now()
			entry, ok := entries[ip]
			if !ok || now.After(entry.windowEnd) {
				entries[ip] = &rateLimitEntry{
					count:     1,
					windowEnd: now.Add(window),
				}
				mu.Unlock()
				next.ServeHTTP(w, r)
				return
			}

			entry.count++
			if entry.count > maxRequests {
				mu.Unlock()
				http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
				return
			}
			mu.Unlock()

			next.ServeHTTP(w, r)
		})
	}
}

// ──────────────────────────── Admin Auth Middleware ────────────────────────────

// RequireAuth is chi middleware that ensures a valid JWT is present.
// It wraps the existing JWTAuth mechanism and rejects unauthenticated requests.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := JWTClaimsFromContext(r.Context())
		if claims == nil {
			http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequirePlatformRole returns chi middleware that checks the user's platform_role JWT claim.
// Accepts variadic roles for OR-matching: RequirePlatformRole("super_admin", "admin")
// means the user must have either super_admin OR admin as their platform role.
func RequirePlatformRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := JWTClaimsFromContext(r.Context())
			if claims == nil {
				http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
				return
			}
			userPlatformRole, _ := claims["platform_role"].(string)
			if !allowed[userPlatformRole] {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireWorkspaceRole returns chi middleware that checks the user's workspace role claim
// using a hierarchy: Owner(4) > Admin(3) > Editor(2) > Viewer(1).
// The user must have at least the specified minimum role level.
func RequireWorkspaceRole(minRole string) func(http.Handler) http.Handler {
	roleLevel := map[string]int{
		"Owner": 4, "Admin": 3, "Editor": 2, "Viewer": 1,
	}
	minLevel := roleLevel[minRole]
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := JWTClaimsFromContext(r.Context())
			if claims == nil {
				http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
				return
			}
			userRole, _ := claims["role"].(string)
			if roleLevel[userRole] < minLevel {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireRole is kept for backward compatibility — delegates to RequirePlatformRole.
// Deprecated: Use RequirePlatformRole for platform-level checks or RequireWorkspaceRole for workspace-level checks.
func RequireRole(role string) func(http.Handler) http.Handler {
	return RequirePlatformRole(role)
}

// RejectImpersonationWrites blocks mutating requests (POST/PUT/PATCH/DELETE) when
// the JWT contains an "impersonation": true claim. Impersonated sessions are read-only.
func RejectImpersonationWrites(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := JWTClaimsFromContext(r.Context())
		if claims != nil {
			if imp, _ := claims["impersonation"].(bool); imp {
				if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
					http.Error(w, `{"error":"impersonated sessions are read-only"}`, http.StatusForbidden)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

// GetActorID extracts the actor (admin) UUID from JWT claims in the request context.
func GetActorID(ctx context.Context) uuid.UUID {
	claims := JWTClaimsFromContext(ctx)
	if claims == nil {
		return uuid.Nil
	}
	sub, _ := claims["sub"].(string)
	id, _ := uuid.Parse(sub)
	return id
}
