package middleware

import (
	"context"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
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

			// Cross-workspace protection: if the URL targets a different workspace, deny
			if strings.Contains(r.URL.Path, "/workspaces/") {
				parts := strings.Split(r.URL.Path, "/workspaces/")
				if len(parts) > 1 {
					urlWS := strings.Split(parts[1], "/")[0]
					if urlWS != "" && urlWS != wsID {
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
