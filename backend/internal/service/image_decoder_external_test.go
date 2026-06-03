package service

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// withEmptyPath runs fn with PATH set to an empty (non-existent) directory so
// exec.LookPath cannot resolve any external tool. This deterministically
// exercises the "tool missing" branch without uninstalling anything from the
// host. PATH is restored afterwards.
func withEmptyPath(t *testing.T, fn func()) {
	t.Helper()
	old, had := os.LookupEnv("PATH")
	// An empty PATH makes LookPath fail for bare command names.
	require.NoError(t, os.Setenv("PATH", ""))
	t.Cleanup(func() {
		if had {
			_ = os.Setenv("PATH", old)
		} else {
			_ = os.Unsetenv("PATH")
		}
	})
	fn()
}

// requireTransientDecodeError asserts err is a *DecodeError flagged transient
// and wrapping a non-nil inner error.
func requireTransientDecodeError(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	var de *DecodeError
	require.Truef(t, errors.As(err, &de), "expected *DecodeError, got %T: %v", err, err)
	require.Truef(t, de.Transient, "expected transient DecodeError, got terminal: %v", de)
	require.NotNil(t, de.Unwrap(), "DecodeError must wrap an inner error")
}

// requireTerminalDecodeError asserts err is a *DecodeError flagged terminal.
func requireTerminalDecodeError(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	var de *DecodeError
	require.Truef(t, errors.As(err, &de), "expected *DecodeError, got %T: %v", err, err)
	require.Falsef(t, de.Transient, "expected terminal DecodeError, got transient: %v", de)
}

// ── rawPreviewDecoder ───────────────────────────────────────────────────────

// TestRawPreviewDecoder_ToolMissingIsTransient asserts that when neither
// exiftool nor dcraw can be resolved on PATH, the decoder returns a transient
// DecodeError (operator can install the tool and retry the message), never a
// terminal one (which would dead-letter a perfectly good RAW file forever).
func TestRawPreviewDecoder_ToolMissingIsTransient(t *testing.T) {
	dec := newRawPreviewDecoder()
	withEmptyPath(t, func() {
		img, err := dec.Decode(context.Background(), "cr2", bytes.NewReader([]byte("II*\x00fake-raw")))
		require.Nil(t, img)
		requireTransientDecodeError(t, err)
	})
}

// TestRawPreviewDecoder_NilReaderIsTerminal asserts a nil reader is a terminal
// programmer/contract error, not a retryable one.
func TestRawPreviewDecoder_NilReaderIsTerminal(t *testing.T) {
	dec := newRawPreviewDecoder()
	img, err := dec.Decode(context.Background(), "nef", nil)
	require.Nil(t, img)
	requireTerminalDecodeError(t, err)
}

// TestRawPreviewDecoder_CorruptInputIsTerminal feeds a non-RAW payload. With a
// real extractor present, neither exiftool nor dcraw can pull a preview, so the
// failure is terminal (re-running on the same bytes can never succeed). Skipped
// when no extractor is installed.
func TestRawPreviewDecoder_CorruptInputIsTerminal(t *testing.T) {
	if !hasAnyTool("exiftool", "dcraw") {
		t.Skip("neither exiftool nor dcraw installed — cannot exercise extractor failure path")
	}
	dec := newRawPreviewDecoder()
	img, err := dec.Decode(context.Background(), "cr2", bytes.NewReader([]byte("definitely not a raw file")))
	require.Nil(t, img)
	requireTerminalDecodeError(t, err)
}

// TestRawPreviewDecoder_DecodesEmbeddedPreview is the happy path: a RAW with an
// embedded full-res JPEG preview decodes to an image. It needs exiftool to BOTH
// build the fixture (write a PreviewImage tag) and extract it, so it is skipped
// unless exiftool is installed.
func TestRawPreviewDecoder_DecodesEmbeddedPreview(t *testing.T) {
	exiftool, err := exec.LookPath("exiftool")
	if err != nil {
		t.Skip("exiftool not installed — cannot build or extract an embedded-preview fixture")
	}
	rawWithPreview := buildExiftoolPreviewFixture(t, exiftool)

	dec := newRawPreviewDecoder()
	img, decErr := dec.Decode(context.Background(), "cr2", bytes.NewReader(rawWithPreview))
	require.NoError(t, decErr)
	require.NotNil(t, img)
	require.Positive(t, img.Bounds().Dx())
	require.Positive(t, img.Bounds().Dy())
}

// ── heicDecoder ─────────────────────────────────────────────────────────────

