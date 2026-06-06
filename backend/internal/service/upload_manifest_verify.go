package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

var stillImageContentTypeFormats = map[string]string{
	"image/avif":             "avif",
	"image/gif":              "gif",
	"image/heic":             "heic",
	"image/heif":             "heif",
	"image/hif":              "hif",
	"image/jpeg":             "jpeg",
	"image/jfif":             "jpeg",
	"image/jpg":              "jpeg",
	"image/pjpeg":            "jpeg",
	"image/png":              "png",
	"image/tif":              "tiff",
	"image/tiff":             "tiff",
	"image/webp":             "webp",
	"image/x-adobe-dng":      "dng",
	"image/x-arriflex-ari":   "ari",
	"image/x-canon-cr2":      "cr2",
	"image/x-canon-cr3":      "cr3",
	"image/x-canon-crw":      "crw",
	"image/x-canon-raw":      "crw",
	"image/x-casio-bay":      "bay",
	"image/x-dng":            "dng",
	"image/x-epson-erf":      "erf",
	"image/x-fuji-raf":       "raf",
	"image/x-fujifilm-raf":   "raf",
	"image/x-gopro-gpr":      "gpr",
	"image/x-hasselblad-3fr": "3fr",
	"image/x-hasselblad-fff": "fff",
	"image/x-kodak-dc2":      "dc2",
	"image/x-kodak-dcr":      "dcr",
	"image/x-kodak-k25":      "k25",
	"image/x-kodak-kdc":      "kdc",
	"image/x-leaf-mos":       "mos",
	"image/x-leica-rwl":      "rwl",
	"image/x-mamiya-mdc":     "mdc",
	"image/x-mamiya-mef":     "mef",
	"image/x-minolta-mrw":    "mrw",
	"image/x-nikon-nef":      "nef",
	"image/x-nikon-nrw":      "nrw",
	"image/x-olympus-orf":    "orf",
	"image/x-olympus-ori":    "ori",
	"image/x-panasonic-raw":  "raw",
	"image/x-panasonic-rw2":  "rw2",
	"image/x-pentax-pef":     "pef",
	"image/x-phaseone-iiq":   "iiq",
	"image/x-png":            "png",
	"image/x-raw":            "raw",
	"image/x-redcode-r3d":    "r3d",
	"image/x-samsung-srw":    "srw",
	"image/x-sigma-x3f":      "x3f",
	"image/x-sony-arq":       "arq",
	"image/x-sony-arw":       "arw",
	"image/x-sony-sr2":       "sr2",
	"image/x-sony-srf":       "srf",
	"image/x-tiff":           "tiff",
}

// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S5 Round 2: Real hash verification + cheap header/trailer spot-check.
//
// VerifyAgainstBytes re-hashes the temp file a client just finished uploading
// and compares the hash against manifest.sha256. The manifest was validated
// at session-create time (see upload_manifest_validation.go), but the client
// might still swap bytes mid-upload — this is the Tier D backstop.
//
// The spot-check is a DELIBERATELY cheap format sanity test. It is NOT a full
// parse — that would defeat the "keep backend compute cheap" design. It reads
// the first 64 bytes and last 64 bytes of the file and verifies:
//   - JPEG: first 2 bytes are FFD8 (SOI), last 2 bytes are FFD9 (EOI)
//   - PNG:  first 8 bytes match the PNG signature, last 8 bytes end with IEND CRC
//   - WebP: first 12 bytes start with "RIFF....WEBP"
//   - GIF:  first 6 bytes are GIF87a or GIF89a, last byte is 0x3B (trailer)
//
// If the spot-check fails, we return ErrScanHashMismatch (not a separate
// error code) because the user-facing meaning is the same: "the bytes on
// disk don't match what your manifest said".
//
// Spec: feature-prd.md §4.4 FR-UPS-022, FR-UPS-025
// ─────────────────────────────────────────────────────────────────────────────

// VerifyAgainstBytes replaces the Round 1 stub. Computes a streaming SHA-256
// of the temp file and compares to manifestHash.
//
// The cheap header/trailer spot-check is available as a standalone function
// (VerifyHeaderTrailer) that handlers can call alongside this method if they
// want belt-and-suspenders structural sanity. It is not called from here
// because the method signature — defined by the UploadManifestValidation
// interface — only accepts a hash. A future interface addition can thread the
// detected format through if we decide the spot-check is mandatory at the
// service layer.
//
// Returns ErrScanHashMismatch if the hash check fails.
// Returns a wrapped error if the file cannot be opened/read.
func (s *uploadManifestValidationImpl) VerifyAgainstBytes(
	ctx context.Context,
	manifestHash string,
	tempFilePath string,
) error {
	_ = ctx // future: use ctx for cancellation during large-file hashing
	// Sentinel: empty hash means the manifest itself was invalid. Return a
	// consistent error so callers can treat "manifest was missing/blank" and
	// "manifest had bad fields" the same way.
	if manifestHash == "" {
		return ErrScanManifestInvalid
	}

	// Open the temp file for reading.
	f, err := os.Open(tempFilePath)
	if err != nil {
		return fmt.Errorf("opening temp file for hash verify: %w", err)
	}
	defer f.Close()

	// Streaming SHA-256 — never load the whole file into memory.
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return fmt.Errorf("hashing temp file: %w", err)
	}
	actual := hex.EncodeToString(h.Sum(nil))

	// Normalize: accept both lowercase and uppercase hex from the client.
	if !strings.EqualFold(actual, manifestHash) {
		return ErrScanHashMismatch
	}

	return nil
}

