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
//   strict_client_scan           │ browser-worker OK for jpeg/png/webp/gif ONLY
//                                │ TIFF/HEIC/AVIF/RAW → ErrScanDesktopRequired
//   strict_original_preservation │ browser-worker rejected for everything
//                                │ (needs signed desktop/cli — not in M16)
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
		// Browser worker is OK for common web formats only.
		if engine == ScanEngineBrowserWorker {
			return isBrowserWorkerFormat(format)
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

// isDesktopRequiredFormat reports whether a format needs desktop-agent
// validation. Used by upload_manifest_validation.go to emit
// ErrScanDesktopRequired with a helpful message rather than a generic
// ErrScanEngineNotAllowed.
func isDesktopRequiredFormat(format string) bool {
	format = strings.ToLower(strings.TrimSpace(format))
	_, ok := desktopRequiredFormats[format]
	return ok
}
