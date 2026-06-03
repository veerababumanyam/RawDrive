package middleware

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/ctxkeys"
)

// ──────────────────────────── Context Keys ────────────────────────────

type contextKey string

const (
	jwtClaimsKey   contextKey = "jwt_claims"
	workspaceIDKey contextKey = "workspace_id"
	stateIDKey     contextKey = "state_id"
	// planTierKey holds the resolved plan_tier string for the tenant.
	// M41 FR-UCRT-07 — stashed on the context by the TenantContext chain
	// after workspace_id resolution so downstream handlers (chunked upload,
	// gate reservation, etc.) can read it via PlanTierFromContext without
	// another workspaces SELECT per request.
	planTierKey contextKey = "plan_tier"
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

// WithPlanTier stashes a plan_tier string on the context. Intended for
// TenantContext (which reads it from the workspaces table after resolving
// workspace_id from claims) and for tests that inject tenant context
// directly. Accepts the same strings as the workspaces.plan_tier column:
// "standard" | "professional" | "pro" | "enterprise" | "trial". Empty
// strings are allowed and surface as the empty default on read — callers
// MUST treat missing plan tier as "not enterprise" for safety (so they
// keep enforcing the balance gate).
func WithPlanTier(ctx context.Context, planTier string) context.Context {
	return context.WithValue(ctx, planTierKey, planTier)
}

// PlanTierFromContext returns the plan_tier string stashed by the
// TenantContext middleware (or by WithPlanTier in tests). Returns empty
// string if not set. M41 FR-UCRT-07: callers such as the chunked upload
// handler use this to decide whether to set
// credit.ReserveInput.EnterpriseUnlimited=true before dispatching a
// reservation, so enterprise workspaces bypass the balance gate.
func PlanTierFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(planTierKey).(string); ok {
		return v
	}
	return ""
}

// ──────────────────────────── Interfaces ────────────────────────────

type DBContext interface {
	SetWorkspaceID(ctx context.Context, workspaceID string) error
}

