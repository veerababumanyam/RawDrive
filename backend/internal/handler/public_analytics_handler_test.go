package handler

// public_analytics_handler_test.go — unit coverage for the anonymous
// event tracking endpoint. These tests use the handler directly (not a
// mounted route) so they can stub the slug resolver without spinning
// up the full M2 dep graph.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// stubResolver implements GallerySlugResolver for tests.
type stubResolver struct {
	id  uuid.UUID
	err error
}

func (s *stubResolver) ResolveSlugToID(_ context.Context, _ string) (uuid.UUID, error) {
	return s.id, s.err
}

// buildAnalyticsRequest wraps the common setup so tests read cleanly.
func buildAnalyticsRequest(t *testing.T, slug string, body map[string]interface{}) *http.Request {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/public/galleries/"+slug+"/events", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	// chi URL param injection so chi.URLParam works without a mounted router.
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("slug", slug)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func TestTrackPublicEvent_AllowsImpression(t *testing.T) {
	h := NewPublicAnalyticsHandler(nil) // nil service is fine — handler stays 202
	resolver := &stubResolver{id: uuid.New()}

	req := buildAnalyticsRequest(t, "my-slug", map[string]interface{}{
		"event_type": "banner_impression",
		"metadata":   map[string]interface{}{"banner_id": "abc"},
	})
	rr := httptest.NewRecorder()
	h.TrackPublicEvent(resolver).ServeHTTP(rr, req)

	if rr.Code != http.StatusAccepted {
		t.Errorf("impression should return 202 Accepted, got %d (body=%s)", rr.Code, rr.Body.String())
	}
}

func TestTrackPublicEvent_RejectsUnknownEventType(t *testing.T) {
	h := NewPublicAnalyticsHandler(nil)
	resolver := &stubResolver{id: uuid.New()}

	req := buildAnalyticsRequest(t, "my-slug", map[string]interface{}{
		"event_type": "purchase_completed", // not on the allow-list
	})
	rr := httptest.NewRecorder()
	h.TrackPublicEvent(resolver).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("unknown event should return 400, got %d", rr.Code)
	}
}

func TestTrackPublicEvent_Returns404OnSlugFailure(t *testing.T) {
	h := NewPublicAnalyticsHandler(nil)
	resolver := &stubResolver{err: errors.New("not found")}

	req := buildAnalyticsRequest(t, "missing-slug", map[string]interface{}{
		"event_type": "banner_click",
	})
	rr := httptest.NewRecorder()
	h.TrackPublicEvent(resolver).ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("unknown slug should return 404, got %d", rr.Code)
	}
}

func TestTrackPublicEvent_RejectsMalformedJSON(t *testing.T) {
	h := NewPublicAnalyticsHandler(nil)
	resolver := &stubResolver{id: uuid.New()}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/public/galleries/my-slug/events", bytes.NewReader([]byte("not-json")))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("slug", "my-slug")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rr := httptest.NewRecorder()
	h.TrackPublicEvent(resolver).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("malformed JSON should return 400, got %d", rr.Code)
	}
}

func TestDeviceTypeFromUA(t *testing.T) {
	cases := []struct {
		ua       string
		expected string
	}{
		{"Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)", "mobile"},
		{"Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)", "tablet"},
		{"Mozilla/5.0 (Linux; Android 10)", "mobile"},
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "desktop"},
		{"", "desktop"},
	}
	for _, tc := range cases {
		if got := deviceTypeFromUA(tc.ua); got != tc.expected {
			t.Errorf("deviceTypeFromUA(%q) = %q, want %q", tc.ua, got, tc.expected)
		}
	}
}
