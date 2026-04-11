package middleware

// ISSUE-006 (brownfield P1, security-tooling): the RequireMFA
// middleware must only be mounted on routes that have JWTAuth in
// front of it. Previously the invariant was enforced only by a
// comment; these tests pin the startup-time walker that validates
// the mount order across every registered route.

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// okHandler is a no-op handler used as the leaf in the walker tests.
// The tests never invoke the handler — they only inspect the
// middleware chain chi.Walk exposes per route.
func okHandler(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

// TestValidateMFAMountOrder_CleanOrderPasses is the happy path:
// JWTAuth is mounted first, RequireMFA second, on a real handler.
// The validator must return nil.
func TestValidateMFAMountOrder_CleanOrderPasses(t *testing.T) {
	r := chi.NewRouter()
	// JWTAuth takes a JWTService; nil is safe here because the
	// closure is captured by chi but never invoked — Walk only
	// inspects the chain, it does not call the middleware.
	r.Use(JWTAuth(nil))
	r.Use(RequireMFA)
	r.Get("/protected", okHandler)

	err := ValidateMFAMountOrder(r)
	assert.NoError(t, err, "JWTAuth → RequireMFA is the correct mount order and must pass")
}

// TestValidateMFAMountOrder_MissingJWTAuthFails is the primary
// ISSUE-006 attack case: somebody mounted RequireMFA on a route but
// forgot to put JWTAuth in front. The walker must catch it.
func TestValidateMFAMountOrder_MissingJWTAuthFails(t *testing.T) {
	r := chi.NewRouter()
	r.Use(RequireMFA)
	r.Get("/protected", okHandler)

	err := ValidateMFAMountOrder(r)
	require.Error(t, err, "RequireMFA without JWTAuth must be rejected")
	assert.Contains(t, err.Error(), "/protected")
	assert.Contains(t, err.Error(), "RequireMFA")
	assert.Contains(t, err.Error(), "without JWTAuth")
}

// TestValidateMFAMountOrder_ReversedOrderFails catches the subtler
// bug: both middlewares are mounted, but RequireMFA appears before
// JWTAuth in the chain — meaning RequireMFA runs against an empty
// claim context and JWTAuth never gets a chance to populate it.
// The existing RequireMFA default-deny would surface this as 401
// "unauthenticated" but the error message would be misleading.
func TestValidateMFAMountOrder_ReversedOrderFails(t *testing.T) {
	r := chi.NewRouter()
	r.Use(RequireMFA)
	r.Use(JWTAuth(nil))
	r.Get("/protected", okHandler)

	err := ValidateMFAMountOrder(r)
	require.Error(t, err, "RequireMFA mounted before JWTAuth must be rejected")
	assert.Contains(t, err.Error(), "/protected")
	assert.Contains(t, err.Error(), "before JWTAuth")
}

// TestValidateMFAMountOrder_NoMFARoutesPasses is the no-op case: the
// router has JWTAuth but no RequireMFA anywhere. Nothing to check,
// so the validator returns nil. This matches the current state of
// the main backend (as of ISSUE-006 analysis: zero routes mount
// RequireMFA yet) — the fix must not FATAL on a healthy startup.
func TestValidateMFAMountOrder_NoMFARoutesPasses(t *testing.T) {
	r := chi.NewRouter()
	r.Use(JWTAuth(nil))
	r.Get("/public", okHandler)

	err := ValidateMFAMountOrder(r)
	assert.NoError(t, err, "a router with no RequireMFA mounts has nothing to validate")
}

// TestValidateMFAMountOrder_SubrouterCatchesViolation walks a nested
// subrouter. Chi's Walk exposes the full per-route chain including
// inherited middlewares, so mounting RequireMFA via .Route() or
// .Group() without JWTAuth in the parent chain should still be
// caught.
func TestValidateMFAMountOrder_SubrouterCatchesViolation(t *testing.T) {
	r := chi.NewRouter()
	r.Route("/admin", func(sr chi.Router) {
		// No JWTAuth anywhere in parent or child chain.
		sr.Use(RequireMFA)
		sr.Get("/settings", okHandler)
	})

	err := ValidateMFAMountOrder(r)
	require.Error(t, err, "subrouter mounting RequireMFA without JWTAuth must be caught")
	assert.Contains(t, err.Error(), "/admin/settings")
}

// TestValidateMFAMountOrder_SubrouterInheritsParentJWTAuth pins the
// common real-world shape: JWTAuth is mounted at the top of a
// protected API group, then a nested subrouter adds RequireMFA for
// MFA-sensitive endpoints. The parent's JWTAuth must be detected as
// "in the chain" for the child route.
func TestValidateMFAMountOrder_SubrouterInheritsParentJWTAuth(t *testing.T) {
	r := chi.NewRouter()
	r.Route("/api/v1", func(api chi.Router) {
		api.Use(JWTAuth(nil))
		api.Route("/mfa-sensitive", func(sens chi.Router) {
			sens.Use(RequireMFA)
			sens.Get("/secrets", okHandler)
		})
	})

	err := ValidateMFAMountOrder(r)
	assert.NoError(t, err, "JWTAuth in parent subrouter must count as in-chain for nested RequireMFA routes")
}
