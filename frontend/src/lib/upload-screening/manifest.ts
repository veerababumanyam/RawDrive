// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S3: Canonical scan manifest builder.
//
// Combines a ScanResult with file metadata + the computed SHA-256 into a
// ScanManifest ready to send to the backend. The field order follows
// MANIFEST_KEY_ORDER so any future canonical-JSON signing scheme produces
// stable bytes across clients.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ScanManifest,
  ScanResult,
  ScanEngine,
  ScanFinding,
  ScanDimensions,
  ScanDecision,
} from "./types";
import { MANIFEST_KEY_ORDER } from "./types";

const ENGINE_VERSION = "1.0.0";

export interface BuildManifestInput {
  file: File;
  policyVersion: string;
  sha256: string;
  result: ScanResult;
  engine?: ScanEngine; // default "browser-worker"
}

/**
 * Build a ScanManifest from a ScanResult, file metadata, and a precomputed
 * SHA-256. This is what the worker posts back to the main thread.
 */
export function buildManifest(input: BuildManifestInput): ScanManifest {
  const engine: ScanEngine = input.engine ?? "browser-worker";
  return {
    policy_version: input.policyVersion,
    engine,
    engine_version: ENGINE_VERSION,
    file_name: input.file.name,
    declared_type: input.file.type || "application/octet-stream",
    detected_format: input.result.detectedFormat,
    sha256: input.sha256,
    size_bytes: input.file.size,
    decision: input.result.decision,
    risk_score: input.result.riskScore,
    findings: input.result.findings,
    dimensions: input.result.dimensions,
  };
}

/**
 * Serialize a ScanManifest to canonical JSON — keys in MANIFEST_KEY_ORDER,
 * no whitespace. Used when we eventually sign manifests (M17+); kept here
 * so the canonical byte sequence is defined in one place.
 *
 * Undefined optional fields (`dimensions`) are omitted from the output
 * so two manifests that differ only in whether dimensions were computed
 * still compare equal at the byte level.
 */
export function canonicalizeManifest(m: ScanManifest): string {
  const parts: string[] = [];
  for (const key of MANIFEST_KEY_ORDER) {
    const value = m[key];
    if (value === undefined) continue;
    parts.push(JSON.stringify(key) + ":" + JSON.stringify(value));
  }
  return "{" + parts.join(",") + "}";
}

/**
 * Quick helper for tests that want to construct a minimal manifest with
 * mostly-default fields.
 */
export function makeTestManifest(overrides: Partial<ScanManifest> = {}): ScanManifest {
  return {
    policy_version: "upload-screening/2026-04-10",
    engine: "browser-worker",
    engine_version: ENGINE_VERSION,
    file_name: "test.jpg",
    declared_type: "image/jpeg",
    detected_format: "jpeg",
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    size_bytes: 0,
    decision: "pass" as ScanDecision,
    risk_score: 0,
    findings: [] as ScanFinding[],
    dimensions: undefined as ScanDimensions | undefined,
    ...overrides,
  };
}
