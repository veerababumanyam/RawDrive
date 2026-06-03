package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/service"
)

// reqWithConsentSlug builds a GET request carrying {slug} in the chi route
// context plus the given raw query string.
func reqWithConsentSlug(slug, query string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/v1/public/galleries/"+slug+"/consent/status?"+query, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("slug", slug)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
}

// TestGetStatusBySlug_FailsClosed is the V11 regression guard: the gallery-scoped
// consent-status endpoint must return 400 whenever it cannot bind the lookup to a
// concrete (gallery_id, email). There is no global fallback — this is what
// prevents the cross-gallery PII / membership oracle that the removed global
// GET /public/consent/status?email= exposed. The service is never reached on
// these paths, so a zero-value ConsentService (nil repo) is sufficient.
func TestGetStatusBySlug_FailsClosed(t *testing.T) {
	h := NewConsentHandler(&service.ConsentService{})

	cases := []struct {
		name  string
		slug  string
		query string
	}{
		{"invalid gallery slug", "not-a-uuid", "email=a@b.com"},
		{"nil gallery uuid", uuid.Nil.String(), "email=a@b.com"},
		{"missing email", uuid.New().String(), ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.GetStatusBySlug(w, reqWithConsentSlug(c.slug, c.query))
			if w.Code != http.StatusBadRequest {
				t.Errorf("want 400 (fail closed), got %d body=%s", w.Code, w.Body.String())
			}
		})
	}
}
