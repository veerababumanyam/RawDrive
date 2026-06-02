package main

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"unsafe"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	streamingrecharge "github.com/rawdrive/backend/internal/streaming/recharge"
)

// ── F-010: streaming recharge routes must be split across the authenticated
// `api` router and the unauthenticated outer router. ───────────────────────

// TestF010_RechargeAuthRoutesMountedOnAuthenticatedRouter walks the two routers
// produced by registerStreamingRechargeRoutes and asserts that the
// authenticated endpoints land on the `api` (JWT-bearing) router and the
// public catalogue + webhooks land on the outer router.
//
// Regression guard: before the fix, all routes were mounted on the outer
// unauthenticated router via streamingrecharge.RegisterRoutes(r, ...), so the
// authed routes appeared on the outer router and RequireAuth always 401'd.
func TestF010_RechargeAuthRoutesMountedOnAuthenticatedRouter(t *testing.T) {
	api := chi.NewRouter()
	public := chi.NewRouter()

	registerStreamingRechargeRoutes(api, public, streamingrecharge.NewHandler(nil, nil))

	apiRoutes := collectRoutes(t, api)
	publicRoutes := collectRoutes(t, public)

	wantAPI := []string{
		"POST /api/v1/streaming/recharge",
		"GET /api/v1/streaming/recharges",
		"GET /api/v1/streaming/balance",
		"POST /api/v1/admin/streaming/recharges/{id}/refund",
	}
	for _, want := range wantAPI {
		if !apiRoutes[want] {
			t.Errorf("authenticated route %q must be mounted on the api router, got api=%v", want, keys(apiRoutes))
		}
		if publicRoutes[want] {
			t.Errorf("authenticated route %q must NOT be mounted on the unauthenticated outer router", want)
		}
	}

	wantPublic := []string{
		"GET /api/v1/public/streaming/packages",
		"POST /api/v1/webhooks/phonepe/streaming",
		"POST /api/v1/webhooks/razorpay/streaming",
	}
	for _, want := range wantPublic {
		if !publicRoutes[want] {
			t.Errorf("public/webhook route %q must be mounted on the outer router, got public=%v", want, keys(publicRoutes))
		}
		if apiRoutes[want] {
			t.Errorf("public/webhook route %q must NOT inherit the api group's TenantContext/RequireMFA", want)
		}
	}
}

// TestF010_RechargeAuthRouteAcceptsInjectedClaims proves the end-to-end auth
// behaviour: when the recharge auth routes are mounted on a router whose
// middleware injects JWT claims (as the real `api` group does via JWTAuth),
// RequireAuth lets the request through (no 401). Mounting the same route on a
// bare router (the pre-fix bug) yields a 401.
func TestF010_RechargeAuthRouteAcceptsInjectedClaims(t *testing.T) {
	h := streamingrecharge.NewHandler(nil, nil)

	// `api` mimics main.go's protected group: a middleware that injects JWT
	// claims into the request context (stand-in for middleware.JWTAuth).
	api := chi.NewRouter()
	api.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := map[string]interface{}{
				"sub":          uuid.NewString(),
				"workspace_id": uuid.NewString(),
			}
			next.ServeHTTP(w, r.WithContext(middleware.WithJWTClaims(r.Context(), claims)))
		})
	})
	public := chi.NewRouter()

	registerStreamingRechargeRoutes(api, public, h)

	// Authenticated route, claims present → must clear RequireAuth.
	// An empty body makes CreateRecharge return 400 (invalid_body) before it
	// ever touches the (nil) service, so any non-401 status proves auth passed.
	req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/recharge", strings.NewReader(""))
	rec := httptest.NewRecorder()
	api.ServeHTTP(rec, req)
	if rec.Code == http.StatusUnauthorized {
		t.Fatalf("recharge route on authenticated router returned 401 — RequireAuth did not see injected claims (F-010 regression)")
	}

	// Same route on a bare router (the pre-fix wiring) → 401, the original bug.
	bare := chi.NewRouter()
	bare.With(middleware.RequireAuth).Post("/api/v1/streaming/recharge", h.CreateRecharge)
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/recharge", strings.NewReader(""))
	rec2 := httptest.NewRecorder()
	bare.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusUnauthorized {
		t.Fatalf("control: recharge route on unauthenticated router should 401, got %d", rec2.Code)
	}
}

// ── F-035: storage proxy key sanitization + strict public-thumbnail gate. ───

func TestF035_ValidateStorageKey(t *testing.T) {
	tests := []struct {
		key     string
		wantErr bool
	}{
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/thumb_sm.webp", false},
		{"derivatives/abc/display.webp", false},
		{"workspace/upload/original.jpg", false},
		{"", true},                                 // empty
		{"/thumbnails/x.webp", true},               // leading slash
		{"thumbnails/../derivatives/x.webp", true}, // traversal
		{"../etc/passwd", true},                    // traversal
		{"thumbnails/./x.webp", true},              // non-normalized
		{"a//b.webp", true},                        // non-normalized
	}
	for _, tt := range tests {
		err := validateStorageKey(tt.key)
		if tt.wantErr && err == nil {
			t.Errorf("validateStorageKey(%q) = nil, want error", tt.key)
		}
		if !tt.wantErr && err != nil {
			t.Errorf("validateStorageKey(%q) = %v, want nil", tt.key, err)
		}
	}
}