// VerifyHeaderTrailer is the cheap format spot-check. Exposed as a standalone
// function so handler-level code can run it independently of the full
// verification flow (e.g. during finalize before calling VerifyAgainstBytes,
// to fail fast on obviously corrupt uploads).
//
// Returns nil on success, ErrScanHashMismatch on structural mismatch, or a
// wrapped error on I/O failure.
func VerifyHeaderTrailer(tempFilePath string, detectedFormat string) error {
	format := strings.ToLower(strings.TrimSpace(detectedFormat))
	if format == "" {
		// No format hint — skip the check.
		return nil
	}

	f, err := os.Open(tempFilePath)
	if err != nil {
		return fmt.Errorf("opening temp file for spot-check: %w", err)
	}
	defer f.Close()

	// Read the first 64 bytes.
	head := make([]byte, 64)
	headRead, err := io.ReadFull(f, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		return fmt.Errorf("reading file head: %w", err)
	}
	head = head[:headRead]

	// Get file size to seek to the tail.
	info, err := f.Stat()
	if err != nil {
		return fmt.Errorf("stating temp file: %w", err)
	}
	size := info.Size()

	// Read the last 64 bytes (or fewer if the file is tiny).
	tailSize := int64(64)
	if size < tailSize {
		tailSize = size
	}
	tail := make([]byte, tailSize)
	if _, err := f.ReadAt(tail, size-tailSize); err != nil {
		return fmt.Errorf("reading file tail: %w", err)
	}

	return VerifyHeaderTrailerBytes(head, tail, detectedFormat)
}

// VerifyHeaderTrailerBytes runs the same cheap format spot-check as
// VerifyHeaderTrailer but operates on caller-supplied head and tail byte
// slices instead of opening a temp file. This is the no-disk variant that
// F-013 (M17 wave 6) direct-to-R2 streaming needs — the TUS handler
// captures the first 64 bytes and the last 64 bytes of the stream into
// memory as chunks flow through it, so the finalize step can run the
// spot-check without ever materializing the full upload on disk.
//
// Either slice may be short (even empty) — the signature helpers handle
// short reads defensively, matching the original path-based behavior when
// a file is smaller than 64 bytes.
func VerifyHeaderTrailerBytes(head, tail []byte, detectedFormat string) error {
	format := strings.ToLower(strings.TrimSpace(detectedFormat))
	if format == "" {
		// No format hint — skip the check.
		return nil
	}

	switch format {
	case "jpeg", "jpg":
		if !hasJpegSignature(head) || !hasJpegEnd(tail) {
			return ErrScanHashMismatch
		}
	case "png":
		if !hasPngSignature(head) || !hasPngEnd(tail) {
			return ErrScanHashMismatch
		}
	case "webp":
		if !hasWebpSignature(head) {
			return ErrScanHashMismatch
		}
	case "gif":
		if !hasGifSignature(head) || !hasGifEnd(tail) {
			return ErrScanHashMismatch
		}
	default:
		return ErrScanHashMismatch
	}

	return nil
}

// StillImageFormatFromContentType returns the canonical still-image format for
// content types RawDrive accepts in photo galleries. The browser/desktop
// scanners may support richer validation, but the API must never create upload
// sessions for generic documents, archives, scripts, videos, or unknown blobs.
func StillImageFormatFromContentType(contentType string) (string, bool) {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	format, ok := stillImageContentTypeFormats[ct]
	return format, ok
}

