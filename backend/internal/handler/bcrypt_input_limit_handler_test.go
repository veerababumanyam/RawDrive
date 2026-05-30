package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func requestWithURLParam(method, target, body, key, value string) *http.Request {
	req := httptest.NewRequest(method, target, bytes.NewBufferString(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, value)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func TestGalleryAccessSetPassword_OverlongPasswordReturns400BeforeService(t *testing.T) {
	h := NewGalleryAccessHandler(nil)
	req := requestWithURLParam(
		http.MethodPost,
		"/api/v1/galleries/id/password",
		`{"password":"`+strings.Repeat("x", 73)+`"}`,
		"id",
		uuid.NewString(),
	)
	rec := httptest.NewRecorder()

	h.SetPassword(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for overlong gallery password, got %d body=%q", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "at most 72") {
		t.Fatalf("expected length validation error, got %q", rec.Body.String())
	}
}

func TestShareLinkCreate_OverlongPINReturns400BeforeService(t *testing.T) {
	h := NewShareLinkHandler(nil)
	req := requestWithURLParam(
		http.MethodPost,
		"/api/v1/galleries/id/share",
		`{"access_mode":"pin","pin":"`+strings.Repeat("1", 73)+`"}`,
		"id",
		uuid.NewString(),
	)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for overlong share PIN, got %d body=%q", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "at most 72") {
		t.Fatalf("expected length validation error, got %q", rec.Body.String())
	}
}
