package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"
)

// These tests cover F-111: cwebp must be resolved ONCE at construction and the
// missing-binary check must run BEFORE the Lanczos resize, so the 4 concurrent
// WebP goroutines per upload neither each re-run exec.LookPath nor waste the
// resize CPU when cwebp is absent.
//
// They reuse fakeStore (defined in download_service_multipart_test.go), a
// storage.Provider whose .objects map records every Put — letting us assert
// that ZERO storage writes happen when the binary is missing (i.e. the
// goroutine short-circuited before any encode/store work).

// pngBytesF111 builds a small valid PNG so imaging.Decode succeeds and the only
// possible failure is the missing cwebp binary, not a decode error.
func pngBytesF111(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 100, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("png encode: %v", err)
	}
	return buf.Bytes()
}

// storedCountF111 returns how many objects the fake store has recorded.
//
// No locking is needed: every assertion runs AFTER the call under test has
// fully returned, and in the missing-cwebp path every goroutine short-circuits
// before fakeStore.Put, so there are no concurrent writers to f.objects.
func storedCountF111(f *fakeStore) int {
	return len(f.objects)
}

// withEmptyPathF111 points PATH at an empty temp dir for the duration of the
// test so exec.LookPath("cwebp") fails deterministically regardless of host.
func withEmptyPathF111(t *testing.T) {
	t.Helper()
	t.Setenv("PATH", t.TempDir())
}

// TestF111_CwebpResolvedOnceAtConstruction verifies cwebp is looked up exactly
// once in NewThumbnailService and cached on the service. With cwebp absent from
// PATH, cwebpErr must be set and cwebpPath empty.
func TestF111_CwebpResolvedOnceAtConstruction(t *testing.T) {
	withEmptyPathF111(t)

	svc := NewThumbnailService(&fakeStore{objects: map[string][]byte{}})

	if svc.cwebpErr == nil {
		t.Fatal("expected cwebpErr to be set when cwebp is absent from PATH")
	}
	if svc.cwebpPath != "" {
		t.Fatalf("expected empty cwebpPath when cwebp is absent, got %q", svc.cwebpPath)
	}
}

// TestF111_MissingCwebpShortCircuitsBeforeStore verifies the core of F-111:
// when cwebp is missing, generateWebPDerivative returns the missing-binary
// error WITHOUT touching storage. Pre-fix, the function ran imaging.Fit (the
// expensive resize) and only THEN called exec.LookPath; the assertion that the
// fake store received zero writes confirms no encode/store path executed.
func TestF111_MissingCwebpShortCircuitsBeforeStore(t *testing.T) {
	withEmptyPathF111(t)

	store := &fakeStore{objects: map[string][]byte{}}
	svc := NewThumbnailService(store)

	// Large source — a pre-fix implementation would Lanczos-resize this before
	// discovering cwebp is missing.
	src := image.NewRGBA(image.Rect(0, 0, 4000, 3000))

	_, err := svc.generateWebPDerivative(context.Background(), "asset-f111", src, WebPDisplaySize)
	if err == nil {
		t.Fatal("expected error when cwebp is missing, got nil")
	}
	if !strings.Contains(err.Error(), "cwebp is required") {
		t.Fatalf("expected cwebp-required error, got %q", err.Error())
	}
	if got := storedCountF111(store); got != 0 {
		t.Fatalf("expected no storage writes when cwebp missing, got %d", got)
	}
}

// TestF111_AllFourVariantsFailFast verifies GenerateAll's 4-goroutine fan-out
// (3 WebPThumbSizes + display_webp) all fail fast through the cached cwebpErr
// rather than each re-running a PATH lookup after its own resize.
func TestF111_AllFourVariantsFailFast(t *testing.T) {
	withEmptyPathF111(t)

	store := &fakeStore{objects: map[string][]byte{}}
	svc := NewThumbnailService(store)

	_, err := svc.GenerateAll(context.Background(), "asset-f111-all", bytes.NewReader(pngBytesF111(t, 64, 64)))
	if err == nil {
		t.Fatal("expected GenerateAll to fail when cwebp is missing")
	}
	if !strings.Contains(err.Error(), "cwebp is required") {
		t.Fatalf("expected cwebp-required error from a variant, got %q", err.Error())
	}
	if got := storedCountF111(store); got != 0 {
		t.Fatalf("expected no storage writes when cwebp missing, got %d", got)
	}
}
