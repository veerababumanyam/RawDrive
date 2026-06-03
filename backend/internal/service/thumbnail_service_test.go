package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os/exec"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/image/tiff"

	"github.com/rawdrive/backend/internal/storage"
)

func TestWebPStorageKey_SplitsThumbnailsVsDerivatives(t *testing.T) {
	// Locks the public/auth split for WebP variants. Editing this test
	// without editing the storage proxy's `isPublicThumbnail` guard or
	// the edge handler's fallback (or vice-versa) is a wiring bug.
	const assetID = "asset-test"
	cases := []struct {
		name    string
		size    ThumbnailSize
		wantKey string
	}{
		{"thumb_sm_webp is public", WebPThumbSizes[0], "thumbnails/asset-test/thumb_sm_webp.webp"},
		{"thumb_md_webp is public", WebPThumbSizes[1], "thumbnails/asset-test/thumb_md_webp.webp"},
		{"thumb_lg_webp is public", WebPThumbSizes[2], "thumbnails/asset-test/thumb_lg_webp.webp"},
		{"display_webp stays auth", WebPDisplaySize, "derivatives/asset-test/display_webp.webp"},
		{"watermark_preview stays auth", WatermarkPreviewSize, "derivatives/asset-test/watermark_preview.webp"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.wantKey, webpStorageKey(assetID, tc.size))
		})
	}
}

func TestGenerateAllDerivativesRequiresCwebp(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	img := image.NewRGBA(image.Rect(0, 0, 20, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 20; x++ {
			img.Set(x, y, color.RGBA{R: 180, G: 90, B: 40, A: 255})
		}
	}

	var src bytes.Buffer
	require.NoError(t, png.Encode(&src, img))

	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir()))
	_, err := svc.GenerateAllDerivatives(context.Background(), "asset-webp-required", bytes.NewReader(src.Bytes()))
	require.Error(t, err)
	require.Contains(t, strings.ToLower(err.Error()), "cwebp")
}

// TestGenerateAll_EmitsJPGAndWebPVariants regression-locks the WebP hardcode
// law from CLAUDE.md / AGENTS.md ("Every uploaded image MUST produce WebP
// derivatives: thumb_sm_webp, thumb_md_webp, thumb_lg_webp, display_webp").
// Prior to the fix, GenerateAll only iterated StandardSizes — yielding 3 JPG
// keys and zero WebPs. The dashboard fell through to JPG fallback (bloated
// payload) and the law was silently violated. This test asserts all 7
// expected variants land in the result URL map with correctly-prefixed bare
// storage keys.
//
// Skipped when `cwebp` is not on PATH (CI containers without libwebp tools).
// The smoke-test machine and the docker dev image both have cwebp installed.
func TestGenerateAll_EmitsJPGAndWebPVariants(t *testing.T) {
	if _, err := exec.LookPath("cwebp"); err != nil {
		t.Skip("cwebp not on PATH — required for WebP variant generation")
	}

	// Tiny synthetic image is sufficient; cwebp handles arbitrary input sizes.
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	for y := 0; y < 32; y++ {
		for x := 0; x < 32; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 8), G: uint8(y * 8), B: 120, A: 255})
		}
	}
	var src bytes.Buffer
	require.NoError(t, png.Encode(&src, img))

	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir()))
	result, err := svc.GenerateAll(context.Background(), "asset-test", bytes.NewReader(src.Bytes()))
	require.NoError(t, err)

	// WebP-only thumb shape. The worker no longer emits the JPG thumb
	// trio — see the doc-comment block on GenerateAll for the rationale.
	// Legacy assets uploaded before this change keep their JPG keys in
	// thumbnail_urls; frontend consumers preserve a JPG fallback so
	// those rows still render.
	wantVariants := []string{
		"thumb_sm_webp", "thumb_md_webp", "thumb_lg_webp", // WebP thumbs (public, thumbnails/* prefix)
		"display_webp", // WebP full-res (auth, derivatives/* prefix)
	}
	for _, v := range wantVariants {
		assert.Contains(t, result.URLs, v, "GenerateAll must emit variant %q", v)
	}
	assert.Equal(t, len(wantVariants), len(result.URLs),
		"GenerateAll must emit exactly the 4 WebP variants — no JPG thumbs after the worker WebP-only switch")
	for _, jpg := range []string{"thumb_sm", "thumb_md", "thumb_lg"} {
		assert.NotContains(t, result.URLs, jpg,
			"GenerateAll must NOT emit legacy JPG thumb %q — dropped to skip dual-generation cost", jpg)
	}

	// Storage keys must be bare — no scheme, no host. The /storage/* proxy
	// at the API layer owns the public URL. Persisting absolute URLs
	// (production host hardcoded as fallback) was the broken-<img> bug.
	for variant, key := range result.URLs {
		assert.NotContains(t, key, "://", "variant %q key must be bare, got %q", variant, key)
		assert.NotContains(t, key, "api.rawdrive.in", "variant %q must not bake in production host, got %q", variant, key)
	}

	// Storage-prefix split — the gallery-grid hot path depends on this.
	//
	//   * WebP thumb sizes → thumbnails/<id>/<name>.webp   (public access)
	//   * display_webp     → derivatives/<id>/<name>.webp  (auth required)
	//
	// WebP thumbnail variants live under the public `thumbnails/` prefix so
	// the storage proxy bypasses per-tile JWT validation — same public-
	// access policy that JPG thumbs used to enjoy. The full-res
	// `display_webp` stays under `derivatives/` (authenticated lightbox).
	for _, v := range []string{"thumb_sm_webp", "thumb_md_webp", "thumb_lg_webp"} {
		assert.True(t, strings.HasPrefix(result.URLs[v], "thumbnails/"),
			"WebP thumbnail %q must live under thumbnails/ to avoid the per-tile auth tax, got %q", v, result.URLs[v])
		assert.True(t, strings.HasSuffix(result.URLs[v], ".webp"),
			"WebP variant %q must be .webp, got %q", v, result.URLs[v])
	}
	assert.True(t, strings.HasPrefix(result.URLs["display_webp"], "derivatives/"),
		"display_webp (full-res) must live under derivatives/ for /storage/* auth, got %q", result.URLs["display_webp"])
	assert.True(t, strings.HasSuffix(result.URLs["display_webp"], ".webp"))

	// Dimensions and blurhash still produced.
	assert.Equal(t, 32, result.Width)
	assert.Equal(t, 32, result.Height)
	assert.NotEmpty(t, result.Blurhash)
}

func TestGenerateAll_DecodesTIFFSources(t *testing.T) {
	if _, err := exec.LookPath("cwebp"); err != nil {
		t.Skip("cwebp not on PATH — required for WebP variant generation")
	}

	img := image.NewRGBA(image.Rect(0, 0, 40, 30))
	for y := 0; y < 30; y++ {
		for x := 0; x < 40; x++ {
			img.Set(x, y, color.RGBA{R: 20, G: uint8(x * 3), B: uint8(y * 4), A: 255})
		}
	}
	var src bytes.Buffer
	require.NoError(t, tiff.Encode(&src, img, nil))

	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir()))
	result, err := svc.GenerateAll(context.Background(), "asset-tiff", bytes.NewReader(src.Bytes()))
	require.NoError(t, err)
	assert.Equal(t, 40, result.Width)
	assert.Equal(t, 30, result.Height)
	assert.Contains(t, result.URLs, "display_webp")
}