func TestF035_IsPublicThumbnailKey(t *testing.T) {
	tests := []struct {
		key  string
		want bool
	}{
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/thumb_sm_webp.webp", true},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/thumb_md_webp.webp", true},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/thumb_lg_webp.webp", true},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/thumb_sm.webp", true},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/thumb_md.webp", true},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/thumb_lg.webp", true},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/display.webp", true},
		// Originals and other prefixes must NOT be treated as public.
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/original.jpg", false},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/original.webp", false},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/display_webp.webp", false},
		{"derivatives/123e4567-e89b-12d3-a456-426614174000/display.webp", false},
		{"thumbnails/short-id/thumb_sm.webp", false},
		{"thumbnails/123e4567-e89b-12d3-a456-426614174000/thumb_sm.png", false},
		// Lexical smuggling attempts (these would also be rejected by
		// validateStorageKey, but the strict regex stops them independently).
		{"thumbnails/../originals/secret.webp", false},
		{"thumbnailsX/123e4567-e89b-12d3-a456-426614174000/thumb_sm.webp", false},
	}
	for _, tt := range tests {
		if got := isPublicThumbnailKey(tt.key); got != tt.want {
			t.Errorf("isPublicThumbnailKey(%q) = %v, want %v", tt.key, got, tt.want)
		}
	}
}

// ── F-062: AdminWorkspaceService must be constructed WITH an audit log so
// workspace suspend/unsuspend/delete write to the immutable audit_logs trail. ─

// adminWorkspaceAuditLog reads the unexported `auditLog` field off an
// *service.AdminWorkspaceService so the test can assert whether the audit log
// was actually wired. recordAudit is nil-guarded, so a nil here means every
// suspend/unsuspend/delete silently produces no audit_logs row — the F-062 bug.
func adminWorkspaceAuditLog(t *testing.T, svc *service.AdminWorkspaceService) *service.AuditLogService {
	t.Helper()
	v := reflect.ValueOf(svc).Elem().FieldByName("auditLog")
	if !v.IsValid() {
		t.Fatalf("AdminWorkspaceService has no auditLog field — test needs updating")
	}
	// Field is unexported; bypass the access guard to read its pointer value.
	v = reflect.NewAt(v.Type(), unsafe.Pointer(v.UnsafeAddr())).Elem()
	if v.IsNil() {
		return nil
	}
	return v.Interface().(*service.AuditLogService)
}

// TestF062_AdminWorkspaceServiceHasAuditLog proves newAdminWorkspaceService
// (the seam main.go now uses for AdminDeps.WorkspaceSvc) wires the audit log,
// while the bare service.NewAdminWorkspaceService constructor — the pre-fix
// wiring at main.go's RegisterAdminRoutes call — leaves it nil. Without the
// audit log, SuspendWorkspace/UnsuspendWorkspace/DeleteWorkspace call a
// nil-guarded recordAudit that no-ops, so the privileged actions never reach
// audit_logs (undermining SOC2/DPDPA incident reconstruction).
func TestF062_AdminWorkspaceServiceHasAuditLog(t *testing.T) {
	// repo + audit constructors only stash the (nil) pool pointer; no DB I/O.
	repo := repository.NewAdminWorkspaceRepo(nil)
	auditLog := service.NewAuditLogService(repository.NewAuditLogRepo(nil))

	// Pre-fix control: the bare constructor leaves auditLog nil → recordAudit
	// no-ops → no audit trail. This is exactly the F-062 finding.
	unwired := service.NewAdminWorkspaceService(repo)
	if adminWorkspaceAuditLog(t, unwired) != nil {
		t.Fatal("control: bare NewAdminWorkspaceService should leave auditLog nil")
	}

	// Post-fix: the helper main.go calls must always wire the audit log.
	wired := newAdminWorkspaceService(repo, auditLog)
	got := adminWorkspaceAuditLog(t, wired)
	if got == nil {
		t.Fatal("newAdminWorkspaceService left auditLog nil — workspace suspend/delete would write no audit_logs row (F-062 regression)")
	}
	if got != auditLog {
		t.Fatal("newAdminWorkspaceService wired a different audit log than the one provided")
	}
}

// ── helpers ─────────────────────────────────────────────────────────────────

func collectRoutes(t *testing.T, r chi.Router) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	err := chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		out[method+" "+route] = true
		return nil
	})
	if err != nil {
		t.Fatalf("chi.Walk: %v", err)
	}
	return out
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
