package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// F-007 (M17 wave 4): RequireMFA middleware tests.

func newOKHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}

func TestRequireMFA_RejectsMissingClaims(t *testing.T) {
	handler := RequireMFA(newOKHandler())
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	var body map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	assert.Equal(t, "unauthenticated", body["error"])
}

func TestRequireMFA_RejectsUnverified(t *testing.T) {
	handler := RequireMFA(newOKHandler())
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	ctx := WithJWTClaims(req.Context(), map[string]interface{}{
		"sub":          "user-123",
		"mfa_verified": false,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusForbidden, rec.Code)
	var body map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	assert.Equal(t, "mfa_required", body["error"])
	assert.Equal(t, true, body["mfa_required"])
}

func TestRequireMFA_RejectsMissingClaimValue(t *testing.T) {
	// mfa_verified claim absent entirely (legacy token or wave-1 token
	// before the claim was added). Must reject as "not verified".
	handler := RequireMFA(newOKHandler())
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	ctx := WithJWTClaims(req.Context(), map[string]interface{}{
		"sub": "user-123",
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestRequireMFA_AllowsVerified(t *testing.T) {
	handler := RequireMFA(newOKHandler())
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	ctx := WithJWTClaims(req.Context(), map[string]interface{}{
		"sub":          "user-123",
		"mfa_verified": true,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "ok", rec.Body.String())
}
