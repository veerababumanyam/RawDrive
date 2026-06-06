package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func retiredStudioRequest(path, subdomain string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("subdomain", subdomain)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func TestGetStudioLanding_ReturnsGone(t *testing.T) {
	h := &PublicGalleryHandler{}
	rec := httptest.NewRecorder()

	h.GetStudioLanding(rec, retiredStudioRequest("/api/v1/public/studios/legacy-studio-bf998927", "legacy-studio-bf998927"))

	if rec.Code != http.StatusGone {
		t.Fatalf("GetStudioLanding status = %d, want %d", rec.Code, http.StatusGone)
	}
}

func TestGetStudioLogo_ReturnsGone(t *testing.T) {
	h := &PublicGalleryHandler{}
	rec := httptest.NewRecorder()

	h.GetStudioLogo(rec, retiredStudioRequest("/api/v1/public/studios/legacy-studio-bf998927/logo", "legacy-studio-bf998927"))

	if rec.Code != http.StatusGone {
		t.Fatalf("GetStudioLogo status = %d, want %d", rec.Code, http.StatusGone)
	}
}
