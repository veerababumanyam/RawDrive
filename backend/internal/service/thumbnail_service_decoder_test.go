package service

// thumbnail_service_decoder_test.go — covers the HEIC/RAW decode-wiring added
// to the WebP derivative pipeline (task H4). These tests deliberately avoid any
// external CLI (cwebp/heif-convert/exiftool): the cwebp-dependent assertions
// skip when the binary is absent, and the decoder-dispatch assertions use a
// fake ImageDecoder so they run hermetically in CI.

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"os/exec"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/image/tiff"

	"github.com/rawdrive/backend/internal/storage"
)

// fakeDecoder is a test ImageDecoder that records the format token it was asked
// to decode and returns a scripted image or error. It lets us prove (a) that the
// out-of-process formats route through the decoder, (b) that web/legacy formats
// do NOT, and (c) that a terminal *DecodeError survives to the caller.
type fakeDecoder struct {
	called      bool
	gotFormat   string
	returnImage image.Image
	returnErr   error
}

func (f *fakeDecoder) Decode(_ context.Context, format string, r io.Reader) (image.Image, error) {
	f.called = true
	f.gotFormat = format
	// Drain the reader so callers that buffer-and-replay behave realistically.
	_, _ = io.Copy(io.Discard, r)
	if f.returnErr != nil {
		return nil, f.returnErr
	}
	return f.returnImage, nil
}

func solidPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 90, G: 140, B: 200, A: 255})
		}
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func solidImage(w, h int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 40, B: 60, A: 255})
		}
	}
	return img
}

// TestDecodeSource_OutOfProcessFormatRoutesThroughDecoder proves a heic/raw
// token is dispatched to the wired decoder (the libheif/exiftool path), not the
// in-process imageops decoder.
func TestDecodeSource_OutOfProcessFormatRoutesThroughDecoder(t *testing.T) {
	dec := &fakeDecoder{returnImage: solidImage(8, 8)}
	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir())).WithDecoder(dec)

	img, err := svc.decodeSource(context.Background(), "heic", []byte("not-really-heic-bytes"))
	require.NoError(t, err)
	require.NotNil(t, img)
	assert.True(t, dec.called, "heic token must route through the wired decoder")
	assert.Equal(t, "heic", dec.gotFormat)
}

// TestDecodeSource_WebFormatBypassesDecoder proves that jpeg/png/gif/webp/tiff
// tokens take the legacy imageops.Decode path even when a decoder is wired —
// the load-bearing constraint that non-HEIC/RAW formats stay byte-identical.
func TestDecodeSource_WebFormatBypassesDecoder(t *testing.T) {
	dec := &fakeDecoder{returnErr: errors.New("decoder must not be called for web formats")}
	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir())).WithDecoder(dec)

	raw := solidPNG(t, 12, 10)
	img, err := svc.decodeSource(context.Background(), "png", raw)
	require.NoError(t, err)
	require.NotNil(t, img)
	assert.False(t, dec.called, "png must NOT route through the decoder")
	assert.Equal(t, 12, img.Bounds().Dx())
	assert.Equal(t, 10, img.Bounds().Dy())
}

// TestDecodeSource_NilDecoderUsesLegacyPath proves the default (no decoder)
// service decodes exactly as before — a tiff input still decodes in-process.
func TestDecodeSource_NilDecoderUsesLegacyPath(t *testing.T) {
	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir()))

	var buf bytes.Buffer
	require.NoError(t, tiff.Encode(&buf, solidImage(16, 9), nil))

	img, err := svc.decodeSource(context.Background(), "tiff", buf.Bytes())
	require.NoError(t, err)
	require.NotNil(t, img)
	assert.Equal(t, 16, img.Bounds().Dx())
	assert.Equal(t, 9, img.Bounds().Dy())
}

