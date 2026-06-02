package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// S5-G1 (audit HIGH): RejectImpersonationWrites tests.
//
// Impersonation tokens are minted by an admin to act AS a tenant. The
// middleware must make those sessions read-only: any mutating HTTP method
// under an impersonation==true claim is rejected with 403, while safe
// (read) methods pass through, and normal (non-impersonation) tokens are
// never affected.

func newImpReq(t *testing.T, method string, impersonation interface{}, withClaims bool) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, "/api/v1/galleries", nil)
	if withClaims {
		claims := map[string]interface{}{"sub": "user-123"}
		if impersonation != nil {
			claims["impersonation"] = impersonation
		}
		req = req.WithContext(WithJWTClaims(req.Context(), claims))
	}
	return req
}

// Impersonation + mutating method => 403 with the documented JSON error.
func TestRejectImpersonationWrites_BlocksMutatingMethods(t *testing.T) {
	for _, method := range []string{
		http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete,
	} {
		t.Run(method, func(t *testing.T) {
			handler := RejectImpersonationWrites(newOKHandler())
			req := newImpReq(t, method, true, true)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusForbidden, rec.Code)
			var body map[string]interface{}
			_ = json.Unmarshal(rec.Body.Bytes(), &body)
			assert.Equal(t, "impersonated sessions are read-only", body["error"])
		})
	}
}

// Impersonation + safe method => passes through to the next handler.
func TestRejectImpersonationWrites_AllowsSafeMethods(t *testing.T) {
	for _, method := range []string{
		http.MethodGet, http.MethodHead, http.MethodOptions,
	} {
		t.Run(method, func(t *testing.T) {
			handler := RejectImpersonationWrites(newOKHandler())
			req := newImpReq(t, method, true, true)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, "ok", rec.Body.String())
		})
	}
}

// Normal (non-impersonation) token + mutating method => passes through.
// impersonation claim present but false.
func TestRejectImpersonationWrites_AllowsNormalTokenWrites(t *testing.T) {
	handler := RejectImpersonationWrites(newOKHandler())
	req := newImpReq(t, http.MethodPost, false, true)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "ok", rec.Body.String())
}

// Legacy token without any impersonation claim + mutating method => passes
// through (absent claim type-asserts to false, the read-write default).
func TestRejectImpersonationWrites_AllowsTokenWithoutClaim(t *testing.T) {
	handler := RejectImpersonationWrites(newOKHandler())
	req := newImpReq(t, http.MethodPost, nil, true)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "ok", rec.Body.String())
}

// No claims in context at all (e.g. unauthenticated path) + mutating
// method => passes through; this middleware only gates impersonation, it
// is not an auth gate (JWTAuth/RequireAuth handle that earlier in the chain).
func TestRejectImpersonationWrites_PassesWhenNoClaims(t *testing.T) {
	handler := RejectImpersonationWrites(newOKHandler())
	req := newImpReq(t, http.MethodPost, nil, false)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "ok", rec.Body.String())
}
