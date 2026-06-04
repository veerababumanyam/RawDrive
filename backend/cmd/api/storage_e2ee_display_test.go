package main

import (
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// TestEncryptedDisplayDerivativeAssetID proves the byte path can recover the
// owning asset UUID from the ONE derivative key shape that lives under
// derivatives/ rather than thumbnails/: the client-side-E2EE full-size display
// image, stored by encryptedDerivativeStorageKey as
// derivatives/<assetID>/display_webp.webp.enc.
//
// Public/share viewers fetch this with a ?at= asset-access token (header-less
// <img> byte load), so — exactly like thumbnail keys — the key must resolve to
// its asset so authorizeThumbnailByte can enforce gallery membership. Before the
// fix these keys matched no shape, skipped the ?at= path, and 401'd.
func TestEncryptedDisplayDerivativeAssetID(t *testing.T) {
	id := uuid.New()

	good := "derivatives/" + id.String() + "/display_webp.webp.enc"
	got, ok := encryptedDisplayDerivativeAssetID(good)
	if !ok || got != id {
		t.Fatalf("encryptedDisplayDerivativeAssetID(%q) = %v,%v want %v,true", good, got, ok, id)
	}

	// Must NOT match anything other than the encrypted display derivative — no
	// originals, no plaintext derivatives, no thumbnail keys, no other variants,
	// no traversal/smuggling. Authorization for those flows through the existing
	// thumbnail path or the workspace-JWT branch, never this one.
	for _, bad := range []string{
		"thumbnails/" + id.String() + "/display_webp.webp",        // thumbnail shape (existing path)
		"derivatives/" + id.String() + "/display_webp.webp",       // plaintext, not .enc
		"derivatives/" + id.String() + "/thumb_md_webp.webp.enc",  // E2EE thumbs live under thumbnails/, not here
		"derivatives/" + id.String() + "/original.jpg.enc",        // never serve originals on this path
		"derivatives/" + id.String() + "/display_webp.webp.enc.x", // trailing smuggle
		"derivatives/not-a-uuid/display_webp.webp.enc",            // bad id
		"originals/" + id.String() + "/display_webp.webp.enc",     // wrong prefix
		"derivativesX/" + id.String() + "/display_webp.webp.enc",  // prefix smuggle
		"derivatives/" + id.String() + "/../secret.webp.enc",      // traversal
	} {
		if _, ok := encryptedDisplayDerivativeAssetID(bad); ok {
			t.Fatalf("encryptedDisplayDerivativeAssetID(%q) should NOT match", bad)
		}
	}
}

// TestStorageProxy_AuthorizesEncryptedDisplayDerivative is the source guard for
// the 401 regression: the /storage/* proxy must route the encrypted display
// derivative key through the gallery-membership authorizer (authorizeThumbnailByte
// via encryptedDisplayDerivativeAssetID) so a public/share viewer holding a valid
// ?at= asset token receives the ciphertext instead of a 401.
func TestStorageProxy_AuthorizesEncryptedDisplayDerivative(t *testing.T) {
	b, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	handler := functionBodyFromSource(t, string(b), `r.Get("/storage/*"`)
	if !strings.Contains(handler, "encryptedDisplayDerivativeAssetID") {
		t.Fatal("storage proxy must authorize encrypted display derivatives via encryptedDisplayDerivativeAssetID (401 regression)")
	}
	if !strings.Contains(handler, "authorizeThumbnailByte") {
		t.Fatal("storage proxy must gate the derivative byte through authorizeThumbnailByte")
	}
}

// TestStorageProxy_EncryptedDisplayStaysPrivate is the PERF-HDR / E2EE
// invariant guard for the new path: routing the .enc display derivative through
// the gallery-authorized branch must NOT make ciphertext public-cacheable. The
// public, immutable directive must be gated to exclude .enc keys.
func TestStorageProxy_EncryptedDisplayStaysPrivate(t *testing.T) {
	b, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	handler := functionBodyFromSource(t, string(b), `r.Get("/storage/*"`)
	if !strings.Contains(handler, `HasSuffix(key, ".enc")`) {
		t.Fatal("storage proxy cache policy must exclude .enc ciphertext from the public, immutable directive (E2EE invariant)")
	}
}
