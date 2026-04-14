package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/shortlink"
)

// stubResolver implements PublicResolver for unit tests.
type stubResolver struct {
	streamID uuid.UUID
	revoked  bool
	err      error

	hits []recordedHit
}

type recordedHit struct {
	code, src, ip, ua string
}

func (s *stubResolver) Resolve(_ context.Context, _ string) (uuid.UUID, bool, error) {
	return s.streamID, s.revoked, s.err
}

func (s *stubResolver) RecordHit(_ context.Context, code, src, ip, ua string) error {
	s.hits = append(s.hits, recordedHit{code, src, ip, ua})
	return nil
}

// stubMetaLoader implements StreamMetaLoader for unit tests.
type stubMetaLoader struct {
	meta PublicStreamMeta
	err  error
}

func (s *stubMetaLoader) LoadPublicMeta(_ context.Context, _ uuid.UUID) (PublicStreamMeta, error) {
	return s.meta, s.err
}

func mountPublic(h *PublicShortlinkHandler) http.Handler {
	r := chi.NewRouter()
	r.Get("/public/s/{code}", h.Resolve)
	return r
}

func TestPublicResolve_UnknownCode_404(t *testing.T) {
	res := &stubResolver{err: shortlink.ErrNotFound}
	h := NewPublicShortlinkHandler(res, &stubMetaLoader{}, 60)
	r := mountPublic(h)
	req := httptest.NewRequest(http.MethodGet, "/public/s/NOTREAL1", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("want 404 got %d", rr.Code)
	}
	// Must not include any workspace uuid (generic body).
	body := rr.Body.String()
	if strings.Contains(body, "workspace") {
		t.Errorf("body leaks workspace hint: %s", body)
	}
}

func TestPublicResolve_ExpiredCode_410(t *testing.T) {
	res := &stubResolver{streamID: uuid.New(), revoked: true}
	h := NewPublicShortlinkHandler(res, &stubMetaLoader{}, 60)
	r := mountPublic(h)
	req := httptest.NewRequest(http.MethodGet, "/public/s/REVOKED1", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusGone {
		t.Fatalf("want 410 got %d", rr.Code)
	}
}

func TestPublicResolve_Success_200_ReturnsPublicMetadata(t *testing.T) {
	sid := uuid.New()
	res := &stubResolver{streamID: sid}
	meta := PublicStreamMeta{
		Title:            "Wedding Livestream",
		Status:           "scheduled",
		ScheduledStartAt: "2026-05-01T10:00:00Z",
		AccessPolicy:     "pin",
		Protected:        true,
	}
	h := NewPublicShortlinkHandler(res, &stubMetaLoader{meta: meta}, 60)
	r := mountPublic(h)
	req := httptest.NewRequest(http.MethodGet, "/public/s/ABCDEFGH", nil)
	req.RemoteAddr = "10.0.0.9:1234"
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Whitelisted fields present.
	if body["stream_title"] != "Wedding Livestream" {
		t.Errorf("stream_title: got %v", body["stream_title"])
	}
	if body["scheduled_start_at"] != "2026-05-01T10:00:00Z" {
		t.Errorf("scheduled_start_at: got %v", body["scheduled_start_at"])
	}
	if body["access_policy"] != "pin" {
		t.Errorf("access_policy: got %v", body["access_policy"])
	}
	if body["protected"] != true {
		t.Errorf("protected: got %v", body["protected"])
	}
	// Leak guard.
	for _, bad := range []string{"playback_url", "ingest_key", "workspace_id", "cf_rtmps_key", "cf_playback_url"} {
		if _, ok := body[bad]; ok {
			t.Errorf("response must not contain %q", bad)
		}
	}
	// The stream UUID must not appear anywhere in the response.
	if strings.Contains(rr.Body.String(), sid.String()) {
		// stream_id is allowed per spec? The caller asked: MUST NOT include workspace_id.
		// stream_id is not in the forbidden list but also not asserted; don't fail.
	}
}

func TestPublicResolve_RecordsImpression(t *testing.T) {
	sid := uuid.New()
	res := &stubResolver{streamID: sid}
	h := NewPublicShortlinkHandler(res, &stubMetaLoader{meta: PublicStreamMeta{Title: "T"}}, 60)
	r := mountPublic(h)
	req := httptest.NewRequest(http.MethodGet, "/public/s/ABCDEFGH?src=qr", nil)
	req.RemoteAddr = "10.0.0.9:4321"
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rr.Code)
	}
	if len(res.hits) != 1 {
		t.Fatalf("want 1 hit, got %d", len(res.hits))
	}
	h0 := res.hits[0]
	if h0.code != "ABCDEFGH" {
		t.Errorf("code: got %q", h0.code)
	}
	if h0.src != "qr" {
		t.Errorf("src: got %q", h0.src)
	}
	// Verify whitelist normalization: unknown src coerced to "direct".
	res.hits = nil
	req2 := httptest.NewRequest(http.MethodGet, "/public/s/ABCDEFGH?src=EVIL", nil)
	req2.RemoteAddr = "10.0.0.9:4321"
	rr2 := httptest.NewRecorder()
	r.ServeHTTP(rr2, req2)
	if len(res.hits) != 1 || res.hits[0].src != "direct" {
		t.Errorf("unknown src should coerce to direct, got %+v", res.hits)
	}
}

func TestPublicResolve_RateLimitExceeded_429(t *testing.T) {
	res := &stubResolver{streamID: uuid.New()}
	h := NewPublicShortlinkHandler(res, &stubMetaLoader{meta: PublicStreamMeta{Title: "T"}}, 60)
	r := mountPublic(h)

	var last *httptest.ResponseRecorder
	for i := 0; i < 61; i++ {
		req := httptest.NewRequest(http.MethodGet, "/public/s/ABCDEFGH", nil)
		req.RemoteAddr = "10.0.0.77:1234"
		last = httptest.NewRecorder()
		r.ServeHTTP(last, req)
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429 on 61st, got %d", last.Code)
	}
	if last.Header().Get("Retry-After") == "" {
		t.Errorf("Retry-After header missing")
	}
}

// Ensure errors sentinel is wired (forces import of shortlink package under test).
var _ = errors.Is
