package service

import (
	"bytes"
	"net/http"
	"strings"
)

// ─────────────────────────────────────────────────────────────────────────────
// SEC-0: Server-side POSITIVE still-image allowlist, enforced from the ACTUAL
// stored bytes at finalize time (NOT the client-supplied content_type and NOT
// the client manifest's detected_format).
//
// The browser worker / desktop scanner manifest is corroborating telemetry
// only. The bytes the server actually composed in B2/S3 are the single source
// of truth for the format decision. This is the fix for the image-only
// boundary failing OPEN: previously the only server check was a negative gate
// on the client-declared content_type prefix "video/", and the cheap
// header/trailer spot-check trusted the client manifest's DetectedFormat and
// returned ACCEPT for any unknown format.
//
// Design:
//   - SniffImageFormat classifies a >=512-byte head window via explicit magic
//     byte signatures (authoritative) corroborated by http.DetectContentType.
//   - It returns a normalized lowercase format token ("jpeg","png",...) and a
//     boolean "recognized". An unrecognized OR explicitly-dangerous payload
//     returns ("", false) — the caller treats that as REJECT (fail-closed).
//   - The caller then checks the returned token against the configured
//     allowlist (platform_settings -> env -> fail-closed core set). Even a
//     "recognized" image type that an operator removed from the allowlist is
//     rejected.
//
// Conservative matching for RAW: many RAW families are TIFF- or ISO-BMFF
// (ftyp)-based and are not byte-distinguishable from each other without a full
// parser. We match the container magic and accept it as the family token; we do
// NOT attempt to perfectly disambiguate NEF vs ARW vs DNG. This is acceptable
// because the allowlist gates on the family token and the goal is to reject
// NON-image payloads (PDF/ZIP/EXE/HTML/SVG-with-script), not to forensically
// fingerprint every camera.
// ─────────────────────────────────────────────────────────────────────────────

// CoreSafeImageFormats is the fail-closed default still-image allowlist used
// when no platform_settings/env configuration is available. It is the minimal
// safe set the product must always accept. It is deliberately NOT "allow all".
//
// RAW families (cr2, cr3, nef, arw, dng, raf, orf, rw2) and tiff/heic/avif are
// recognized by the sniffer and MAY be added to the allowlist via config, but
// the always-on fail-closed default keeps the surface tight: the common web
// still-image formats plus the modern still formats the gallery renders.
var CoreSafeImageFormats = []string{
	"jpeg", "png", "webp", "gif", "tiff", "heic", "avif",
}

// AllRecognizedImageFormats is the full set of format tokens SniffImageFormat
// can emit. Used to validate operator-supplied allowlist entries.
var AllRecognizedImageFormats = []string{
	"jpeg", "png", "webp", "gif", "tiff", "heic", "heif", "avif",
	"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2",
}

// SniffImageFormat inspects the leading bytes of a stored object and returns a
// normalized still-image format token plus whether it was recognized as a
// permitted-family image at all.
//
// Returns ("", false) for:
//   - empty / too-short input,
//   - any explicitly dangerous container (PDF, ZIP, RAR, 7z, GZIP, ELF, PE,
//     Mach-O, shell shebang, XML/SVG/HTML text), and
//   - anything that matches no positive image signature.
//
// The caller MUST treat ok==false as REJECT. A recognized token still has to
// pass the configured allowlist check at the call site.
func SniffImageFormat(head []byte) (format string, ok bool) {
	if len(head) == 0 {
		return "", false
	}

	// ── Explicit hard-reject signatures (defense in depth) ──────────────────
	// These take precedence so a polyglot that starts with a dangerous magic
	// can never be accepted even if later bytes resemble an image.
	if isDangerousNonImage(head) {
		return "", false
	}

	// ── Positive image signatures (authoritative) ───────────────────────────
	switch {
	case hasJpegMagic(head):
		return "jpeg", true
	case hasPngMagic(head):
		return "png", true
	case hasGifMagic(head):
		return "gif", true
	case hasWebpMagic(head):
		return "webp", true
	case hasRafMagic(head): // Fuji RAW — check before generic TIFF
		return "raf", true
	}

	// ISO-BMFF "ftyp" box (HEIC/HEIF/AVIF and CR3). Brand at bytes[8:12].
	if brand, isFtyp := ftypBrand(head); isFtyp {
		switch brand {
		case "heic", "heix", "heim", "heis":
			return "heic", true
		case "mif1", "msf1", "heif":
			return "heif", true
		case "avif", "avis":
			return "avif", true
		case "crx ":
			return "cr3", true
		}
		// Unknown ftyp brand — not an allowed still image. Fail closed.
		return "", false
	}

	// TIFF container (also the base for CR2 and several RAW families).
	if isTIFF(head) {
		// CR2: TIFF little-endian with "CR" at offset 8.
		if len(head) >= 10 && head[0] == 'I' && head[1] == 'I' &&
			head[8] == 'C' && head[9] == 'R' {
			return "cr2", true
		}
		// Other TIFF-based RAW (NEF/ARW/DNG/ORF/RW2) and plain TIFF are not
		// byte-distinguishable without a full IFD parse. Return the generic
		// "tiff" family token; the allowlist decides whether tiff is accepted.
		return "tiff", true
	}

	// ── Corroborating fallback: stdlib content sniff ────────────────────────
	// Only used to RECOGNIZE additional image types the explicit signatures
	// above did not catch. It is never used to override a hard-reject (handled
	// first) and never accepts a non-image/* result.
	ct := http.DetectContentType(head)
	switch {
	case strings.HasPrefix(ct, "image/jpeg"):
		return "jpeg", true
	case strings.HasPrefix(ct, "image/png"):
		return "png", true
	case strings.HasPrefix(ct, "image/gif"):
		return "gif", true
	case strings.HasPrefix(ct, "image/webp"):
		return "webp", true
	}

	// Unrecognized — fail closed.
	return "", false
}

