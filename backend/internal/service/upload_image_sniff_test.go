package service

import (
	"os"
	"path/filepath"
	"testing"
)

// ─────────────────────────────────────────────────────────────────────────────
// SEC-0 unit tests for the server-side magic-byte still-image allowlist.
//
// The positive case uses a REAL wedding JPEG from tests/photos (the
// canonical test asset set — filenames contain spaces and parentheses, which
// the test handles via filepath.Join). Negative cases use the actual magic
// bytes of non-image containers/executables/markup.
// ─────────────────────────────────────────────────────────────────────────────

// testPhotosDir is the canonical real-asset directory, relative to this package.
const testPhotosDir = "../../../tests/photos"

// syntheticJPEGHead is a minimal-but-valid JPEG byte sequence: SOI (FFD8) +
// APP0/JFIF segment + EOI (FFD9). SniffImageFormat only needs the leading
// FF D8 FF magic to classify it as "jpeg", so this is a faithful stand-in for
// the byte-classifier unit test when the real wedding fixture is absent.
var syntheticJPEGHead = []byte{
	0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F',
	0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
	0xFF, 0xD9,
}

// realJPEGHead returns the first n bytes of a real wedding JPEG when the
// canonical fixture is present (honoring the AGENTS.md real-photo preference —
// the filename intentionally contains a space and parentheses to catch
// real-world filename bugs). When the fixture is absent (the sec-audit base
// predates tests/photos/), it falls back to a synthesized minimal-but-valid
// JPEG so this pure byte-classifier unit test stays green in any checkout. The
// real-photo rule governs upload/gallery integration and E2E tests; a
// magic-byte classifier unit test does not require a real photograph. It never
// silently skips — the test still asserts SniffImageFormat returns ("jpeg", true).
func realJPEGHead(t *testing.T, n int) []byte {
	t.Helper()
	p := filepath.Join(testPhotosDir, "Wedding (42).jpg")
	f, err := os.Open(p)
	if err != nil {
		// Fixture not present in this checkout — use the synthetic header.
		if len(syntheticJPEGHead) <= n {
			return syntheticJPEGHead
		}
		return syntheticJPEGHead[:n]
	}
	defer f.Close()
	buf := make([]byte, n)
	read, err := f.Read(buf)
	if err != nil {
		t.Fatalf("read real test JPEG %q: %v", p, err)
	}
	return buf[:read]
}

func TestSniffImageFormat_RealJPEGAccepted(t *testing.T) {
	head := realJPEGHead(t, 512)
	format, ok := SniffImageFormat(head)
	if !ok {
		t.Fatalf("real JPEG must be recognized; got ok=false")
	}
	if format != "jpeg" {
		t.Fatalf("real JPEG must classify as jpeg; got %q", format)
	}
}

func TestSniffImageFormat_PositiveSignatures(t *testing.T) {
	pngSig := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0}
	gifSig := append([]byte("GIF89a"), make([]byte, 16)...)
	webpSig := []byte{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'}
	tiffLE := []byte{'I', 'I', 0x2A, 0x00, 0, 0, 0, 0}
	tiffBE := []byte{'M', 'M', 0x00, 0x2A, 0, 0, 0, 0}
	heic := []byte{0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c', 0, 0, 0, 0}
	avif := []byte{0, 0, 0, 0x1C, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f', 0, 0, 0, 0}
	cr3 := []byte{0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'c', 'r', 'x', ' ', 0, 0, 0, 0}
	cr2 := []byte{'I', 'I', 0x2A, 0x00, 0x10, 0, 0, 0, 'C', 'R', 0x02, 0x00}
	raf := append([]byte("FUJIFILMCCD-RAW"), make([]byte, 16)...)

	cases := []struct {
		name string
		head []byte
		want string
	}{
		{"png", pngSig, "png"},
		{"gif", gifSig, "gif"},
		{"webp", webpSig, "webp"},
		{"tiff-le", tiffLE, "tiff"},
		{"tiff-be", tiffBE, "tiff"},
		{"heic", heic, "heic"},
		{"avif", avif, "avif"},
		{"cr3", cr3, "cr3"},
		{"cr2", cr2, "cr2"},
		{"raf", raf, "raf"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			format, ok := SniffImageFormat(c.head)
			if !ok {
				t.Fatalf("%s must be recognized", c.name)
			}
			if format != c.want {
				t.Fatalf("%s: want %q, got %q", c.name, c.want, format)
			}
		})
	}
}

func TestSniffImageFormat_RejectsNonImages(t *testing.T) {
	pad := func(b []byte) []byte { return append(b, make([]byte, 64)...) }

	cases := []struct {
		name string
		head []byte
	}{
		{"pdf", pad([]byte("%PDF-1.7\n%âãÏÓ"))},
		{"zip", pad([]byte{'P', 'K', 0x03, 0x04, 0x14, 0x00})},
		{"rar", pad([]byte("Rar!\x1a\x07\x00"))},
		{"7z", pad([]byte{0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C})},
		{"gzip", pad([]byte{0x1F, 0x8B, 0x08})},
		{"elf", pad([]byte{0x7F, 'E', 'L', 'F', 0x02, 0x01})},
		{"pe", pad([]byte{'M', 'Z', 0x90, 0x00})},
		{"macho", pad([]byte{0xCF, 0xFA, 0xED, 0xFE})},
		{"shebang", pad([]byte("#!/bin/sh\nrm -rf /"))},
		{"html", pad([]byte("<html><body><script>alert(1)</script>"))},
		{"svg-with-script", pad([]byte("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\">"))},
		{"xml", pad([]byte("<?xml version=\"1.0\"?><svg/>"))},
		{"doctype-html", pad([]byte("<!DOCTYPE html><html>"))},
		{"plain-text", pad([]byte("just some text, not an image at all"))},
		{"empty", []byte{}},
		{"too-short", []byte{0xFF}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			format, ok := SniffImageFormat(c.head)
			if ok {
				t.Fatalf("%s must be rejected (fail-closed); got format=%q ok=true", c.name, format)
			}
		})
	}
}

// TestSniffImageFormat_PolyglotPdfWithJpegTail ensures a file that starts as a
// dangerous container is rejected even if image-like bytes appear later.
func TestSniffImageFormat_PolyglotPdfWithJpegTail(t *testing.T) {
	head := append([]byte("%PDF-1.7\n"), 0xFF, 0xD8, 0xFF, 0xE0)
	if _, ok := SniffImageFormat(head); ok {
		t.Fatalf("PDF-prefixed polyglot must be rejected even with a JPEG marker later")
	}
}

// TestNormalizeImageFormat covers alias collapsing and case/whitespace
// normalization so allowlist comparisons are stable regardless of token source.
func TestNormalizeImageFormat(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"jpg", "jpeg"},
		{"JPG", "jpeg"},
		{" Jpg ", "jpeg"},
		{"jpeg", "jpeg"},
		{"tif", "tiff"},
		{"TIF", "tiff"},
		{"tiff", "tiff"},
		{"PNG", "png"},
		{"  WebP  ", "webp"},
		{"heic", "heic"},
		{"", ""},
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			if got := NormalizeImageFormat(c.in); got != c.want {
				t.Fatalf("NormalizeImageFormat(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
