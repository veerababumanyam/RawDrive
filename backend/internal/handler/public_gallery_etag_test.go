package handler

import (
	"fmt"
	"net/http"
	"net/http/httptest"
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