// TestHeicDecoder_ToolMissingIsTransient asserts heif-convert absence yields a
// transient DecodeError, not a terminal one.
func TestHeicDecoder_ToolMissingIsTransient(t *testing.T) {
	dec := newHeicDecoder()
	withEmptyPath(t, func() {
		img, err := dec.Decode(context.Background(), "heic", bytes.NewReader([]byte("\x00\x00\x00 ftypheic")))
		require.Nil(t, img)
		requireTransientDecodeError(t, err)
	})
}

// TestHeicDecoder_NilReaderIsTerminal asserts a nil reader is terminal.
func TestHeicDecoder_NilReaderIsTerminal(t *testing.T) {
	dec := newHeicDecoder()
	img, err := dec.Decode(context.Background(), "heif", nil)
	require.Nil(t, img)
	requireTerminalDecodeError(t, err)
}

// TestHeicDecoder_CorruptInputIsTerminal feeds garbage to a present
// heif-convert; the conversion fails on unparseable bytes → terminal.
func TestHeicDecoder_CorruptInputIsTerminal(t *testing.T) {
	if !hasAnyTool("heif-convert") {
		t.Skip("heif-convert not installed — cannot exercise conversion failure path")
	}
	dec := newHeicDecoder()
	img, err := dec.Decode(context.Background(), "heic", bytes.NewReader([]byte("not a heic at all")))
	require.Nil(t, img)
	requireTerminalDecodeError(t, err)
}

// ── CompositeDecoder dispatch (stage-2 wiring) ──────────────────────────────

// TestCompositeDecoder_RoutesExternalFormats asserts the dispatch now routes the
// HEIC family and RAW families to the external adapters instead of the stage-1
// terminal placeholder. With no tools installed the call surfaces a TRANSIENT
// "tool missing" error (proving it reached the adapter), not the old terminal
// "requires the external decoder (stage 2)" placeholder. With tools installed,
// garbage bytes surface a terminal extractor/convert failure — either way the
// path is no longer the static placeholder.
func TestCompositeDecoder_RoutesExternalFormats(t *testing.T) {
	dec := NewCompositeDecoder()

	heicFamily := []string{"heic", "heif", "avif"}
	rawFamily := []string{"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2"}

	check := func(format string, toolsPresent bool) {
		img, err := dec.Decode(context.Background(), format, bytes.NewReader([]byte("ignored-bytes")))
		require.Nil(t, img)
		require.Error(t, err)
		var de *DecodeError
		require.Truef(t, errors.As(err, &de), "expected *DecodeError for %s", format)
		// The stage-1 placeholder used this exact phrasing; routing must replace it.
		require.NotContainsf(t, de.Error(), "requires the external decoder (stage 2)",
			"format %s is still hitting the stage-1 placeholder, not the adapter", format)
		if !toolsPresent {
			require.Truef(t, de.Transient, "tool-missing dispatch for %s must be transient", format)
		}
	}

	for _, f := range heicFamily {
		t.Run(f, func(t *testing.T) {
			check(f, hasAnyTool("heif-convert"))
		})
	}
	for _, f := range rawFamily {
		t.Run(f, func(t *testing.T) {
			check(f, hasAnyTool("exiftool", "dcraw"))
		})
	}
}

// ── test helpers ────────────────────────────────────────────────────────────

// hasAnyTool reports whether at least one of the named binaries resolves on PATH.
func hasAnyTool(names ...string) bool {
	for _, n := range names {
		if _, err := exec.LookPath(n); err == nil {
			return true
		}
	}
	return false
}

// buildExiftoolPreviewFixture creates a minimal file carrying a JPEG
// PreviewImage tag that `exiftool -b -PreviewImage` can extract. It writes a
// valid JPEG to disk, then uses exiftool to copy it into the PreviewImage tag
// of a TIFF-shaped container so the extractor path is exercised end to end.
func buildExiftoolPreviewFixture(t *testing.T, exiftool string) []byte {
	t.Helper()
	dir := t.TempDir()

	// A real, decodable JPEG to serve as the "embedded preview".
	previewPath := filepath.Join(dir, "preview.jpg")
	require.NoError(t, os.WriteFile(previewPath, idEncodeJPEG(t), 0o600))

	// Base container: a valid TIFF (the CR2/NEF/DNG families are TIFF-based),
	// which exiftool will happily attach a PreviewImage tag to.
	fixturePath := filepath.Join(dir, "fixture.tiff")
	require.NoError(t, os.WriteFile(fixturePath, idEncodeTIFF(t), 0o600))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	// -overwrite_original avoids exiftool's _original backup file.
	cmd := exec.CommandContext(ctx, exiftool, "-overwrite_original",
		"-PreviewImage<="+previewPath, fixturePath)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("exiftool could not embed a PreviewImage tag (%v): %s", err, string(out))
	}

	data, err := os.ReadFile(fixturePath)
	require.NoError(t, err)
	require.NotEmpty(t, data)
	return data
}
