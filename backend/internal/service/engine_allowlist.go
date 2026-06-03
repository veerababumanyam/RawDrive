package service

import "strings"

var desktopRequiredFormats = map[string]struct{}{
	"3fr":  {},
	"ari":  {},
	"arq":  {},
	"arw":  {},
	"avif": {},
	"bay":  {},
	"bmq":  {},
	"cap":  {},
	"cine": {},
	"cr2":  {},
	"cr3":  {},
	"crw":  {},
	"cs1":  {},
	"dcr":  {},
	"dc2":  {},
	"dng":  {},
	"erf":  {},
	"fff":  {},
	"gpr":  {},
	"heic": {},
	"heif": {},
	"hif":  {},
	"ia":   {},
	"iiq":  {},
	"k25":  {},
	"kc2":  {},
	"kdc":  {},
	"mdc":  {},
	"mef":  {},
	"mos":  {},
	"mrw":  {},
	"nef":  {},
	"nrw":  {},
	"orf":  {},
	"ori":  {},
	"pef":  {},
	"pxn":  {},
	"qtk":  {},
	"r3d":  {},
	"raf":  {},
	"raw":  {},
	"rdc":  {},
	"rw1":  {},
	"rwl":  {},
	"rw2":  {},
	"rwz":  {},
	"sr2":  {},
	"srf":  {},
	"srw":  {},
	"sti":  {},
	"tif":  {},
	"tiff": {},
	"x3f":  {},
}

// ─────────────────────────────────────────────────────────────────────────────
// M16 E49-S3: Engine/format allowlist matrix
//
// Extracted from upload_manifest_validation.go in Round 3 for clarity. The
// matrix below is the authoritative per-mode policy that gates which scanner
// (browser worker / desktop agent / CLI) may vouch for which file format under
// which workspace policy mode. All behavior is identical to the Round 1/2
// implementation — this file is a pure move, not a rewrite.
//
// Truth table (M16 — no desktop shipped yet):
//   standard                     │ any engine OK for any format
//   strict_client_scan           │ browser-worker OK for jpeg/png/webp/gif
//                                │ PLUS the server-decodable HEIC/RAW/TIFF/AVIF
//                                │ family (FMT-1 / H5 — server-side decode now
//                                │ handles these without a desktop scanner)
//   strict_original_preservation │ browser-worker rejected for everything
//                                │ (needs signed desktop/cli — not in M16)
//
// FMT-1 / H5 update: now that the server has a CGO-free CompositeDecoder
// (heif-convert for HEIC/HEIF/AVIF, exiftool/dcraw embedded-preview for RAW,
// pure-Go for TIFF/WebP) the strict_client_scan mode no longer needs a desktop
// agent for those families — the browser worker's manifest is corroborating
// telemetry and the server decodes the bytes itself at processing time. The
// non-image security boundary is unchanged: SniffImageFormat still hard-rejects
// PDF/ZIP/ELF/PE/Mach-O/SVG/HTML/XML at finalize regardless of this allowlist.
//
// Spec: feature-prd.md §4.4 (FR-UPS-023, FR-UPS-024)
// Spec: feature-architecture-delta.md §4.2 (engine allowlist matrix)
// ─────────────────────────────────────────────────────────────────────────────

// IsEngineAllowedForFormat enforces the per-mode engine/format matrix.
// Returns false (fail closed) for unknown policy modes.
func IsEngineAllowedForFormat(engine ScanEngine, format string, mode PolicyMode) bool {
	format = strings.ToLower(strings.TrimSpace(format))

	switch mode {
	case PolicyModeStandard:
		// Standard is permissive: any engine is OK for any format.
		return true

	case PolicyModeStrictClientScan:
		// Browser worker is OK for the common web formats it can scan
		// in-page, PLUS the HEIC/RAW/TIFF/AVIF families the server now
		// decodes itself (FMT-1 / H5). The browser worker cannot fully scan
		// those families, but the server-side decode makes them safe to
		// accept here — the manifest is corroborating telemetry, and the
		// non-image hard rejections still run from the actual stored bytes at
		// finalize via SniffImageFormat.
		if engine == ScanEngineBrowserWorker {
			return isBrowserWorkerFormat(format) || IsServerDecodableFormat(format)
		}
		// Desktop / CLI would be OK if they existed, but they don't in M16.
		return false

	case PolicyModeStrictOriginalPreserve:
		// All originals require signed desktop/cli, which don't exist in M16.
		return false
	}

	// Unknown mode — fail closed.
	return false
}

// isBrowserWorkerFormat reports whether a format can be scanned by the
// browser Web Worker alone (no desktop required).
func isBrowserWorkerFormat(format string) bool {
	switch format {
	case "jpeg", "jpg", "png", "webp", "gif":
		return true
	}
	return false
}

// IsServerDecodableFormat reports whether the server-side CompositeDecoder
// (see image_decoder.go) can turn a stored object of this format into a
// decodable image without a client/desktop scanner. This is the FMT-1 / H5
// single source of truth for "the server can process this itself": the set
// MUST stay in lock-step with CompositeDecoder.Decode's dispatch switch.
//
// Token form follows NormalizeImageFormat (jpg→jpeg, tif→tiff), so callers may
// pass raw sniffer/manifest tokens. An empty or unknown token returns false
// (fail closed) — it is NOT a non-image gate (SniffImageFormat owns that) but a
// positive capability check the relaxation paths layer on top of the security
// boundary.
func IsServerDecodableFormat(format string) bool {
	switch NormalizeImageFormat(format) {
	case "jpeg", "png", "gif", "tiff", "webp",
		"heic", "heif", "avif",
		"cr2", "cr3", "nef", "arw", "dng", "raf", "orf", "rw2":
		return true
	}
	return false
}

// isDesktopRequiredFormat reports whether a format needs desktop-agent
// validation. Used by upload_manifest_validation.go to emit
// ErrScanDesktopRequired with a helpful message rather than a generic
// ErrScanEngineNotAllowed.
func isDesktopRequiredFormat(format string) bool {
	format = strings.ToLower(strings.TrimSpace(format))
	_, ok := desktopRequiredFormats[format]
	return ok
}