// TestGenerateAllWithFormat_DecoderProducesDerivatives proves that with a
// decoder wired and a heic token, the decoder's image flows through the
// UNCHANGED cwebp fan-out and yields the full WebP derivative set. Skips when
// cwebp is absent (CI without libwebp) but the decode-dispatch is still proven
// by the assertions above.
func TestGenerateAllWithFormat_DecoderProducesDerivatives(t *testing.T) {
	if _, err := exec.LookPath("cwebp"); err != nil {
		t.Skip("cwebp not on PATH — required for WebP variant generation")
	}

	dec := &fakeDecoder{returnImage: solidImage(48, 32)}
	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir())).WithDecoder(dec)

	res, err := svc.GenerateAllWithFormat(
		context.Background(), "asset-heic", "heic", bytes.NewReader([]byte("pretend-heic")),
	)
	require.NoError(t, err)
	assert.True(t, dec.called, "decoder must be invoked for the heic token")
	for _, v := range []string{"thumb_sm_webp", "thumb_md_webp", "thumb_lg_webp", "display_webp"} {
		assert.Contains(t, res.URLs, v, "WithFormat path must emit variant %q", v)
	}
	assert.Equal(t, 48, res.Width)
	assert.Equal(t, 32, res.Height)
}

// TestGenerateAllWithFormat_NilDecoderMatchesGenerateAll proves the WithFormat
// entry point with an empty token + nil decoder is byte-equivalent in behavior
// to the legacy GenerateAll (same variant set, same dimensions).
func TestGenerateAllWithFormat_NilDecoderMatchesGenerateAll(t *testing.T) {
	if _, err := exec.LookPath("cwebp"); err != nil {
		t.Skip("cwebp not on PATH — required for WebP variant generation")
	}

	raw := solidPNG(t, 24, 18)
	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir()))

	legacy, err := svc.GenerateAll(context.Background(), "asset-legacy", bytes.NewReader(raw))
	require.NoError(t, err)

	withFmt, err := svc.GenerateAllWithFormat(context.Background(), "asset-legacy", "", bytes.NewReader(raw))
	require.NoError(t, err)

	assert.Equal(t, legacy.Width, withFmt.Width)
	assert.Equal(t, legacy.Height, withFmt.Height)
	// Same variant key set.
	legacyKeys := make([]string, 0, len(legacy.URLs))
	for k := range legacy.URLs {
		legacyKeys = append(legacyKeys, k)
	}
	for _, k := range legacyKeys {
		assert.Contains(t, withFmt.URLs, k, "WithFormat must emit the same variant %q as GenerateAll", k)
	}
	assert.Equal(t, len(legacy.URLs), len(withFmt.URLs))
}

// TestGenerateAllWithFormat_TerminalDecodeErrorSurfaces proves a terminal
// *DecodeError from the decoder surfaces from the pipeline and classifies as
// terminal (so the worker dead-letters rather than loops). No cwebp needed —
// the error fires before any encode.
func TestGenerateAllWithFormat_TerminalDecodeErrorSurfaces(t *testing.T) {
	dec := &fakeDecoder{returnErr: &DecodeError{
		Err:       errors.New("corrupt heic payload"),
		Transient: false,
	}}
	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir())).WithDecoder(dec)

	_, err := svc.GenerateAllWithFormat(
		context.Background(), "asset-bad", "heic", bytes.NewReader([]byte("garbage")),
	)
	require.Error(t, err)
	assert.True(t, dec.called)

	de := ClassifyDecodeError(err)
	require.NotNil(t, de, "a decode failure must classify into a *DecodeError")
	assert.False(t, de.Transient, "a corrupt-payload decode error must be terminal")
	assert.Contains(t, strings.ToLower(err.Error()), "thumbnail decode")
}

// TestGenerateAllWithFormat_TransientDecodeErrorSurfaces proves a transient
// *DecodeError (e.g. a missing external CLI on a valid file) propagates as
// transient so the worker retries rather than dead-letters.
func TestGenerateAllWithFormat_TransientDecodeErrorSurfaces(t *testing.T) {
	dec := &fakeDecoder{returnErr: &DecodeError{
		Err:       errors.New("exec: \"heif-convert\": executable file not found in $PATH"),
		Transient: true,
	}}
	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir())).WithDecoder(dec)

	_, err := svc.GenerateAllWithFormat(
		context.Background(), "asset-tool-missing", "heic", bytes.NewReader([]byte("valid-but-untooled")),
	)
	require.Error(t, err)

	de := ClassifyDecodeError(err)
	require.NotNil(t, de)
	assert.True(t, de.Transient, "tool-missing on a valid file must be transient (retryable)")
}
