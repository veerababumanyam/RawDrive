package main

import (
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// TestThumbnailAssetID_ExtractsAssetUUID proves the byte path can recover the
// owning asset UUID from a public thumbnail key shape (S4-G1) and rejects
// non-thumbnail keys (originals, downloads, BYOS prefixes).
func TestThumbnailAssetID_ExtractsAssetUUID(t *testing.T) {
	id := uuid.New()
	for _, variant := range []string{"thumb_sm", "thumb_md", "thumb_lg", "display"} {
		key := "thumbnails/" + id.String() + "/" + variant + ".webp"
		got, ok := thumbnailAssetID(key)
		if !ok || got != id {
			t.Fatalf("thumbnailAssetID(%q) = %v,%v want %v,true", key, got, ok, id)
		}
	}

	for _, bad := range []string{
		"originals/" + id.String() + "/photo.jpg",
		"thumbnails/" + id.String() + "/display.jpg", // not webp
		"thumbnails/not-a-uuid/display.webp",
		"downloads/" + id.String() + ".zip",
		"byos/tenant/thumbnails/" + id.String() + "/display.webp",
	} {
		if _, ok := thumbnailAssetID(bad); ok {
			t.Fatalf("thumbnailAssetID(%q) should not match a thumbnail key", bad)
		}
	}
}

// TestThumbnailServableAnonymously_OnlyOpenGalleries is the S4-G1 core gate:
// only published + non-expired + non-password + public/unlisted galleries may
// serve thumbnails to anonymous clients. Everything else must fail closed
// (forcing the session-token path).
func TestThumbnailServableAnonymously_OnlyOpenGalleries(t *testing.T) {
	cases := []struct {
		name string
		in   thumbnailGalleryProtection
		want bool
	}{
		{"public open", thumbnailGalleryProtection{published: true, accessMode: "public"}, true},
		{"unlisted open", thumbnailGalleryProtection{published: true, accessMode: "unlisted"}, true},
		{"legacy empty mode", thumbnailGalleryProtection{published: true, accessMode: ""}, true},
		{"unpublished", thumbnailGalleryProtection{published: false, accessMode: "public"}, false},
		{"expired", thumbnailGalleryProtection{published: true, expired: true, accessMode: "public"}, false},
		{"password protected", thumbnailGalleryProtection{published: true, passwordProtected: true, accessMode: "public"}, false},
		{"private", thumbnailGalleryProtection{published: true, accessMode: "private"}, false},
		{"invite-only", thumbnailGalleryProtection{published: true, accessMode: "invite-only"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := thumbnailServableAnonymously(tc.in); got != tc.want {
				t.Fatalf("thumbnailServableAnonymously(%+v) = %v want %v", tc.in, got, tc.want)
			}
		})
	}
}

// TestStorageProxy_NoLongerBypassesAuthOnKeyShapeAlone is the S4-G1 source
// guard: the storage proxy must call authorizeThumbnailByte (which resolves
// asset→gallery + protection) rather than treating the key shape as sufficient
// to bypass auth. It asserts the old unconditional isPublicThumbnailKey bypass
// is gone from the handler body.
func TestStorageProxy_NoLongerBypassesAuthOnKeyShapeAlone(t *testing.T) {
	b, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	source := string(b)
	handler := functionBodyFromSource(t, source, `r.Get("/storage/*"`)

	if !strings.Contains(handler, "authorizeThumbnailByte") {
		t.Fatal("storage proxy must gate thumbnail bytes via authorizeThumbnailByte (S4-G1)")
	}
	if strings.Contains(handler, "isPublicThumbnail := isPublicThumbnailKey(key)") {
		t.Fatal("storage proxy must NOT bypass auth on key shape alone (S4-G1 regression)")
	}
}

// TestAuthorizeThumbnailByte_QueriesGalleryMembership guards that the byte gate
// resolves asset→gallery membership and reads the protection fields it needs.
func TestAuthorizeThumbnailByte_QueriesGalleryMembership(t *testing.T) {
	b, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	source := string(b)
	body := functionBodyFromSource(t, source, "func loadThumbnailGalleryProtection")
	for _, fragment := range []string{
		"gallery_assets",
		"galleries",
		"is_published",
		"password_hash",
		"access_mode",
		"expires_at",
	} {
		if !strings.Contains(body, fragment) {
			t.Fatalf("loadThumbnailGalleryProtection must query %q", fragment)
		}
	}
}
