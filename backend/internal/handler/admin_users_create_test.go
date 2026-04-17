package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// M39 E5-S1 GREEN: POST /api/v1/admin/users contract assertions. Real DB
// integration is exercised by existing admin integration suites; these
// tests cover the handler's validation + error-mapping contract directly.

func mustDecodeHandlerWithActor() *AdminUsersHandler {
	return NewAdminUsersHandler(service.NewAdminUserService(nil, nil, nil))
}

func requestWithActorJSON(method, path string, body []byte) *http.Request {
	r := httptest.NewRequest(method, path, bytes.NewReader(body))
	// Insert a non-zero actor UUID via JWT middleware helper so the
	// handler's unauthorized guard passes.
	r = r.WithContext(middleware.WithJWTClaims(r.Context(), map[string]interface{}{
		"sub": "11111111-1111-1111-1111-111111111111",
	}))
	return r
}

func TestPOSTAdminUsers_UnauthorizedNoJWT_Returns401(t *testing.T) {
	h := mustDecodeHandlerWithActor()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/users",
		bytes.NewReader([]byte(`{"email":"x@example.com","role":"user","send_invite":true}`)))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without JWT, got %d (body=%q)", rec.Code, rec.Body.String())
	}
}

func TestPOSTAdminUsers_InvalidBody_Returns400(t *testing.T) {
	h := mustDecodeHandlerWithActor()
	req := requestWithActorJSON(http.MethodPost, "/api/v1/admin/users", []byte(`not-json`))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid body, got %d", rec.Code)
	}
}

func TestPOSTAdminUsers_SuperadminRole_Returns400(t *testing.T) {
	h := mustDecodeHandlerWithActor()
	req := requestWithActorJSON(http.MethodPost, "/api/v1/admin/users",
		[]byte(`{"email":"x@example.com","role":"superadmin","send_invite":true}`))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for superadmin role, got %d", rec.Code)
	}
}

func TestPOSTAdminUsers_InvalidEmail_Returns400(t *testing.T) {
	h := mustDecodeHandlerWithActor()
	req := requestWithActorJSON(http.MethodPost, "/api/v1/admin/users",
		[]byte(`{"email":"not-an-email","role":"user","send_invite":true}`))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid email, got %d", rec.Code)
	}
}

func TestPOSTAdminUsers_MissingPathReturns400(t *testing.T) {
	h := mustDecodeHandlerWithActor()
	req := requestWithActorJSON(http.MethodPost, "/api/v1/admin/users",
		[]byte(`{"email":"u@example.com","role":"user"}`))
	rec := httptest.NewRecorder()
	h.Create(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when neither password nor invite supplied, got %d", rec.Code)
	}
}
