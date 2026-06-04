package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

// ─────────────────────────────────────────────────────────────────────────────
// PUB-CACHE: short-TTL shared cache for the PUBLIC studio-profile landing read.
//
// GetStudioLanding ran a workspace-by-business_unique_code query + tier lookup +
// published-gallery list on EVERY anonymous view. These tests prove the
// shared-cache seam: a warmed entry is served WITHOUT touching the DB pool (the
// handler short-circuits before any h.pool use), only PUBLIC non-PII fields are
// cached, and a cold/absent cache falls through to the DB path.
// ─────────────────────────────────────────────────────────────────────────────

// fakeStudioLandingCache is the in-memory Valkey stand-in for the studio-landing
// cache. Get/Set over JSON bytes mirror the production publicStudioLandingCache
// seam; counters let a test assert hit/miss behaviour.
type fakeStudioLandingCache struct {
	mu   sync.Mutex
	data map[string][]byte
	gets int
	sets int
}

func newFakeStudioLandingCache() *fakeStudioLandingCache {
	return &fakeStudioLandingCache{data: make(map[string][]byte)}
}

func (f *fakeStudioLandingCache) Get(_ context.Context, key string) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.gets++
	b, ok := f.data[key]
	return b, ok, nil
}

func (f *fakeStudioLandingCache) Set(_ context.Context, key string, val []byte, _ time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sets++
	cp := make([]byte, len(val))
	copy(cp, val)
	f.data[key] = cp
}

// requestWithSubdomain builds a GET with the {subdomain} chi URL param set, the
// way the public studios route invokes GetStudioLanding.
func requestWithSubdomain(subdomain string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/studios/"+subdomain, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("subdomain", subdomain)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

// A warmed studio-landing cache entry must be served WITHOUT hitting the DB. We
// prove this by wiring a NIL pool: if the handler reached the DB path it would
// return 503; a 200 served from cache proves the read collapsed to the cache.
func TestGetStudioLanding_CacheHit_ServesWithoutDB(t *testing.T) {
	code := "abcd1234"
	cache := newFakeStudioLandingCache()

	// Pre-warm the cache with an assembled landing (PUBLIC fields only).
	warmed := publicStudioLandingResponse{
		Studio: publicStudioProfileResponse{
			ID:                 "ws-1",
			Name:               "Lumière Studio",
			DisplayName:        "Lumière Studio",
			BusinessUniqueCode: code,
			BusinessSubdomain:  "lumiere-" + code,
		},
		Galleries: []publicStudioGalleryResponse{},
		Counts:    map[string]int{"published_galleries": 0},
	}
	raw, err := json.Marshal(warmed)
	if err != nil {
		t.Fatalf("marshal warmed landing: %v", err)
	}
	cache.Set(context.Background(), publicStudioLandingCacheKey(code), raw, publicStudioLandingCacheTTL)

	// pool is intentionally nil — a DB-path fall-through would 503.
	h := &PublicGalleryHandler{}
	h = h.WithStudioLandingCache(cache)

	rec := httptest.NewRecorder()
	h.GetStudioLanding(rec, requestWithSubdomain("lumiere-"+code))

	if rec.Code != http.StatusOK {
		t.Fatalf("cache hit must serve 200 without the DB; got %d (body=%s)", rec.Code, rec.Body.String())
	}

	var got publicStudioLandingResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode cached landing: %v", err)
	}
	if got.Studio.Name != "Lumière Studio" || got.Studio.BusinessUniqueCode != code {
		t.Fatalf("cache hit served the wrong studio: %+v", got.Studio)
	}
	if cache.gets < 1 {
		t.Fatal("cache hit must consult the shared cache")
	}
}

// Two repeated views of one studio must consult the shared cache (collapse). The
// first warms it (here pre-warmed), the second hits it — proven by gets growing.
func TestGetStudioLanding_RepeatedViews_ConsultSharedCache(t *testing.T) {
	code := "ef567890"
	cache := newFakeStudioLandingCache()
	warmed := publicStudioLandingResponse{
		Studio:    publicStudioProfileResponse{BusinessUniqueCode: code, Name: "Studio B"},
		Galleries: []publicStudioGalleryResponse{},
		Counts:    map[string]int{"published_galleries": 0},
	}
	raw, _ := json.Marshal(warmed)
	cache.Set(context.Background(), publicStudioLandingCacheKey(code), raw, publicStudioLandingCacheTTL)

	h := (&PublicGalleryHandler{}).WithStudioLandingCache(cache)

	for i := 0; i < 5; i++ {
		rec := httptest.NewRecorder()
		h.GetStudioLanding(rec, requestWithSubdomain("studiob-"+code))
		if rec.Code != http.StatusOK {
			t.Fatalf("view %d: expected 200 from cache, got %d", i, rec.Code)
		}
	}
	if cache.gets < 5 {
		t.Fatalf("each repeated view must consult the shared cache; gets=%d", cache.gets)
	}
}

// The cache round-trip helper must preserve only the PUBLIC response shape and
// never carry PII the response struct doesn't model. publicStudioProfileResponse
// has no bank/PAN/UPI fields by construction; this guards that the cached blob is
// exactly the public response (a regression guard against caching a richer
// PII-bearing struct in the future).
func TestStudioLandingCache_RoundTrip_PublicShapeOnly(t *testing.T) {
	code := "9abc0def"
	cache := newFakeStudioLandingCache()
	h := (&PublicGalleryHandler{}).WithStudioLandingCache(cache)

	resp := publicStudioLandingResponse{
		Studio:    publicStudioProfileResponse{BusinessUniqueCode: code, Name: "Studio C", Email: "hello@studioc.example"},
		Galleries: []publicStudioGalleryResponse{},
		Counts:    map[string]int{"published_galleries": 0},
	}
	h.studioLandingToCache(context.Background(), code, "", resp)

	got, ok := h.studioLandingFromCache(context.Background(), code, "")
	if !ok {
		t.Fatal("round-trip: stored landing must be retrievable")
	}
	if got.Studio.BusinessUniqueCode != code || got.Studio.Name != "Studio C" {
		t.Fatalf("round-trip mangled the public fields: %+v", got.Studio)
	}

	// The serialized blob must be exactly the public JSON — assert no field named
	// like a PII column leaked into it (the struct can't carry them, but this
	// keeps the guard explicit for future edits).
	raw := cache.data[publicStudioLandingCacheKey(code)]
	for _, forbidden := range []string{"bank_account", "pan", "ifsc", "upi", "tax_id", "gstin"} {
		if containsField(raw, forbidden) {
			t.Fatalf("cached studio landing must not contain PII field %q", forbidden)
		}
	}
}

func containsField(jsonBytes []byte, field string) bool {
	var m map[string]json.RawMessage
	if json.Unmarshal(jsonBytes, &m) != nil {
		return false
	}
	// Walk the top-level "studio" object's keys.
	studio, ok := m["studio"]
	if !ok {
		return false
	}
	var sm map[string]json.RawMessage
	if json.Unmarshal(studio, &sm) != nil {
		return false
	}
	_, present := sm[field]
	return present
}

// With no cache wired and a nil pool, GetStudioLanding must fall through to the
// DB path (which 503s on a nil pool) — proving the cache is purely additive and
// its absence preserves the original behaviour.
func TestGetStudioLanding_NoCache_FallsThroughToDBPath(t *testing.T) {
	h := &PublicGalleryHandler{} // no cache, no pool
	rec := httptest.NewRecorder()
	h.GetStudioLanding(rec, requestWithSubdomain("studio-aabbccdd"))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("no cache + nil pool must fall through to the DB path (503); got %d", rec.Code)
	}
}
