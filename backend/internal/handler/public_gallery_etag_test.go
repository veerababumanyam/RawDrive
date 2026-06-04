package handler

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// fakePublicGalleryResolverForETag returns a fixed gallery so GetBySlug can
// be exercised without a database. It reuses the fakePublicGalleryResolver
// type already defined in public_gallery_media_routes_test.go (same package).

func publishedGalleryWithTimestamp() *repository.Gallery {
	gid := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	ts := time.Unix(1700000000, 0).UTC()
	return &repository.Gallery{
		ID:          gid,
		Title:       "ETag Test Gallery",
		Slug:        "etag-test",
		IsPublished: true,
		AccessMode:  "public",
		UpdatedAt:   ts,
	}
}

// expectedETag mirrors the formula in GetBySlug so the test is self-documenting.
func expectedETag(g *repository.Gallery) string {
	return fmt.Sprintf(`"g-%s-%d"`, g.ID, g.UpdatedAt.Unix())
}

// buildETagTestHandler constructs a minimal PublicGalleryHandler wired with
// the given gallery. No DB, no asset service, no access service — only the
// gallery resolver is needed to exercise GetBySlug's ETag path.
func buildETagTestHandler(gallery *repository.Gallery) *PublicGalleryHandler {
	return NewPublicGalleryHandler(
		&fakePublicGalleryResolver{gallery: gallery},
		nil,
		nil,
	)
}

// TestGetBySlug_ETag_Present verifies that GetBySlug for an accessible
// published gallery sets a non-empty ETag response header.
func TestGetBySlug_ETag_Present(t *testing.T) {
	gallery := publishedGalleryWithTimestamp()
	h := buildETagTestHandler(gallery)

	rec := httptest.NewRecorder()
	req := requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test")
	h.GetBySlug(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d body=%s", rec.Code, rec.Body.String())
	}

	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Fatal("GetBySlug must set a non-empty ETag response header")
	}
}

// TestGetBySlug_ETag_Stable verifies that two requests for the same unchanged
// gallery return IDENTICAL ETag values, making the header safe for cheap
// revalidation in the offline-gallery reconnect path.
func TestGetBySlug_ETag_Stable(t *testing.T) {
	gallery := publishedGalleryWithTimestamp()
	h := buildETagTestHandler(gallery)

	makeRequest := func() string {
		rec := httptest.NewRecorder()
		req := requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test")
		h.GetBySlug(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}
		return rec.Header().Get("ETag")
	}

	first := makeRequest()
	second := makeRequest()

	if first == "" {
		t.Fatal("first request: ETag must be non-empty")
	}
	if first != second {
		t.Fatalf("ETag must be stable across requests for an unchanged gallery:\n  first:  %s\n  second: %s", first, second)
	}
}

// TestGetBySlug_ETag_Format verifies that the ETag value matches the expected
// formula so the offline-gallery client can depend on its shape.
func TestGetBySlug_ETag_Format(t *testing.T) {
	gallery := publishedGalleryWithTimestamp()
	h := buildETagTestHandler(gallery)

	rec := httptest.NewRecorder()
	req := requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test")
	h.GetBySlug(rec, req)

	got := rec.Header().Get("ETag")
	want := expectedETag(gallery)
	if got != want {
		t.Fatalf("ETag format mismatch:\n  got:  %s\n  want: %s", got, want)
	}
}

// TestGetBySlug_ETag_ChangesWithUpdatedAt verifies that a gallery with a
// different UpdatedAt timestamp produces a different ETag, so the offline
// viewer correctly detects that the gallery has changed.
func TestGetBySlug_ETag_ChangesWithUpdatedAt(t *testing.T) {
	g1 := publishedGalleryWithTimestamp()
	g2 := publishedGalleryWithTimestamp()
	g2.UpdatedAt = g2.UpdatedAt.Add(time.Hour) // same gallery, one hour later

	h1 := buildETagTestHandler(g1)
	h2 := buildETagTestHandler(g2)

	etag1 := func() string {
		rec := httptest.NewRecorder()
		h1.GetBySlug(rec, requestWithGallerySlug("/g/etag-test", "etag-test"))
		return rec.Header().Get("ETag")
	}()

	etag2 := func() string {
		rec := httptest.NewRecorder()
		h2.GetBySlug(rec, requestWithGallerySlug("/g/etag-test", "etag-test"))
		return rec.Header().Get("ETag")
	}()

	if etag1 == etag2 {
		t.Fatalf("ETags must differ when UpdatedAt changes: both are %s", etag1)
	}
}

