package handler_test

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/repository"
)

// TestDeriveKey_UsesTUSUploadID_NotRowID is a regression test for the
// upload-finalize bug surfaced during UAT on 2026-04-12.
//
// Symptom: POST /api/v1/uploads succeeded (CreateMultipartUpload OK,
// session row persisted), PATCH /api/v1/uploads/{id} uploaded the single
// part successfully, but CompleteMultipartUpload returned 404 NoSuchUpload.
//
// Root cause: CreateSession builds the R2 storage key as
//
//	<workspaceID>/<TUSUploadID>/original<ext>
//
// using the freshly-minted uploadID. deriveKeyAndUploadID (the helper
// called from rehydrate + finalizeUpload) built it as
//
//	<workspaceID>/<row.ID>/original<ext>
//
// using the DB primary key. row.ID and row.TUSUploadID are independent
// UUIDs, so finalize targeted a storage key the R2/MinIO multipart upload
// was never registered against and the CompleteMultipartUpload call failed.
//
// This test locks the key-derivation pattern to TUSUploadID so the bug
// cannot re-surface.
func TestDeriveKey_UsesTUSUploadID_NotRowID(t *testing.T) {
	workspaceID := uuid.MustParse("eef9ca0f-fc26-435e-9949-ac164af71062")
	rowID := uuid.MustParse("92e926f3-b2f4-4398-9841-a7be9e77971b")
	tusUploadID := "c4f815bc-ef64-42eb-96c8-efa2dca02791"
	mpID := "pretend-r2-multipart-id"

	row := &repository.UploadSession{
		ID:                  rowID,
		WorkspaceID:         workspaceID,
		TUSUploadID:         tusUploadID,
		Filename:            "11.jpg",
		ContentType:         "image/jpeg",
		R2MultipartUploadID: &mpID,
	}

	gotKey, gotMpID := handler.DeriveKeyAndUploadIDForTest(row)

	wantKey := fmt.Sprintf("%s/%s/original.jpg", workspaceID.String(), tusUploadID)
	require.Equal(t, wantKey, gotKey, "storage key must derive from TUSUploadID, not row.ID")
	require.NotContains(t, gotKey, rowID.String(), "storage key must not reference the DB primary key")
	require.Equal(t, mpID, gotMpID)
}

// TestDeriveKey_ExtensionFallback covers the case where Filename has no
// extension and the helper falls back to splitting ContentType.
func TestDeriveKey_ExtensionFallback(t *testing.T) {
	workspaceID := uuid.MustParse("eef9ca0f-fc26-435e-9949-ac164af71062")
	tusUploadID := "c4f815bc-ef64-42eb-96c8-efa2dca02791"
	mpID := "x"

	row := &repository.UploadSession{
		ID:                  uuid.New(),
		WorkspaceID:         workspaceID,
		TUSUploadID:         tusUploadID,
		Filename:            "no-ext",
		ContentType:         "image/webp",
		R2MultipartUploadID: &mpID,
	}

	gotKey, _ := handler.DeriveKeyAndUploadIDForTest(row)
	wantKey := fmt.Sprintf("%s/%s/original.webp", workspaceID.String(), tusUploadID)
	require.Equal(t, wantKey, gotKey)
}