type AuditLog interface {
	LogAccess(ctx context.Context, workspaceID, action, ipAddress, userAgent string)
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

			// Log access — capture real client IP (proxy-aware) and user-agent
			clientIP := r.Header.Get("X-Forwarded-For")
			if clientIP != "" {
				// X-Forwarded-For may contain multiple IPs; take the first (original client)
				if i := strings.Index(clientIP, ","); i > 0 {
					clientIP = strings.TrimSpace(clientIP[:i])
				}
			} else if clientIP = r.Header.Get("X-Real-IP"); clientIP == "" {
				clientIP = r.RemoteAddr
				// Strip port from host:port
				if i := strings.LastIndex(clientIP, ":"); i > 0 {
					clientIP = clientIP[:i]
				}
			}
			audit.LogAccess(r.Context(), wsID, r.Method+" "+r.URL.Path, clientIP, r.UserAgent())

			// Enrich context
			ctx := context.WithValue(r.Context(), workspaceIDKey, wsID)
			ctx = context.WithValue(ctx, stateIDKey, stateID)
			ctx = context.WithValue(ctx, ctxkeys.WorkspaceID, wsID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ──────────────────────────── Plan Tier Middleware (M41 FR-UCRT-07) ────────────────────────────

// PlanTierRow is the minimal shape PlanTierContext consumes from a
// QueryRow result. Exported so main.go's *pgxpool.Pool adapter can name
// it as the return type of its QueryRow method — Go cannot match an
// anonymous interface{Scan(...)} against a named interface through a
// returns-interface method.
type PlanTierRow interface {
	Scan(dest ...any) error
}

// PlanTierPool is the narrow interface PlanTierContext needs. The
// middleware cannot depend on pgxpool directly because pgx.Row's
// concrete type is not assignable to an interface{Scan(...)} via
// go's structural typing when passed through a returns-interface method.
// Production wires this via a thin adapter wrapping *pgxpool.Pool in
// main.go. Tests satisfy it directly with a fake.
type PlanTierPool interface {
	QueryRow(ctx context.Context, sql string, args ...any) PlanTierRow
}

// PlanTierContext reads the workspaces.plan_tier for the current tenant
// (resolved from WorkspaceIDFromContext) and stashes it on the request
// context via WithPlanTier. MUST be registered AFTER TenantContext in the
// middleware chain so workspace_id is already on the context.
//
// Failure policy: plan_tier lookup failures (DB hiccup, missing workspace
// row) do NOT block the request — the handler downstream proceeds with an
// empty plan tier, which PlanTierFromContext surfaces as "". Callers MUST
// treat empty plan tier as "not enterprise" so the default posture keeps
// the balance gate enforced. This is deliberate: a transient DB failure
// must never silently upgrade a standard workspace to unlimited uploads.
//
// If pool is nil, the middleware is a no-op. This lets routers wire the
// middleware unconditionally — tests and degraded deployments where the
// plan-tier table isn't ready yet simply skip the enrichment.
func PlanTierContext(pool PlanTierPool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if pool == nil {
				next.ServeHTTP(w, r)
				return
			}
			wsID := WorkspaceIDFromContext(r.Context())
			if wsID == "" {
				// No workspace — no plan tier to resolve. Pass through.
				next.ServeHTTP(w, r)
				return
			}
			var planTier string
			row := pool.QueryRow(r.Context(),
				`SELECT COALESCE(plan_tier, '') FROM workspaces WHERE id = $1`, wsID)
			// Fail-open-to-empty on scan error (see doc comment above): an
			// empty tier downgrades privileges, it never escalates them.
			// A "no rows" result just means the workspace row is absent, which
			// is a legitimate empty-tier case and must not be logged as a fault.
			// We can't import pgx here (it isn't in this package's import set),
			// and the production adapter may surface its own no-rows sentinel
			// (pgx.ErrNoRows) rather than sql.ErrNoRows, so we treat both the
			// database/sql sentinel AND the canonical "no rows in result set"
			// message (shared verbatim by pgx) as the benign absent-row case.
			// Any OTHER scan error is a transient/structural lookup failure
			// that was previously invisible — emit a WARN so it is observable.
			if err := row.Scan(&planTier); err != nil && !isNoRows(err) {
				slog.Warn("middleware: plan tier scan failed; defaulting to empty tier",
					"workspace_id", wsID,
					"error", err,
				)
				planTier = ""
			}
			ctx := WithPlanTier(r.Context(), planTier)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// isNoRows reports whether err represents an empty result set. It matches the
// database/sql sentinel via errors.Is and, defensively, the canonical
// "no rows in result set" message that pgx (the production driver behind the
// PlanTierPool adapter) returns — so an absent workspace is never mislabeled
// as a lookup fault regardless of which driver the adapter wraps. The
// middleware package does not import pgx, so we cannot errors.Is against
// pgx.ErrNoRows directly; the message comparison keeps the check dependency
// free while staying correct for both drivers.
func isNoRows(err error) bool {
	if errors.Is(err, sql.ErrNoRows) {
		return true
	}
	return strings.Contains(err.Error(), "no rows in result set")
}

// ──────────────────────────── State Check Middleware ────────────────────────────

// sentinelPendingOnboarding mirrors the "pending-onboarding" value the auth
// layer stamps into the workspace_id / state_id claims for a session whose
// user has not yet completed onboarding. RequireState treats it as "no real
// state" so such sessions cannot reach state-gated routes.
const sentinelPendingOnboarding = "pending-onboarding"

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
		// AREA-CUSTOMER-2 (audit 2026-05-31): reject BOTH the empty string
		// and the "pending-onboarding" sentinel. An un-onboarded session
		// carries state_id="pending-onboarding" (not ""), so checking only
		// the empty string let pending sessions slip through to state-gated
		// routes. The sentinel is the canonical "no real state yet" marker.
		if stateID == "" || stateID == sentinelPendingOnboarding {
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

// defaultTrustedProxyCIDRs are the private/loopback ranges trusted to set
// X-Forwarded-For / X-Real-IP when TRUSTED_PROXY_CIDR is not configured.
// In production the only hop in front of the API is the nginx container on
// the docker bridge network (172.16.0.0/12), plus the host's own
// loopback/private ranges. These are used ONLY as a fallback and a warning
// is logged so ops know to set TRUSTED_PROXY_CIDR explicitly. They are NOT
// secrets — they are RFC 1918 / loopback ranges, never public addresses.
var defaultTrustedProxyCIDRs = []string{
	"127.0.0.0/8",    // IPv4 loopback (same-host / tests)
	"::1/128",        // IPv6 loopback
	"10.0.0.0/8",     // RFC 1918
	"172.16.0.0/12",  // RFC 1918 (docker default bridge range)
	"192.168.0.0/16", // RFC 1918
}

// parseTrustedProxyCIDRs reads TRUSTED_PROXY_CIDR (comma-separated CIDRs)
// and returns the parsed networks. Config resolution follows the project
// order: env var present → use it; absent → fall back to the documented
// private/loopback defaults and warn (feature stays enabled but with the
// safe default posture, never disabled — rate limiting is a hard security
// control). Unparseable entries are skipped with a warning rather than
// crashing the boot path.
func parseTrustedProxyCIDRs() []*net.IPNet {
	raw := strings.TrimSpace(os.Getenv("TRUSTED_PROXY_CIDR"))
	specs := defaultTrustedProxyCIDRs
	if raw != "" {
		specs = strings.Split(raw, ",")
	} else {
		log.Printf("middleware: TRUSTED_PROXY_CIDR not set — defaulting to private/loopback ranges %v for proxy-header trust; set it explicitly in production", defaultTrustedProxyCIDRs)
	}
	nets := make([]*net.IPNet, 0, len(specs))
	for _, spec := range specs {
		spec = strings.TrimSpace(spec)
		if spec == "" {
			continue
		}
		_, ipNet, err := net.ParseCIDR(spec)
		if err != nil {
			log.Printf("middleware: ignoring invalid TRUSTED_PROXY_CIDR entry %q: %v", spec, err)
			continue
		}
		nets = append(nets, ipNet)
	}
	return nets
}

// ipIsTrusted reports whether the given host IP falls within any trusted
// proxy CIDR.
func ipIsTrusted(host string, trusted []*net.IPNet) bool {
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	for _, n := range trusted {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// clientIPForRateLimit returns the IP address to key a rate-limit bucket on.
//
// SECURITY (F-008): X-Forwarded-For / X-Real-IP are attacker-controlled on a
// direct connection. We only honor them when the immediate peer
// (r.RemoteAddr) is itself a trusted proxy — otherwise an attacker could
// rotate spoofed XFF values to defeat every in-memory limiter (the 5/min
// auth brute-force guard, the 10/min TOTP guard, and the global 600/min
// limit). When the peer is untrusted we key strictly on the real peer host
// from net.SplitHostPort(r.RemoteAddr), which cannot be spoofed without a
// new TCP connection from a new source address.
func clientIPForRateLimit(r *http.Request, trusted []*net.IPNet) string {
	peerHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// RemoteAddr had no port (unusual, e.g. some test transports) —
		// use it verbatim as the peer host.
		peerHost = r.RemoteAddr
	}

	// Only trust forwarding headers when the direct peer is a known proxy.
	if ipIsTrusted(peerHost, trusted) {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			// XFF is "client, proxy1, proxy2"; the left-most entry is the
			// original client as seen by our trusted edge.
			first := xff
			if i := strings.Index(xff, ","); i > 0 {
				first = xff[:i]
			}
			if first = strings.TrimSpace(first); first != "" {
				return first
			}
		}
		if xrip := strings.TrimSpace(r.Header.Get("X-Real-IP")); xrip != "" {
			return xrip
		}
	}

	// Untrusted peer (or trusted peer that sent no forwarding header):
	// key on the unspoofable TCP source address.
	return peerHost
}

func RateLimit(maxRequests int, window time.Duration) func(http.Handler) http.Handler {
	h, _ := RateLimitWithReset(maxRequests, window)
	return h
}

// RateLimitWithReset is identical to RateLimit but also returns a reset func
// that clears all counters. Intended for development/test use: register the
// reset func behind a dev-only HTTP endpoint so automated test suites can
// drain the in-memory bucket between test runs without restarting the server.
func RateLimitWithReset(maxRequests int, window time.Duration) (func(http.Handler) http.Handler, func()) {
	var mu sync.Mutex
	entries := make(map[string]*rateLimitEntry)

	// Parse the trusted-proxy allowlist once at construction time so every
	// request handled by this limiter shares the same policy. All three
	// in-memory limiters (credLimiter 5/min, mfaVerifyLimiter 10/min, and
	// the global 600/min limiter) route through here, so they all inherit
	// the F-008 anti-spoofing fix.
	trusted := parseTrustedProxyCIDRs()

	reset := func() {
		mu.Lock()
		entries = make(map[string]*rateLimitEntry)
		mu.Unlock()
	}

	handler := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// 2026-05-20: bucket by the real client IP, not the immediate
			// peer. In production every request arrives from the nginx
			// container so r.RemoteAddr resolves to a single internal docker
			// IP (e.g. 172.18.0.4) for every user — one user's traffic burns
			// the entire budget and everyone else gets 429.
			//
			// SECURITY (F-008): forwarding headers are honored ONLY when the
			// direct peer (r.RemoteAddr) is inside a trusted proxy CIDR.
			// Otherwise we key strictly on the unspoofable TCP source so an
			// attacker cannot rotate fake X-Forwarded-For values to bypass
			// the brute-force / TOTP / global limits. See clientIPForRateLimit.
			ip := clientIPForRateLimit(r, trusted)

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

	return handler, reset
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