// TestGetBySlug_IfNoneMatch_Returns304 is the PERF-HDR regression guard:
// a repeat GET that echoes the gallery's current ETag in If-None-Match must
// short-circuit to 304 Not Modified with an EMPTY body, skipping the expensive
// re-query + re-serialize of the full gallery payload. Before the fix the
// handler ignored If-None-Match entirely and always returned 200 + full body.
func TestGetBySlug_IfNoneMatch_Returns304(t *testing.T) {
	gallery := publishedGalleryWithTimestamp()
	h := buildETagTestHandler(gallery)

	// First request establishes the ETag the client would cache.
	first := httptest.NewRecorder()
	h.GetBySlug(first, requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test"))
	if first.Code != http.StatusOK {
		t.Fatalf("priming request: expected 200, got %d", first.Code)
	}
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("priming request must set an ETag")
	}

	// Repeat request with If-None-Match: <etag> must yield 304 + empty body.
	req := requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test")
	req.Header.Set("If-None-Match", etag)
	rec := httptest.NewRecorder()
	h.GetBySlug(rec, req)

	if rec.Code != http.StatusNotModified {
		t.Fatalf("matching If-None-Match must return 304 Not Modified, got %d body=%s", rec.Code, rec.Body.String())
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("304 response must have an empty body, got %d bytes: %s", rec.Body.Len(), rec.Body.String())
	}
	// The ETag must still be echoed on the 304 so the cache keeps revalidating.
	if rec.Header().Get("ETag") != etag {
		t.Fatalf("304 must echo the ETag: got %q want %q", rec.Header().Get("ETag"), etag)
	}
}

// TestGetBySlug_IfNoneMatch_StaleEtagReturnsFullBody verifies that a stale /
// non-matching If-None-Match value does NOT short-circuit — the client gets a
// fresh 200 with the full payload and the new ETag.
func TestGetBySlug_IfNoneMatch_StaleEtagReturnsFullBody(t *testing.T) {
	gallery := publishedGalleryWithTimestamp()
	h := buildETagTestHandler(gallery)

	req := requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test")
	req.Header.Set("If-None-Match", `"g-stale-0"`)
	rec := httptest.NewRecorder()
	h.GetBySlug(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("non-matching If-None-Match must return 200, got %d", rec.Code)
	}
	if rec.Body.Len() == 0 {
		t.Fatal("non-matching If-None-Match must return the full body")
	}
	if rec.Header().Get("ETag") != expectedETag(gallery) {
		t.Fatalf("200 must carry the current ETag: got %q", rec.Header().Get("ETag"))
	}
}

// TestGetBySlug_IfNoneMatch_Wildcard verifies RFC 7232 §3.2 semantics: an
// If-None-Match of "*" matches any current representation, so it must 304.
func TestGetBySlug_IfNoneMatch_Wildcard(t *testing.T) {
	gallery := publishedGalleryWithTimestamp()
	h := buildETagTestHandler(gallery)

	req := requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test")
	req.Header.Set("If-None-Match", "*")
	rec := httptest.NewRecorder()
	h.GetBySlug(rec, req)

	if rec.Code != http.StatusNotModified {
		t.Fatalf(`If-None-Match: * must return 304, got %d`, rec.Code)
	}
}

