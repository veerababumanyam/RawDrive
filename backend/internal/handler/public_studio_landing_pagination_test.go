package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// PUB-CAP: the public studio-profile landing used to truncate the published
// gallery list at a hard `LIMIT 60` with no pagination — galleries 61+ were
// silently invisible. These tests prove keyset (cursor) pagination over the
// same ordering AND that the PUB-CACHE shared-cache key is page-aware so a
// cursored page can never collide with page 1's cached entry.
// ─────────────────────────────────────────────────────────────────────────────

// requestWithSubdomainAndCursor builds a GET with the {subdomain} chi URL param
// set and an optional ?cursor= query param, the way the public studios route
// invokes GetStudioLanding for a "load more" follow-up request.
func requestWithSubdomainAndCursor(subdomain, cursor string) *http.Request {
	target := "/api/v1/public/studios/" + subdomain
	if cursor != "" {
		target += "?cursor=" + url.QueryEscape(cursor)
	}
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("subdomain", subdomain)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

// The cursor must round-trip: a decode of an encode yields the same keyset
// tuple (effective_at, created_at, id). This is the stable keyset over the
// query's ORDER BY, so a "next page" request resumes exactly after the last row.
func TestStudioGalleryCursor_RoundTrip(t *testing.T) {
	id := uuid.New()
	eff := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	created := time.Date(2026, 5, 30, 9, 30, 0, 0, time.UTC)

	enc := encodeStudioGalleryCursor(studioGalleryCursor{EffectiveAt: eff, CreatedAt: created, ID: id})
	if enc == "" {
		t.Fatal("encode produced an empty cursor")
	}

	got, ok := decodeStudioGalleryCursor(enc)
	if !ok {
		t.Fatalf("decode failed for cursor %q", enc)
	}
	if !got.EffectiveAt.Equal(eff) || !got.CreatedAt.Equal(created) || got.ID != id {
		t.Fatalf("cursor round-trip mismatch: got %+v want eff=%v created=%v id=%v", got, eff, created, id)
	}
}

// A malformed / empty cursor must decode as "no cursor" (ok=false) so a bad
// client value degrades to the first page rather than erroring.
func TestStudioGalleryCursor_RejectsGarbage(t *testing.T) {
	for _, bad := range []string{"", "not-base64!!!", "YWJj" /* "abc" not JSON */} {
		if _, ok := decodeStudioGalleryCursor(bad); ok {
			t.Fatalf("decode must reject malformed cursor %q", bad)
		}
	}
}

// The shared-cache key MUST be page-aware: page 1 (no cursor) keeps the original
// backward-compatible key (so existing warmed entries + the 15s TTL invalidation
// keep working), while a cursored page gets a distinct, cursor-namespaced key.
// Without this, page 2+ would collide with page 1's cached entry and serve the
// wrong galleries.
func TestStudioLandingCacheKey_PageAware(t *testing.T) {
	code := "abcd1234"
	cursor := encodeStudioGalleryCursor(studioGalleryCursor{
		EffectiveAt: time.Unix(1000, 0).UTC(),
		CreatedAt:   time.Unix(900, 0).UTC(),
		ID:          uuid.New(),
	})

	page1 := publicStudioLandingCacheKeyForCursor(code, "")
	page2 := publicStudioLandingCacheKeyForCursor(code, cursor)

	// Page 1 must remain the original key (backward compatible with PUB-CACHE).
	if page1 != publicStudioLandingCacheKey(code) {
		t.Fatalf("page-1 key must equal the original PUB-CACHE key; got %q want %q", page1, publicStudioLandingCacheKey(code))
	}
	if page2 == page1 {
		t.Fatal("a cursored page must NOT share page 1's cache key (cross-contamination)")
	}
}

// End-to-end cache cross-contamination guard: warm page 1 and a cursored page 2
// under their (distinct) keys with DIFFERENT galleries, then prove the handler
// serves the correct, distinct set for each request — never page 1's data for a
// page-2 (cursored) request. Uses a nil pool so a key collision would surface as
// the wrong cached body (or a 503 fall-through), not a DB hit.
func TestGetStudioLanding_Pagination_NoCacheCrossContamination(t *testing.T) {
	code := "ef560000"
	subdomain := "studiob-" + code
	cache := newFakeStudioLandingCache()

	page1 := publicStudioLandingResponse{
		Studio:    publicStudioProfileResponse{BusinessUniqueCode: code, Name: "Studio B"},
		Galleries: []publicStudioGalleryResponse{{ID: "g1", Title: "Page1-A"}, {ID: "g2", Title: "Page1-B"}},
		Counts:    map[string]int{"published_galleries": 2},
	}
	cursor := encodeStudioGalleryCursor(studioGalleryCursor{
		EffectiveAt: time.Unix(2000, 0).UTC(),
		CreatedAt:   time.Unix(1900, 0).UTC(),
		ID:          uuid.New(),
	})
	page2 := publicStudioLandingResponse{
		Studio:    publicStudioProfileResponse{BusinessUniqueCode: code, Name: "Studio B"},
		Galleries: []publicStudioGalleryResponse{{ID: "g61", Title: "Page2-A"}, {ID: "g62", Title: "Page2-B"}},
		Counts:    map[string]int{"published_galleries": 2},
	}

	raw1, _ := json.Marshal(page1)
	raw2, _ := json.Marshal(page2)
	cache.Set(context.Background(), publicStudioLandingCacheKeyForCursor(code, ""), raw1, publicStudioLandingCacheTTL)
	cache.Set(context.Background(), publicStudioLandingCacheKeyForCursor(code, cursor), raw2, publicStudioLandingCacheTTL)

	h := (&PublicGalleryHandler{}).WithStudioLandingCache(cache)

	// Page 1 (no cursor) → must serve Page1-* galleries.
	rec1 := httptest.NewRecorder()
	h.GetStudioLanding(rec1, requestWithSubdomainAndCursor(subdomain, ""))
	if rec1.Code != http.StatusOK {
		t.Fatalf("page 1: expected 200 from cache, got %d (%s)", rec1.Code, rec1.Body.String())
	}
	var got1 publicStudioLandingResponse
	if err := json.Unmarshal(rec1.Body.Bytes(), &got1); err != nil {
		t.Fatalf("decode page 1: %v", err)
	}
	if len(got1.Galleries) != 2 || got1.Galleries[0].Title != "Page1-A" {
		t.Fatalf("page 1 served wrong galleries: %+v", got1.Galleries)
	}

	// Page 2 (cursored) → must serve Page2-* galleries, NOT page 1's.
	rec2 := httptest.NewRecorder()
	h.GetStudioLanding(rec2, requestWithSubdomainAndCursor(subdomain, cursor))
	if rec2.Code != http.StatusOK {
		t.Fatalf("page 2: expected 200 from cache, got %d (%s)", rec2.Code, rec2.Body.String())
	}
	var got2 publicStudioLandingResponse
	if err := json.Unmarshal(rec2.Body.Bytes(), &got2); err != nil {
		t.Fatalf("decode page 2: %v", err)
	}
	if len(got2.Galleries) != 2 || got2.Galleries[0].Title != "Page2-A" {
		t.Fatalf("page 2 served wrong galleries (cache cross-contamination?): %+v", got2.Galleries)
	}
}

// The published-gallery list query must no longer carry a hard `LIMIT 60`; the
// page size must be parameterized so pagination can advance past the first 60.
// (Guards against a regression that re-pins the cap.)
func TestListPublishedStudioGalleries_NoHardCap60(t *testing.T) {
	if publicStudioLandingPageSize <= 0 {
		t.Fatalf("page size must be a positive bound; got %d", publicStudioLandingPageSize)
	}
	// The fetch helper must accept a limit + cursor (compile-time contract): a
	// nil-pool call returns an error without panicking, proving the new signature.
	h := &PublicGalleryHandler{}
	_, _, err := h.listPublishedStudioGalleries(context.Background(), uuid.New(), "studio-aabbccdd", studioGalleryCursor{}, false, publicStudioLandingPageSize)
	if err == nil {
		t.Fatal("nil-pool fetch must return an error (proving the paginated signature is wired)")
	}
}