// StillImageFormatFromUploadCreate resolves the still-image format at upload
// session creation time. Browser File.type is often empty or
// application/octet-stream for camera RAW formats such as Sony ARW, so generic
// MIME can fall back to a passing scan manifest, but only when the request
// filename and manifest filename agree and the extension matches a
// server-decodable still-image format. Finalize still verifies the actual bytes.
func StillImageFormatFromUploadCreate(contentType, filename string, manifest *UploadScanManifest) (string, bool) {
	if format, ok := StillImageFormatFromContentType(contentType); ok {
		return NormalizeImageFormat(format), true
	}
	if !isGenericUploadContentType(contentType) || manifest == nil {
		return "", false
	}
	if manifest.Decision != "pass" {
		return "", false
	}
	format := NormalizeImageFormat(manifest.DetectedFormat)
	if !IsServerDecodableFormat(format) {
		return "", false
	}
	if !sameUploadFilename(filename, manifest.FileName) {
		return "", false
	}
	if extFormat, ok := stillImageFormatFromFilename(filename); !ok || extFormat != format {
		return "", false
	}
	return format, true
}

func isGenericUploadContentType(contentType string) bool {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	switch ct {
	case "", "application/octet-stream", "binary/octet-stream":
		return true
	}
	return false
}

func sameUploadFilename(requestFilename, manifestFilename string) bool {
	requestFilename = strings.TrimSpace(requestFilename)
	manifestFilename = strings.TrimSpace(manifestFilename)
	if requestFilename == "" || manifestFilename == "" {
		return false
	}
	return strings.EqualFold(requestFilename, manifestFilename)
}

func stillImageFormatFromFilename(filename string) (string, bool) {
	name := strings.TrimSpace(filename)
	idx := strings.LastIndex(name, ".")
	if idx < 0 || idx == len(name)-1 {
		return "", false
	}
	ext := strings.ToLower(name[idx+1:])
	switch ext {
	case "jpg", "jpeg", "jpe", "jfif", "jfi":
		return "jpeg", true
	case "png":
		return "png", true
	case "webp":
		return "webp", true
	case "gif":
		return "gif", true
	case "tif", "tiff":
		return "tiff", true
	case "heic":
		return "heic", true
	case "heif", "hif":
		return "heif", true
	case "avif":
		return "avif", true
	case "cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2":
		return ext, true
	}
	return "", false
}

// ─── Format signature helpers (bounded, cheap, stateless) ──────────────────

func hasJpegSignature(head []byte) bool {
	// JPEG SOI marker is FFD8 at offset 0.
	return len(head) >= 2 && head[0] == 0xFF && head[1] == 0xD8
}

func hasJpegEnd(tail []byte) bool {
	// JPEG EOI marker is FFD9 at the very end of the file. Scanners sometimes
	// leave a couple of padding bytes after EOI (seen in some phone cameras),
	// so we look for FFD9 anywhere in the last 16 bytes rather than forcing
	// it to be the absolute last 2 bytes. The browser worker's stricter check
	// (FR-UPS-002) will catch payloads appended further out.
	if len(tail) < 2 {
		return false
	}
	limit := 16
	if len(tail) < limit {
		limit = len(tail)
	}
	window := tail[len(tail)-limit:]
	for i := 0; i < len(window)-1; i++ {
		if window[i] == 0xFF && window[i+1] == 0xD9 {
			return true
		}
	}
	return false
}

func hasPngSignature(head []byte) bool {
	// PNG signature: 89 50 4E 47 0D 0A 1A 0A
	if len(head) < 8 {
		return false
	}
	sig := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	for i, b := range sig {
		if head[i] != b {
			return false
		}
	}
	return true
}

func hasPngEnd(tail []byte) bool {
	// PNG ends with an IEND chunk. The IEND chunk body is zero bytes, so the
	// last 12 bytes are: length (4) + "IEND" (4) + CRC (4). We look for the
	// literal "IEND" in the last 16 bytes.
	if len(tail) < 8 {
		return false
	}
	limit := 16
	if len(tail) < limit {
		limit = len(tail)
	}
	window := tail[len(tail)-limit:]
	iend := []byte{'I', 'E', 'N', 'D'}
	for i := 0; i <= len(window)-4; i++ {
		if window[i] == iend[0] && window[i+1] == iend[1] && window[i+2] == iend[2] && window[i+3] == iend[3] {
			return true
		}
	}
	return false
}

func hasWebpSignature(head []byte) bool {
	// WebP header: "RIFF" at offset 0, then 4 bytes of RIFF size, then "WEBP"
	// at offset 8.
	if len(head) < 12 {
		return false
	}
	return head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F' &&
		head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P'
}

func hasGifSignature(head []byte) bool {
	// GIF starts with GIF87a or GIF89a.
	if len(head) < 6 {
		return false
	}
	if !(head[0] == 'G' && head[1] == 'I' && head[2] == 'F' && head[3] == '8') {
		return false
	}
	return (head[4] == '7' || head[4] == '9') && head[5] == 'a'
}

func hasGifEnd(tail []byte) bool {
	// GIF trailer is 0x3B (;). It should be the very last byte of the file.
	return len(tail) > 0 && tail[len(tail)-1] == 0x3B
}
