package handler

import (
	"testing"

	"github.com/google/uuid"
)

// TestDerivativeFallbackStorageKey pins the edge-delivery fallback key to the
// keys the upload paths actually write. Regression for the E2EE display bug:
// before the fix the fallback always emitted "derivatives/<id>/display_webp.webp"
// for the display variant, but the encrypted-derivative handler stores encrypted
// display objects at "...display_webp.webp.enc" — so the fallback 404'd for every
// encrypted asset whose asset_derivatives row was missing, even though the object
// existed at the .enc key.
func TestDerivativeFallbackStorageKey(t *testing.T) {
	id := uuid.MustParse("d3a2df5e-7506-4f81-bbd8-d95a224cf2a1")

	cases := []struct {
		name      string
		variant   string
		encrypted bool
		want      string
	}{
		{"encrypted display -> .enc", "display_webp", true, "derivatives/" + id.String() + "/display_webp.webp.enc"},
		{"plain display -> .webp", "display_webp", false, "derivatives/" + id.String() + "/display_webp.webp"},
		{"default variant ('') encrypted -> .enc", "display_webp", true, "derivatives/" + id.String() + "/display_webp.webp.enc"},
		{"thumb unaffected by encryption (sm)", "thumb_sm_webp", true, "thumbnails/" + id.String() + "/thumb_sm_webp.webp"},
		{"thumb unaffected by encryption (md)", "thumb_md_webp", false, "thumbnails/" + id.String() + "/thumb_md_webp.webp"},
		{"thumb unaffected by encryption (lg)", "thumb_lg_webp", true, "thumbnails/" + id.String() + "/thumb_lg_webp.webp"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := derivativeFallbackStorageKey(id, tc.variant, tc.encrypted)
			if got != tc.want {
				t.Fatalf("derivativeFallbackStorageKey(%q, encrypted=%v) = %q, want %q",
					tc.variant, tc.encrypted, got, tc.want)
			}
		})
	}
}

// TestDerivativeFallbackMatchesEncryptedWriter proves the fallback agrees with
// the writer (encryptedDerivativeStorageKey) for encrypted assets across every
// WebP variant — so a fallback can never point at a key the writer didn't use.
func TestDerivativeFallbackMatchesEncryptedWriter(t *testing.T) {
	id := uuid.New()
	for _, variant := range []string{"display_webp", "thumb_sm_webp", "thumb_md_webp", "thumb_lg_webp"} {
		fallback := derivativeFallbackStorageKey(id, variant, true)
		writer := encryptedDerivativeStorageKey(id, variant)
		if fallback != writer {
			t.Errorf("variant %q: fallback %q != writer %q (encrypted assets must agree)", variant, fallback, writer)
		}
	}
}
