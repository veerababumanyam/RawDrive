package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// This file is only compiled during `go test` (because of the _test.go suffix).
// It exposes narrowly-scoped test hooks into the unexported chunked upload
// helpers so audit-driven tests (F-003, F-004) can exercise them directly.

// VerifyManifestAtFinalizeForTest is a test-only seam over the unexported
// verifyManifestAtFinalize method. F-013 (M17 wave 6) replaced the temp-file
// argument with in-memory bytes so the seam no longer depends on local disk
// I/O — the test passes the full upload buffer and the seam computes the
// SHA-256 and the head/tail windows internally before dispatching to the
// real verification method.
func VerifyManifestAtFinalizeForTest(
	h *ChunkedUploadHandler,
	ctx context.Context,
	fileBytes []byte,
	manifest *service.UploadScanManifest,
) error {
	sum := sha256.Sum256(fileBytes)
	hashHex := hex.EncodeToString(sum[:])

	head := fileBytes
	if len(head) > 64 {
		head = head[:64]
	}
	tail := fileBytes
	if len(tail) > 64 {
		tail = tail[len(tail)-64:]
	}
	return h.verifyManifestAtFinalize(ctx, hashHex, head, tail, manifest)
}

// ApplyScanMetadataForTest is a test-only seam over the unexported
// applyScanMetadata helper. Used by the F-004 metadata-persistence tests.
func ApplyScanMetadataForTest(asset *repository.Asset, manifest *service.UploadScanManifest) {
	applyScanMetadata(asset, manifest)
}
