// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S1: Upload screening shared types.
//
// Wire-compatible with backend/internal/service/upload_scan_types.go.
// Any change to the JSON shape here MUST also update the backend types and
// the ManifestV1 canonical signing order (feature-architecture-delta.md §4.2).
//
// The browser screening worker and the backend Tier D validator share the
// same manifest shape so the backend can verify the client's verdict before
// the upload pipeline is even touched.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ScanDecision is the top-level verdict for a scan. Matches the backend
 * UploadScanManifest.Decision enum.
 *
 * - "pass": all checks cleared, upload should proceed
 * - "block": structural or metadata violation, upload should be rejected
 *   locally (worker never sends the bytes over the wire)
 * - "needs_desktop_scan": format requires the desktop companion (TIFF / HEIC /
 *   RAW); in M16 this path is a hint — the user sees a "download RawDrive
 *   Desktop" CTA rather than an upload button.
 */
export type ScanDecision = "pass" | "block" | "needs_desktop_scan";

/**
 * ScanEngine identifies which component produced a manifest. The browser
 * worker always stamps "browser-worker"; "desktop-agent" and "cli" are
 * reserved for M17.
 */
export type ScanEngine = "browser-worker" | "desktop-agent" | "cli";

/**
 * ScanFinding describes one structural or metadata violation detected by
 * the worker. Low severity findings are allowed in "pass" decisions (they
 * surface as warnings in the UI); medium/high findings always produce
 * "block".
 */
export interface ScanFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  /** Byte offset where the violation was detected. Optional — some findings
   * are whole-file (e.g. "file too small"). */
  offset?: number;
  /** Human-readable explanation. Surfaced directly in the UI. */
  message: string;
}

export type FindingSeverity = "low" | "medium" | "high";

/**
 * FindingCategory is the taxonomy of things the worker can detect. Keep in
 * sync with the backend metrics labels in upload_scan metrics (Round 2).
 */
export type FindingCategory =
  | "appended_payload" // bytes past the official end-of-file marker
  | "metadata_budget" // metadata (EXIF / text chunks) exceeds the per-policy budget
  | "polyglot_signature" // file matches multiple format signatures (e.g. JPEG + ZIP)
  | "archive_signature" // archive header detected inside or appended to an image
  | "malformed_structure" // top-level structural invariant violated
  | "size_overflow" // file larger than the format allows or bigger than policy max
  | "decode_failure" // browser decode sanity check failed
  | "unsupported_format"; // detected format is not in the browser-worker allowlist

/**
 * ScanDimensions is the optional image dimensions block for format parsers
 * that can cheaply extract width/height without a full decode.
 */
export interface ScanDimensions {
  width: number;
  height: number;
}

/**
 * ScanResult is the per-format parser's return value. The worker aggregates
 * these into a final ScanManifest.
 */
export interface ScanResult {
  /** Format detected by the structural sniffer — may differ from the MIME
   *  type advertised by the browser. */
  detectedFormat: string;
  /** Declared content-type from File.type (informational; the detected
   *  format is authoritative). */
  declaredType: string;
  decision: ScanDecision;
  /** Confidence / risk score in [0, 1]. 0 means "definitely clean";
   *  1 means "definitely malicious". */
  riskScore: number;
  findings: ScanFinding[];
  dimensions?: ScanDimensions;
}

/**
 * ScanManifest is the canonical manifest sent to the backend alongside
 * the upload session create payload. Field order matches
 * feature-architecture-delta.md §4.2 so any future canonical-JSON signing
 * scheme produces a stable byte sequence.
 */
export interface ScanManifest {
  policy_version: string;
  engine: ScanEngine;
  engine_version: string;
  file_name: string;
  declared_type: string;
  detected_format: string;
  sha256: string;
  size_bytes: number;
  decision: ScanDecision;
  risk_score: number;
  findings: ScanFinding[];
  dimensions?: ScanDimensions;
}

/**
 * WorkerInput is the message the main thread posts to the screening worker.
 * The worker responds with WorkerOutput (either a ScanManifest or an error).
 */
export interface WorkerInput {
  type: "scan";
  fileId: string; // correlation id for the main-thread side
  file: File; // transferred by reference
  policyVersion: string;
  metadataBudgetBytes: number;
}

export interface WorkerSuccess {
  type: "result";
  fileId: string;
  manifest: ScanManifest;
}

export interface WorkerError {
  type: "error";
  fileId: string;
  message: string;
}

export type WorkerOutput = WorkerSuccess | WorkerError;

/**
 * Canonical ordering of ScanManifest keys. Any future signing or comparison
 * code must iterate keys in this exact order so the byte sequence is stable
 * across browsers and across worker versions.
 */
export const MANIFEST_KEY_ORDER: readonly (keyof ScanManifest)[] = [
  "policy_version",
  "engine",
  "engine_version",
  "file_name",
  "declared_type",
  "detected_format",
  "sha256",
  "size_bytes",
  "decision",
  "risk_score",
  "findings",
  "dimensions",
] as const;