// isDangerousNonImage reports whether the head matches a known non-image
// container/executable/markup signature that must never be accepted as an
// image, even if downstream bytes look image-like (polyglot defense).
func isDangerousNonImage(head []byte) bool {
	hasPrefix := func(sig []byte) bool { return bytes.HasPrefix(head, sig) }

	switch {
	case hasPrefix([]byte("%PDF-")): // PDF
		return true
	case hasPrefix([]byte{'P', 'K', 0x03, 0x04}), // ZIP (also docx/xlsx/jar/apk)
		hasPrefix([]byte{'P', 'K', 0x05, 0x06}),
		hasPrefix([]byte{'P', 'K', 0x07, 0x08}):
		return true
	case hasPrefix([]byte("Rar!")): // RAR
		return true
	case hasPrefix([]byte{0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C}): // 7z
		return true
	case hasPrefix([]byte{0x1F, 0x8B}): // GZIP
		return true
	case hasPrefix([]byte{0x42, 0x5A, 0x68}): // BZIP2 "BZh"
		return true
	case hasPrefix([]byte{0x7F, 'E', 'L', 'F'}): // ELF executable
		return true
	case hasPrefix([]byte{'M', 'Z'}): // DOS/PE executable
		return true
	case hasPrefix([]byte{0xFE, 0xED, 0xFA, 0xCE}), // Mach-O 32 BE
		hasPrefix([]byte{0xFE, 0xED, 0xFA, 0xCF}), // Mach-O 64 BE
		hasPrefix([]byte{0xCE, 0xFA, 0xED, 0xFE}), // Mach-O 32 LE
		hasPrefix([]byte{0xCF, 0xFA, 0xED, 0xFE}), // Mach-O 64 LE
		hasPrefix([]byte{0xCA, 0xFE, 0xBA, 0xBE}): // Mach-O universal / Java class
		return true
	case hasPrefix([]byte("#!")): // shell/script shebang
		return true
	}

	// Textual markup: SVG (which can carry <script>), HTML, XML. Trim leading
	// UTF-8 BOM and ASCII whitespace, then lowercase a small window to catch
	// "<?xml", "<svg", "<html", "<!doctype", and a bare "<script".
	t := bytes.TrimPrefix(head, []byte{0xEF, 0xBB, 0xBF})
	t = bytes.TrimLeft(t, " \t\r\n\f\v")
	if len(t) > 0 && t[0] == '<' {
		win := t
		if len(win) > 64 {
			win = win[:64]
		}
		lower := bytes.ToLower(win)
		for _, marker := range [][]byte{
			[]byte("<?xml"), []byte("<svg"), []byte("<html"),
			[]byte("<!doctype"), []byte("<script"),
		} {
			if bytes.HasPrefix(lower, marker) {
				return true
			}
		}
		// A leading '<' that is not a recognized image is not an image.
		return true
	}

	return false
}

func hasJpegMagic(head []byte) bool {
	// JPEG SOI + marker: FF D8 FF.
	return len(head) >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF
}

func hasPngMagic(head []byte) bool {
	sig := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	return len(head) >= len(sig) && bytes.HasPrefix(head, sig)
}

func hasGifMagic(head []byte) bool {
	return bytes.HasPrefix(head, []byte("GIF87a")) || bytes.HasPrefix(head, []byte("GIF89a"))
}

func hasWebpMagic(head []byte) bool {
	// "RIFF" .... "WEBP"
	return len(head) >= 12 &&
		head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F' &&
		head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P'
}

func hasRafMagic(head []byte) bool {
	// Fujifilm RAW: ASCII "FUJIFILMCCD-RAW".
	return bytes.HasPrefix(head, []byte("FUJIFILMCCD-RAW"))
}

func isTIFF(head []byte) bool {
	if len(head) < 4 {
		return false
	}
	// Little-endian II 2A 00 or big-endian MM 00 2A.
	if head[0] == 'I' && head[1] == 'I' && head[2] == 0x2A && head[3] == 0x00 {
		return true
	}
	if head[0] == 'M' && head[1] == 'M' && head[2] == 0x00 && head[3] == 0x2A {
		return true
	}
	return false
}

// ftypBrand returns the lowercase 4-char major brand of an ISO base media file
// format ("ftyp") box and true when the head is an ftyp box. The box layout is:
//
//	[0:4] big-endian box size, [4:8] "ftyp", [8:12] major_brand.
func ftypBrand(head []byte) (string, bool) {
	if len(head) < 12 {
		return "", false
	}
	if head[4] != 'f' || head[5] != 't' || head[6] != 'y' || head[7] != 'p' {
		return "", false
	}
	return strings.ToLower(string(head[8:12])), true
}

// NormalizeImageFormat lowercases and trims a format token and collapses
// aliases ("jpg"->"jpeg") so allowlist comparisons are stable regardless of
// whether the token came from the sniffer, an operator config, or a client.
func NormalizeImageFormat(format string) string {
	f := strings.ToLower(strings.TrimSpace(format))
	switch f {
	case "jpg":
		return "jpeg"
	case "tif":
		return "tiff"
	case "hif":
		return "heif"
	}
	return f
}
