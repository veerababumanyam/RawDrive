package handler

import (
	"context"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// This file is only compiled during `go test` (because of the _test.go suffix).
// It exposes narrowly-scoped test hooks into the unexported chunked upload
// helpers so audit-driven tests (F-003, F-004) can exercise them directly.

// VerifyManifestAtFinalizeForTest is a test-only seam that calls the internal
// verifyManifestAtFinalize method. Used by the F-003 hash mismatch tests so
// they can drive the manifest verification path without booting the full
// multi-chunk upload flow.
func VerifyManifestAtFinalizeForTest(h *ChunkedUploadHandler, ctx context.Context, tmpPath string, manifest *service.UploadScanManifest) error {
	session := &uploadSession{TmpPath: tmpPath, Manifest: manifest}
	return h.verifyManifestAtFinalize(ctx, session)
}

// ApplyScanMetadataForTest is a test-only seam over the unexported
// applyScanMetadata helper. Used by the F-004 metadata-persistence tests.
func ApplyScanMetadataForTest(asset *repository.Asset, manifest *service.UploadScanManifest) {
	applyScanMetadata(asset, manifest)
}
