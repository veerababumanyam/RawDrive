package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	xtiff "golang.org/x/image/tiff"
)

// idTestImage builds a small deterministic 8x8 RGBA image used as the source
// for every encoder-backed fixture. Using a real (non-empty) image guarantees
// the encoders emit valid, decodable bytes. The id-prefixed helper names avoid
// colliding with package-level helpers (e.g. watermark_service.go's encodeJPEG).
func idTestImage() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 32), G: uint8(y * 32), B: 0x40, A: 0xFF})
		}
	}
	return img
}

func idEncodeJPEG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, jpeg.Encode(&buf, idTestImage(), &jpeg.Options{Quality: 90}))
	return buf.Bytes()
}

func idEncodePNG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, idTestImage()))
	return buf.Bytes()
}

func idEncodeGIF(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, gif.Encode(&buf, idTestImage(), nil))
	return buf.Bytes()
}

func idEncodeTIFF(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, xtiff.Encode(&buf, idTestImage(), nil))
	return buf.Bytes()
}

// idEncodeWebP produces real WebP bytes by shelling out to cwebp (there is no
// pure-Go WebP encoder). The caller skips the test when cwebp is unavailable.
func idEncodeWebP(t *testing.T) []byte {
	t.Helper()
	cwebp, err := exec.LookPath("cwebp")
	if err != nil {
		t.Skip("cwebp not installed — required to generate the WebP fixture")
	}
	dir := t.TempDir()
	inPath := filepath.Join(dir, "src.png")
	outPath := filepath.Join(dir, "out.webp")
	require.NoError(t, os.WriteFile(inPath, idEncodePNG(t), 0o600))

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, cwebp, "-q", "82", inPath, "-o", outPath)
	out, runErr := cmd.CombinedOutput()
	require.NoErrorf(t, runErr, "cwebp failed: %s", string(out))

	data, err := os.ReadFile(outPath)
	require.NoError(t, err)
	require.NotEmpty(t, data)
	return data
}

// TestImageDecoder_DispatchDecodesPureGoFormats asserts the CompositeDecoder
// routes each stdlib/x-image format token to the correct decoder and returns a
// decodable image with the expected bounds.
func TestImageDecoder_DispatchDecodesPureGoFormats(t *testing.T) {
	dec := NewCompositeDecoder()
	ctx := context.Background()

	cases := []struct {
		format string
		bytes  []byte
	}{
		{"jpeg", idEncodeJPEG(t)},
		{"png", idEncodePNG(t)},
		{"gif", idEncodeGIF(t)},
		{"tiff", idEncodeTIFF(t)},
	}

	for _, tc := range cases {
		t.Run(tc.format, func(t *testing.T) {
			img, err := dec.Decode(ctx, tc.format, bytes.NewReader(tc.bytes))
			require.NoErrorf(t, err, "decode %s", tc.format)
			require.NotNil(t, img)
			b := img.Bounds()
			require.Equal(t, 8, b.Dx(), "width for %s", tc.format)
			require.Equal(t, 8, b.Dy(), "height for %s", tc.format)
		})
	}
}

// TestImageDecoder_DecodesWebP exercises the x/image/webp decoder against real
// cwebp-produced bytes. Skipped (not failed) when cwebp is unavailable.
func TestImageDecoder_DecodesWebP(t *testing.T) {
	data := idEncodeWebP(t) // t.Skip inside if cwebp missing
	dec := NewCompositeDecoder()

	img, err := dec.Decode(context.Background(), "webp", bytes.NewReader(data))
	require.NoError(t, err)
	require.NotNil(t, img)
	require.Equal(t, 8, img.Bounds().Dx())
	require.Equal(t, 8, img.Bounds().Dy())
}

// TestImageDecoder_NormalizesAliasTokens verifies jpg->jpeg and tif->tiff
// aliases dispatch correctly, matching NormalizeImageFormat.
func TestImageDecoder_NormalizesAliasTokens(t *testing.T) {
	dec := NewCompositeDecoder()
	ctx := context.Background()

	img, err := dec.Decode(ctx, "jpg", bytes.NewReader(idEncodeJPEG(t)))
	require.NoError(t, err)
	require.NotNil(t, img)

	img, err = dec.Decode(ctx, "tif", bytes.NewReader(idEncodeTIFF(t)))
	require.NoError(t, err)
	require.NotNil(t, img)
}

// TestImageDecoder_Stage2FormatsRouteToExternalAdapters asserts every format
// that needs the external CLI adapters now routes to the heic/raw adapters
// (wired in stage 2) rather than the old static stage-1 placeholder. The
// stage-1 build returned a fixed terminal "requires the external decoder
// (stage 2)" error for these tokens; stage 2 replaces that with a real
// dispatch. On a host WITHOUT the CLIs installed the call surfaces a TRANSIENT
// DecodeError (tool missing → install + retry, never dead-letter a valid file).
// On a host WITH the CLIs, garbage bytes surface a terminal extractor/convert
// failure. Either way the old placeholder string must be gone.
func TestImageDecoder_Stage2FormatsRouteToExternalAdapters(t *testing.T) {
	dec := NewCompositeDecoder()
	ctx := context.Background()

	heicFamily := []string{"heic", "heif", "avif"}
	rawFamily := []string{"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2"}

	assertRouted := func(t *testing.T, format string, toolsPresent bool) {
		t.Helper()
		img, err := dec.Decode(ctx, format, bytes.NewReader([]byte("ignored")))
		require.Nil(t, img)
		require.Error(t, err)

		var de *DecodeError
		require.Truef(t, errors.As(err, &de), "expected *DecodeError for %s, got %T", format, err)
		require.NotNil(t, de.Unwrap(), "DecodeError must wrap an inner error")
		require.NotContainsf(t, de.Error(), "requires the external decoder (stage 2)",
			"format %s still hits the stage-1 placeholder instead of the adapter", format)
		if !toolsPresent {
			require.Truef(t, de.Transient, "tool-missing dispatch for %s must be transient", format)
		}
	}

	heicPresent := idHasTool("heif-convert")
	rawPresent := idHasTool("exiftool") || idHasTool("dcraw")
	for _, format := range heicFamily {
		t.Run(format, func(t *testing.T) { assertRouted(t, format, heicPresent) })
	}
	for _, format := range rawFamily {
		t.Run(format, func(t *testing.T) { assertRouted(t, format, rawPresent) })
	}
}

