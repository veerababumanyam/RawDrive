package handler_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/repository"
)

// ─────────────────────────────────────────────────────────────────────────────
// FMT-1 / H5: end-to-end finalize persistence of the server-sniffed
// decode_format, plus the HEIC/RAW accept + polyglot reject security boundary
// running through the real finalize flow (CompleteMultipartUpload → cold-path
// digest → byte-check → asset insert).
//
// These drive finalizeUpload via FinalizeUploadWithLinkerForTest, which routes
// the asset insert through a capturing create func so the test can assert what
// landed on the asset row — no live Postgres needed. The store is the in-memory
// fakeMultipartStore (newFakeMultipartStore) seeded with the full composed
// object so the cold-path digest re-reads the real head bytes (state.hasher is
// nil in the seam → cold path).
// ─────────────────────────────────────────────────────────────────────────────

// finalizeWithBytes seeds a completable upload of payload for a session of the
// given filename/content-type and runs finalize, returning the created asset
// (captured from the create func) and the finalize error.
func finalizeWithBytes(t *testing.T, filename, contentType string, payload []byte) (*repository.Asset, error) {
	t.Helper()
	store := newFakeMultipartStore()
	sessions := newFakeSessionStore()

	row := &repository.UploadSession{
		WorkspaceID: uuid.New(),
		UserID:      uuid.New(),
		TUSUploadID: uuid.New().String(),
		Filename:    filename,
		ContentType: contentType,
		TotalSize:   int64(len(payload)),
	}
	storageKey, _ := handler.DeriveKeyAndUploadIDForTest(row)
	mpID := seedCompletableUpload(t, store, storageKey, payload)
	row.R2MultipartUploadID = &mpID
	partsJSON, _ := json.Marshal([]repository.UploadPartETag{
		{PartNumber: 1, ETag: "etag-" + mpID + "-1", Size: int64(len(payload))},
	})
	row.R2PartETags = partsJSON

	var captured *repository.Asset
	_, err := handler.FinalizeUploadWithLinkerForTest(store, sessions, &fakeGalleryLinker{}, row,
		func(_ context.Context, a *repository.Asset) error {
			captured = a
			return nil
		})
	return captured, err
}

// fullHeic is a valid ftyp/heic head (>=24 bytes) padded out so the composed
// object is a sensible size. SniffImageFormat classifies it as "heic".
func fullHeic() []byte {
	head := []byte{
		0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c',
		0x00, 0x00, 0x00, 0x00, 'm', 'i', 'f', '1', 'h', 'e', 'i', 'c',
	}
	body := make([]byte, 256)
	return append(head, body...)
}

func TestFinalize_Heic_PersistsDecodeFormat(t *testing.T) {
	asset, err := finalizeWithBytes(t, "shot.heic", "image/heic", fullHeic())
	require.NoError(t, err, "HEIC must finalize now that server decode exists (FMT-1/H5)")
	require.NotNil(t, asset)
	require.NotNil(t, asset.DecodeFormat, "decode_format must be persisted for a HEIC upload")
	assert.Equal(t, "heic", *asset.DecodeFormat)
}

func TestFinalize_RawCR2_PersistsDecodeFormat(t *testing.T) {
	// Canon CR2: TIFF LE with "CR" at offset 8.
	head := []byte{'I', 'I', 0x2A, 0x00, 0x10, 0x00, 0x00, 0x00, 'C', 'R', 0x02, 0x00}
	payload := append(head, make([]byte, 128)...)
	asset, err := finalizeWithBytes(t, "raw.cr2", "image/x-canon-cr2", payload)
	require.NoError(t, err, "Canon CR2 RAW must finalize (FMT-1/H5)")
	require.NotNil(t, asset)
	require.NotNil(t, asset.DecodeFormat, "decode_format must be persisted for a CR2 upload")
	assert.Equal(t, "cr2", *asset.DecodeFormat)
}

func TestFinalize_Jpeg_PersistsDecodeFormat(t *testing.T) {
	payload := append([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F'}, make([]byte, 64)...)
	payload = append(payload, 0xFF, 0xD9)
	asset, err := finalizeWithBytes(t, "p.jpg", "image/jpeg", payload)
	require.NoError(t, err, "JPEG must finalize (legacy path unchanged)")
	require.NotNil(t, asset)
	require.NotNil(t, asset.DecodeFormat)
	assert.Equal(t, "jpeg", *asset.DecodeFormat, "jpeg must be persisted/normalized as decode_format")
}

// TestFinalize_PdfPolyglot_StillRejected is the security-boundary guard at the
// full-finalize level: a PDF declared as image/heic must NOT finalize. The
// asset insert must never run (createFn captures nothing) and finalize returns
// ErrScanManifestRequired from the relaxed byte-check default branch.
func TestFinalize_PdfPolyglot_StillRejected(t *testing.T) {
	payload := append([]byte("%PDF-1.7\n"), make([]byte, 256)...)
	asset, err := finalizeWithBytes(t, "evil.heic", "image/heic", payload)
	require.Error(t, err, "a PDF masquerading as HEIC must be rejected at finalize")
	assert.Nil(t, asset, "the asset insert must never run for a rejected polyglot")
}
