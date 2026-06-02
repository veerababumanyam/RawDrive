package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
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

// DeriveKeyAndUploadIDForTest is a test-only seam over the unexported
// deriveKeyAndUploadID helper. Regression coverage for the key-consistency
// bug discovered during UAT on 2026-04-12: finalize was building the R2
// storage key from row.ID while CreateSession built it from TUSUploadID,
// so CompleteMultipartUpload targeted a key the storage backend had never
// seen and failed with NoSuchUpload.
func DeriveKeyAndUploadIDForTest(row *repository.UploadSession) (string, string) {
	return deriveKeyAndUploadID(row)
}

// PersistAssetOrCleanupForTest is a test-only seam over the unexported
// persistAssetOrCleanup helper. F-005 regression coverage: when the asset
// insert fails after CompleteMultipartUpload has assembled the object, the
// helper must delete the orphaned storage object. The seam injects a fake
// store and a controllable create func so the cleanup branch can be
// exercised without a live Postgres *repository.AssetRepo (which is a
// concrete type that cannot otherwise be made to fail in a unit test).
func PersistAssetOrCleanupForTest(
	store storage.Provider,
	asset *repository.Asset,
	storageKey string,
	create func(context.Context, *repository.Asset) error,
) error {
	h := &ChunkedUploadHandler{store: store}
	return h.persistAssetOrCleanup(context.Background(), asset, storageKey, create)
}

// FinalizeUploadForTest is a test-only seam over the unexported
// finalizeUpload method. F-021 regression coverage: when the persisted
// scan_manifest JSON fails to decode AFTER CompleteMultipartUpload has
// assembled the object, finalize must delete the orphaned storage object
// (mirroring the digest/verify failure paths) rather than leaking it. The
// seam builds a handler over the supplied store + sessions and forces the
// finalize cold path so tests verify the assembled object bytes, not an empty
// synthetic stream state.
func FinalizeUploadForTest(
	store storage.Provider,
	sessions UploadSessionStore,
	row *repository.UploadSession,
) (map[string]interface{}, error) {
	h := &ChunkedUploadHandler{store: store, sessions: sessions}
	storageKey, mpID := deriveKeyAndUploadID(row)
	state := newStreamState(storageKey, mpID, nil)
	state.hasher = nil
	return h.finalizeUpload(context.Background(), row, state)
}

// FinalizeUploadWithLinkerForTest is a test-only seam over finalizeUpload that
// exercises the S3-G4 / AREA-UPLOADER-3 server-side gallery link. The asset
// repo is a concrete type that cannot be made to fail/observe in a unit test,
// so the seam injects a fake asset-create func (via the assetCreateFn hook) and
// a fake GalleryLinker. finalize routes Create through persistAssetOrCleanup
// using the supplied create func and then links the persisted asset via the
// linker. Returns the result so tests can assert the asset id that was linked.
func FinalizeUploadWithLinkerForTest(
	store storage.Provider,
	sessions UploadSessionStore,
	linker GalleryLinker,
	row *repository.UploadSession,
	create func(context.Context, *repository.Asset) error,
) (map[string]interface{}, error) {
	h := &ChunkedUploadHandler{
		store:         store,
		sessions:      sessions,
		galleryLinker: linker,
		assetCreateFn: create,
	}
	storageKey, mpID := deriveKeyAndUploadID(row)
	state := newStreamState(storageKey, mpID, nil)
	state.hasher = nil
	return h.finalizeUpload(context.Background(), row, state)
}

// NewHandlerWithGalleryLinkageForTest builds a handler wired for the
// CreateSession gallery-validation tests (resolver + linker), over the supplied
// fake store + session store. Lets the streaming-style tests drive CreateSession
// with a gallery_id and assert the workspace-ownership rejection / persistence.
func NewHandlerWithGalleryLinkageForTest(
	store storage.Provider,
	sessions UploadSessionStore,
	galleries galleryResolverForTest,
	albums albumResolverForTest,
	linker GalleryLinker,
) *ChunkedUploadHandler {
	h := NewChunkedUploadHandler(nil, nil, store, sessions)
	h.galleries = galleries
	h.albums = albums
	h.galleryLinker = linker
	return h
}

// galleryResolverForTest / albumResolverForTest re-export the unexported
// resolver interfaces so external (package handler_test) tests can supply fakes.
type galleryResolverForTest = galleryResolver
type albumResolverForTest = albumResolver
