package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S5 Round 2 tests: real hash verification + header/trailer spot-check.
//
// These tests use real temp files on disk (testing.T.TempDir()) so the
// streaming SHA-256 path and the format spot-check are both exercised.
// Round 1 only smoke-tested the interface shape; Round 2 is the real deal.
// ─────────────────────────────────────────────────────────────────────────────

// writeTempFile creates a temp file with the given bytes and returns its path.
func writeTempFile(t *testing.T, name string, content []byte) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, content, 0644); err != nil {
		t.Fatalf("writing temp file: %v", err)
	}
	return path
}

// sha256Hex is a test helper mirroring the production hash path.
func sha256Hex(content []byte) string {
	h := sha256.Sum256(content)
	return hex.EncodeToString(h[:])
}

// ─── VerifyAgainstBytes: hash round-trip ───────────────────────────────────

func TestVerifyAgainstBytes_HashMatches_Passes(t *testing.T) {
	content := []byte("pretend this is an image's bytes")
	expectedHash := sha256Hex(content)
	path := writeTempFile(t, "image.bin", content)

	v := newValidatorEnforced(&stubCatalog{})
	err := v.VerifyAgainstBytes(context.Background(), expectedHash, path)
	if err != nil {
		t.Fatalf("matching hash should pass, got %v", err)
	}
}

func TestVerifyAgainstBytes_HashMismatch_Rejected(t *testing.T) {
	content := []byte("original bytes")
	path := writeTempFile(t, "image.bin", content)

	// Give the validator a hash that does NOT match — simulates a client
	// swapping content after the manifest was submitted.
	v := newValidatorEnforced(&stubCatalog{})
	err := v.VerifyAgainstBytes(context.Background(), "deadbeef", path)
	if !errors.Is(err, ErrScanHashMismatch) {
		t.Fatalf("expected ErrScanHashMismatch, got %v", err)
	}
}

func TestVerifyAgainstBytes_HashCaseInsensitive(t *testing.T) {
	// Clients may send uppercase or lowercase hex; both should work.
	content := []byte("case test")
	lower := sha256Hex(content)
	upperHash := ""
	for _, c := range lower {
		if c >= 'a' && c <= 'f' {
			upperHash += string(c - 32)
		} else {
			upperHash += string(c)
		}
	}
	path := writeTempFile(t, "case.bin", content)

	v := newValidatorEnforced(&stubCatalog{})
	if err := v.VerifyAgainstBytes(context.Background(), upperHash, path); err != nil {
		t.Fatalf("uppercase hash should match, got %v", err)
	}
	if err := v.VerifyAgainstBytes(context.Background(), lower, path); err != nil {
		t.Fatalf("lowercase hash should match, got %v", err)
	}
}

func TestVerifyAgainstBytes_MissingFile_Errors(t *testing.T) {
	v := newValidatorEnforced(&stubCatalog{})
	err := v.VerifyAgainstBytes(context.Background(), "abc123", "/nonexistent/path/definitely-not-here.bin")
	if err == nil {
		t.Fatal("missing file should error")
	}
	// Error should NOT be ErrScanHashMismatch — it's an I/O error.
	if errors.Is(err, ErrScanHashMismatch) {
		t.Fatal("missing file should be an I/O error, not a hash mismatch")
	}
}

func TestVerifyAgainstBytes_EmptyFile_Hashes(t *testing.T) {
	// Edge case: empty file has a well-known SHA-256.
	// e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
	emptyHash := sha256Hex([]byte{})
	path := writeTempFile(t, "empty.bin", []byte{})

	v := newValidatorEnforced(&stubCatalog{})
	if err := v.VerifyAgainstBytes(context.Background(), emptyHash, path); err != nil {
		t.Fatalf("empty file should verify against empty-file hash, got %v", err)
	}
}

// ─── VerifyHeaderTrailer: cheap format spot-check ──────────────────────────

func TestVerifyHeaderTrailer_Jpeg_Valid(t *testing.T) {
	// Minimum viable JPEG: SOI + SOS stub + EOI + trailing padding.
	jpeg := []byte{
		0xFF, 0xD8, // SOI
		0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, // APP0 stub (invalid but OK for spot-check)
		0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
		0xFF, 0xD9, // EOI
	}
	path := writeTempFile(t, "valid.jpg", jpeg)

	if err := VerifyHeaderTrailer(path, "jpeg"); err != nil {
		t.Fatalf("valid JPEG should pass spot-check, got %v", err)
	}
}

func TestVerifyHeaderTrailer_Jpeg_WrongSOI(t *testing.T) {
	// First two bytes are not FFD8 — fake signature.
	notJpeg := []byte{0xFF, 0xFF, 0xD8, 0xD9}
	path := writeTempFile(t, "fake.jpg", notJpeg)

	err := VerifyHeaderTrailer(path, "jpeg")
	if !errors.Is(err, ErrScanHashMismatch) {
		t.Fatalf("wrong SOI should fail spot-check, got %v", err)
	}
}