// TestGetBySlug_PublicMetadata_HasSharedCacheHint verifies PERF-HDR part 3:
// public gallery metadata carries a short s-maxage so a future shared/edge
// cache can serve revalidatable copies. It must stay private-scoped enough not
// to be over-cached: assert the s-maxage directive is present and bounded.
func TestGetBySlug_PublicMetadata_HasSharedCacheHint(t *testing.T) {
	gallery := publishedGalleryWithTimestamp()
	h := buildETagTestHandler(gallery)

	rec := httptest.NewRecorder()
	h.GetBySlug(rec, requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test"))

	cc := rec.Header().Get("Cache-Control")
	if cc == "" {
		t.Fatal("public gallery metadata must set Cache-Control with a shared-cache hint")
	}
	if !strings.Contains(cc, "s-maxage=") {
		t.Fatalf("public gallery metadata Cache-Control must include s-maxage for shared/edge caching, got %q", cc)
	}
	if !strings.Contains(cc, "must-revalidate") {
		t.Fatalf("public gallery metadata Cache-Control must require revalidation (must-revalidate) so changes are picked up, got %q", cc)
	}
}

// TestGetBySlug_SessionBound_NoSharedCache is the confidentiality guard for the
// PERF-HDR cache policy: a session-bound (password/share) gallery mints a
// per-viewer asset_access_token in its body, so its Cache-Control must NOT carry
// a shared-cache directive (no s-maxage / no "public") — otherwise a shared/edge
// cache could hand one viewer's token to another. It must be private + no-store.
func TestGetBySlug_SessionBound_NoSharedCache(t *testing.T) {
	h, accessSvc := newGatedHandler(t)
	gallery := publishedGalleryWithTimestamp()
	gallery.PasswordHash = strptr("$2a$10$abcdefghijklmnopqrstuv") // password-protected
	h.gallerySvc = &fakePublicGalleryResolver{gallery: gallery}

	// Mint a valid session so GetBySlug treats this as session-bound (hasSession).
	token, err := accessSvc.IssueShareSession(gallery.ID, "")
	if err != nil {
		t.Fatalf("issue session: %v", err)
	}

	req := requestWithGallerySlug("/api/v1/public/galleries/etag-test", "etag-test")
	req.Header.Set("X-Gallery-Session", token)
	rec := httptest.NewRecorder()
	h.GetBySlug(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for session-bound gallery, got %d body=%s", rec.Code, rec.Body.String())
	}
	cc := rec.Header().Get("Cache-Control")
	if strings.Contains(cc, "s-maxage") || strings.Contains(cc, "public") {
		t.Fatalf("session-bound gallery must NOT be shared-cacheable, got Cache-Control %q", cc)
	}
	if !strings.Contains(cc, "no-store") {
		t.Fatalf("session-bound gallery must be no-store, got Cache-Control %q", cc)
	}
}

// TestGetBySlug_ETag_ExcludesAssetAccessToken is the critical regression guard:
// the ETag must NOT include the per-request asset_access_token (which rotates
// every call). We verify this indirectly by confirming the ETag is stable even
// when the handler is wired with an access service that mints a fresh token on
// every IssueAssetAccessToken call.
func TestGetBySlug_ETag_ExcludesAssetAccessToken(t *testing.T) {
	gallery := publishedGalleryWithTimestamp()

	// Wire a real access service with a signing key so IssueAssetAccessToken
	// is callable. The token minted by each request will differ, but the ETag
	// must stay the same.
	// We reuse newGatedHandler which already sets up a GalleryAccessService.
	h, _ := newGatedHandler(t)
	// Replace the nil gallery resolver with a fake that returns our gallery.
	h.gallerySvc = &fakePublicGalleryResolver{gallery: gallery}

	makeRequest := func() string {
		rec := httptest.NewRecorder()
		req := requestWithGallerySlug("/g/etag-test", "etag-test")
		h.GetBySlug(rec, req)
		return rec.Header().Get("ETag")
	}

	first := makeRequest()
	second := makeRequest()

	if first == "" {
		t.Fatal("ETag must be present even when access service is wired")
	}
	if first != second {
		t.Fatalf("ETag must be stable despite rotating asset_access_token:\n  first:  %s\n  second: %s", first, second)
	}
}
