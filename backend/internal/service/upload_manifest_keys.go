package service

import (
	"context"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S5: Device key verification for browser-worker engine (stub).
//
// In M16, the browser-worker is the ONLY engine that can produce a manifest,
// and browser-worker manifests are unsigned (the Web Worker cannot hold a
// private key without exposing it to page JS). The "device_id + signature"
// fields on UploadScanManifest exist for forward compatibility with M17 E56,
// where the desktop companion ships with a per-device Ed25519 keypair and
// signs every manifest it produces.
//
// Until M17 lands, this stub always returns success for browser-worker
// manifests and always returns ErrScanSignatureInvalid for non-browser-worker
// manifests that claim to have a signature (which shouldn't happen in M16 —
// the engine allowlist in engine_allowlist.go prevents desktop-agent
// manifests from being accepted at all in strict modes).
//
// Spec: feature-prd.md §4.4 (FR-UPS-026)
// Deferred to: M17 E56 (Tier D signature verify + strict enforce)
// ─────────────────────────────────────────────────────────────────────────────

// DeviceKeyVerifier is the interface the manifest validator will use in M17
// to check signed manifests from the desktop companion. Defined here so the
// validator can depend on the interface now and the M17 implementation can
// slot in without refactoring call sites.
type DeviceKeyVerifier interface {
	// VerifyManifestSignature checks that the manifest's Signature field was
	// produced by the private key associated with deviceID. Returns nil on
	// valid signatures, ErrScanSignatureInvalid on mismatch, or a wrapped
	// error on store lookup failure.
	VerifyManifestSignature(ctx context.Context, deviceID uuid.UUID, manifest *UploadScanManifest) error
}

// noopDeviceKeyVerifier is the M16 stub: browser-worker manifests pass,
// everything else fails closed. No key storage, no crypto.
type noopDeviceKeyVerifier struct{}

// NewNoopDeviceKeyVerifier returns the M16 stub verifier. The handler layer
// wires this into the validation service until M17 swaps it out.
func NewNoopDeviceKeyVerifier() DeviceKeyVerifier {
	return &noopDeviceKeyVerifier{}
}

// VerifyManifestSignature passes browser-worker manifests unconditionally
// (they carry no signature) and rejects everything else. This matches the
// Round 2 engine allowlist which already rejects desktop-agent manifests
// in strict modes with ErrScanDesktopRequired.
func (n *noopDeviceKeyVerifier) VerifyManifestSignature(
	ctx context.Context,
	deviceID uuid.UUID,
	manifest *UploadScanManifest,
) error {
	if manifest == nil {
		return ErrScanManifestInvalid
	}

	// Browser-worker manifests never carry a signature in M16. Accept them.
	if manifest.Engine == ScanEngineBrowserWorker {
		return nil
	}

	// Any other engine in M16 is either:
	//   (a) a spoofed manifest claiming to be from a non-existent desktop agent, or
	//   (b) an advance test fixture for M17.
	// Either way, fail closed — this keeps the Tier D trust boundary honest
	// until real signature verification ships.
	return ErrScanSignatureInvalid
}