func TestVerifyHeaderTrailer_Jpeg_MissingEOI(t *testing.T) {
	// Valid SOI but no EOI in the last 16 bytes.
	noEnd := make([]byte, 100)
	noEnd[0] = 0xFF
	noEnd[1] = 0xD8
	// Fill the last 16 bytes with non-FFD9 content.
	for i := len(noEnd) - 16; i < len(noEnd); i++ {
		noEnd[i] = 0x00
	}
	path := writeTempFile(t, "no-eoi.jpg", noEnd)

	err := VerifyHeaderTrailer(path, "jpeg")
	if !errors.Is(err, ErrScanHashMismatch) {
		t.Fatalf("missing EOI should fail spot-check, got %v", err)
	}
}

func TestVerifyHeaderTrailer_Png_Valid(t *testing.T) {
	// PNG signature + minimal IHDR-ish body + IEND chunk.
	png := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // signature
		0x00, 0x00, 0x00, 0x0D, // IHDR length
		'I', 'H', 'D', 'R',
		0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0,
		0x00, 0x00, 0x00, 0x00, // fake CRC
		0x00, 0x00, 0x00, 0x00, // IEND length
		'I', 'E', 'N', 'D',
		0xAE, 0x42, 0x60, 0x82, // IEND CRC
	}
	path := writeTempFile(t, "valid.png", png)

	if err := VerifyHeaderTrailer(path, "png"); err != nil {
		t.Fatalf("valid PNG should pass spot-check, got %v", err)
	}
}

func TestVerifyHeaderTrailer_Png_WrongSignature(t *testing.T) {
	notPng := []byte{'N', 'O', 'T', 'P', 'N', 'G', '!', '!'}
	path := writeTempFile(t, "fake.png", notPng)

	err := VerifyHeaderTrailer(path, "png")
	if !errors.Is(err, ErrScanHashMismatch) {
		t.Fatalf("wrong PNG signature should fail, got %v", err)
	}
}

func TestVerifyHeaderTrailer_Webp_Valid(t *testing.T) {
	webp := []byte{
		'R', 'I', 'F', 'F',
		0x00, 0x00, 0x00, 0x00, // fake RIFF size
		'W', 'E', 'B', 'P',
		'V', 'P', '8', ' ', // VP8 chunk
	}
	path := writeTempFile(t, "valid.webp", webp)

	if err := VerifyHeaderTrailer(path, "webp"); err != nil {
		t.Fatalf("valid WebP should pass spot-check, got %v", err)
	}
}

func TestVerifyHeaderTrailer_Gif_Valid(t *testing.T) {
	gif := []byte{
		'G', 'I', 'F', '8', '9', 'a',
		0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
		0x3B, // trailer
	}
	path := writeTempFile(t, "valid.gif", gif)

	if err := VerifyHeaderTrailer(path, "gif"); err != nil {
		t.Fatalf("valid GIF should pass spot-check, got %v", err)
	}
}

func TestVerifyHeaderTrailer_Gif_MissingTrailer(t *testing.T) {
	// GIF header but no 0x3B trailer.
	gif := []byte{
		'G', 'I', 'F', '8', '9', 'a',
		0x00, 0x00, 0x00, 0x00, // random, no 0x3B at end
	}
	path := writeTempFile(t, "no-trailer.gif", gif)

	err := VerifyHeaderTrailer(path, "gif")
	if !errors.Is(err, ErrScanHashMismatch) {
		t.Fatalf("missing GIF trailer should fail, got %v", err)
	}
}

func TestVerifyHeaderTrailer_EmptyFormat_Skipped(t *testing.T) {
	// If no format hint is provided, the spot-check should skip and return nil.
	anything := []byte("random garbage not a real image")
	path := writeTempFile(t, "garbage.bin", anything)

	if err := VerifyHeaderTrailer(path, ""); err != nil {
		t.Fatalf("empty format should skip spot-check, got %v", err)
	}
}

func TestVerifyHeaderTrailer_UnknownFormat_Rejected(t *testing.T) {
	// Unknown formats fail closed so disguised non-images cannot bypass the
	// server-side still-image boundary.
	bytes := []byte("something unrecognized")
	path := writeTempFile(t, "unknown.xyz", bytes)

	err := VerifyHeaderTrailer(path, "bmp")
	if !errors.Is(err, ErrScanHashMismatch) {
		t.Fatalf("unknown format should fail spot-check, got %v", err)
	}
}

func TestStillImageFormatFromContentType(t *testing.T) {
	tests := []struct {
		contentType string
		format      string
		ok          bool
	}{
		{"image/jpeg", "jpeg", true},
		{"image/webp; charset=binary", "webp", true},
		{"image/x-canon-cr3", "cr3", true},
		{"application/pdf", "", false},
		{"video/mp4", "", false},
	}

	for _, tt := range tests {
		format, ok := StillImageFormatFromContentType(tt.contentType)
		if ok != tt.ok || format != tt.format {
			t.Fatalf("StillImageFormatFromContentType(%q) = (%q, %v), want (%q, %v)",
				tt.contentType, format, ok, tt.format, tt.ok)
		}
	}
}

func TestVerifyHeaderTrailer_MissingFile_Errors(t *testing.T) {
	err := VerifyHeaderTrailer("/nonexistent.jpg", "jpeg")
	if err == nil {
		t.Fatal("missing file should error")
	}
	if errors.Is(err, ErrScanHashMismatch) {
		t.Fatal("missing file should be I/O error, not hash mismatch")
	}
}
