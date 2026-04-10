package service

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/stretchr/testify/assert"
)

// ──────────────────────── Helpers ────────────────────────

func makeJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 150, B: 100, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buf.Bytes()
}

func makePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 50, G: 100, B: 200, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

// ──────────────────────── Metadata-only validation ────────────────────────

func TestValidateCoverMetadata_AcceptsJPEG(t *testing.T) {
	assert.NoError(t, ValidateCoverMetadata("image/jpeg", 1_000_000))
}

func TestValidateCoverMetadata_AcceptsPNG(t *testing.T) {
	assert.NoError(t, ValidateCoverMetadata("image/png", 2_000_000))
}

func TestValidateCoverMetadata_AcceptsWebP(t *testing.T) {
	assert.NoError(t, ValidateCoverMetadata("image/webp", 500_000))
}

func TestValidateCoverMetadata_TrimsContentTypeParams(t *testing.T) {
	assert.NoError(t, ValidateCoverMetadata("image/jpeg; charset=binary", 1_000_000))
}

func TestValidateCoverMetadata_RejectsUnsupportedContentType(t *testing.T) {
	err := ValidateCoverMetadata("image/gif", 1_000_000)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported cover content type")

	err = ValidateCoverMetadata("application/pdf", 1_000_000)
	assert.Error(t, err)
}

func TestValidateCoverMetadata_RejectsEmptyFile(t *testing.T) {
	err := ValidateCoverMetadata("image/jpeg", 0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "empty")
}

func TestValidateCoverMetadata_RejectsFilesOver15MB(t *testing.T) {
	err := ValidateCoverMetadata("image/jpeg", CoverMaxBytes+1)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "maximum allowed")
}

func TestValidateCoverMetadata_AcceptsExactly15MB(t *testing.T) {
	assert.NoError(t, ValidateCoverMetadata("image/jpeg", CoverMaxBytes))
}

// ──────────────────────── Full pipeline validation ────────────────────────

func TestValidateCoverImage_AcceptsValidJPEG(t *testing.T) {
	data := makeJPEG(t, 1920, 1080)
	result, err := ValidateCoverImage("image/jpeg", int64(len(data)), bytes.NewReader(data))
	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, 1920, result.Width)
	assert.Equal(t, 1080, result.Height)
}

func TestValidateCoverImage_AcceptsValidPNG(t *testing.T) {
	data := makePNG(t, 1200, 800)
	result, err := ValidateCoverImage("image/png", int64(len(data)), bytes.NewReader(data))
	assert.NoError(t, err)
	assert.Equal(t, 1200, result.Width)
}

func TestValidateCoverImage_RejectsTooSmall(t *testing.T) {
	data := makeJPEG(t, 640, 480)
	_, err := ValidateCoverImage("image/jpeg", int64(len(data)), bytes.NewReader(data))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "minimum size")
}

func TestValidateCoverImage_RejectsMismatchedContentType(t *testing.T) {
	jpegData := makeJPEG(t, 1920, 1080)
	_, err := ValidateCoverImage("image/png", int64(len(jpegData)), bytes.NewReader(jpegData))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "does not match decoded image format")
}

func TestValidateCoverImage_RejectsCorruptImage(t *testing.T) {
	garbage := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00}
	_, err := ValidateCoverImage("image/jpeg", int64(len(garbage)), bytes.NewReader(garbage))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode failed")
}

func TestValidateCoverImage_PropagatesMetadataErrors(t *testing.T) {
	data := makeJPEG(t, 1920, 1080)
	_, err := ValidateCoverImage("image/gif", int64(len(data)), bytes.NewReader(data))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported cover content type")
}