// idHasTool reports whether the named binary resolves on PATH.
func idHasTool(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

// TestImageDecoder_UnknownFormatIsTerminal asserts an unrecognized token fails
// closed with a terminal DecodeError.
func TestImageDecoder_UnknownFormatIsTerminal(t *testing.T) {
	dec := NewCompositeDecoder()

	img, err := dec.Decode(context.Background(), "exe", bytes.NewReader([]byte("MZ...")))
	require.Nil(t, img)
	require.Error(t, err)

	var de *DecodeError
	require.True(t, errors.As(err, &de))
	require.False(t, de.Transient, "unknown format must be terminal, never transient")
}

// TestImageDecoder_CorruptBytesAreTerminal asserts a recognized format token
// with undecodable bytes surfaces a terminal DecodeError (parse failure is not
// retryable).
func TestImageDecoder_CorruptBytesAreTerminal(t *testing.T) {
	dec := NewCompositeDecoder()

	img, err := dec.Decode(context.Background(), "png", bytes.NewReader([]byte("not a real png")))
	require.Nil(t, img)
	require.Error(t, err)

	var de *DecodeError
	require.True(t, errors.As(err, &de))
	require.False(t, de.Transient, "corrupt-bytes parse failure must be terminal")
}

// TestDecodeError_ErrorAndUnwrap covers the DecodeError string and unwrap
// contract directly.
func TestDecodeError_ErrorAndUnwrap(t *testing.T) {
	inner := errors.New("boom")
	de := &DecodeError{Err: inner, Transient: true}

	require.Contains(t, de.Error(), "boom")
	require.True(t, errors.Is(de, inner), "DecodeError must unwrap to its inner error")
	require.Same(t, inner, de.Unwrap())

	// A nil-wrapped DecodeError must not panic.
	require.NotPanics(t, func() { _ = (&DecodeError{}).Error() })
}

// TestClassifyDecodeError_Exported covers the exported ClassifyDecodeError used
// by the ThumbnailWorker (BE3): nil → nil; an already-classified *DecodeError is
// returned as-is (honoring the decoder's explicit verdict); a plain error runs
// through the same heuristics as the internal classifier.
func TestClassifyDecodeError_Exported(t *testing.T) {
	require.Nil(t, ClassifyDecodeError(nil), "nil error → nil DecodeError")

	// Explicit terminal DecodeError passes through unchanged.
	explicit := &DecodeError{Err: errors.New("unsupported image format \"exe\""), Transient: false}
	got := ClassifyDecodeError(explicit)
	require.NotNil(t, got)
	require.False(t, got.Transient, "explicit terminal verdict must be honored")
	require.Same(t, explicit, got, "an already-classified *DecodeError must pass through as-is")

	// Wrapped explicit DecodeError is unwrapped via errors.As.
	wrapped := fmt.Errorf("process %s: %w", "abc", explicit)
	gotWrapped := ClassifyDecodeError(wrapped)
	require.NotNil(t, gotWrapped)
	require.False(t, gotWrapped.Transient)

	// Plain transient marker classifies transient.
	transient := ClassifyDecodeError(errors.New("download original: B2 request timed out"))
	require.NotNil(t, transient)
	require.True(t, transient.Transient, "plain timeout error must classify transient")

	// Plain parse failure classifies terminal.
	term := ClassifyDecodeError(errors.New("invalid PNG signature"))
	require.NotNil(t, term)
	require.False(t, term.Transient, "plain parse error must classify terminal")
}

// TestClassifyDecodeError covers transient-vs-terminal classification across
// the representative error families.
func TestClassifyDecodeError(t *testing.T) {
	transient := []error{
		context.DeadlineExceeded,
		fmt.Errorf("wrapped: %w", context.DeadlineExceeded),
		errors.New("signal: killed"),
		errors.New("cannot allocate memory"),
		errors.New("fork/exec: ENOMEM"),
		errors.New("RequestTimeout: B2 request timed out"),
		errors.New("read tcp: i/o timeout"),
		context.Canceled,
	}
	for _, err := range transient {
		de := classifyDecodeError(err)
		require.Truef(t, de.Transient, "expected transient for %q", err)
		require.Equal(t, err, de.Unwrap())
	}

	terminal := []error{
		errors.New("invalid PNG signature"),
		errors.New("unknown format"),
		errors.New("corrupt JFIF marker"),
		image.ErrFormat,
		errors.New("unexpected EOF in IFD"),
	}
	for _, err := range terminal {
		de := classifyDecodeError(err)
		require.Falsef(t, de.Transient, "expected terminal for %q", err)
	}
}
