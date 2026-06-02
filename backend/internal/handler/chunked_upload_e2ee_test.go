package handler_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func encryptedManifestForBytes(t *testing.T, ciphertext []byte) map[string]interface{} {
	t.Helper()
	sum := sha256.Sum256(ciphertext)
	return map[string]interface{}{
		"scheme":            "rawdrive-e2ee-v1",
		"algorithm":         "AES-256-GCM",
		"key_id":            "gallery:test-key:0011223344556677",
		"object_type":       "original",
		"iv_b64":            "AQIDBAUGBwgJCgsM",
		"plaintext_sha256":  "not-stored-server-side-secret",
		"ciphertext_sha256": hex.EncodeToString(sum[:]),
		"plaintext_size":    123,
		"ciphertext_size":   len(ciphertext),
		"content_type":      "image/jpeg",
	}
}

func TestCreateSession_E2EERequiredRejectsMissingMediaEncryption(t *testing.T) {
	rig := setupStreamingRig(t)
	rig.handler.WithClientSideEncryptionRequired(true)

	body, _ := json.Marshal(map[string]interface{}{
		"filename":     "private.jpg",
		"content_type": "image/jpeg",
		"total_size":   int64(64),
		"chunk_size":   int64(64),
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	rig.handler.CreateSession(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "MEDIA_ENCRYPTION_REQUIRED")
	assert.Empty(t, rig.store.uploads, "storage multipart upload must not start without E2EE metadata")
}

func TestCreateSession_E2EERejectsUnversionedGalleryKeyID(t *testing.T) {
	rig := setupStreamingRig(t)
	rig.handler.WithClientSideEncryptionRequired(true)
	ciphertext := []byte("ciphertext-only")
	manifest := encryptedManifestForBytes(t, ciphertext)
	manifest["key_id"] = "gallery:test-key"

	body, _ := json.Marshal(map[string]interface{}{
		"filename":         "private.jpg",
		"content_type":     "image/jpeg",
		"total_size":       int64(len(ciphertext)),
		"chunk_size":       int64(len(ciphertext)),
		"media_encryption": manifest,
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	rig.handler.CreateSession(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "MEDIA_ENCRYPTION_INVALID")
	assert.Contains(t, rr.Body.String(), "versioned gallery key id")
	assert.Empty(t, rig.store.uploads, "storage multipart upload must not start with an ambiguous key id")
}

func TestCreateSession_E2EEStoresManifestAndUsesEncryptedStorageContentType(t *testing.T) {
	rig := setupStreamingRig(t)
	rig.handler.WithClientSideEncryptionRequired(true)
	ciphertext := []byte("ciphertext-only")

	body, _ := json.Marshal(map[string]interface{}{
		"filename":         "private.jpg",
		"content_type":     "image/jpeg",
		"total_size":       int64(len(ciphertext)),
		"chunk_size":       int64(len(ciphertext)),
		"media_encryption": encryptedManifestForBytes(t, ciphertext),
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	rig.handler.CreateSession(rr, req)

	require.Equal(t, http.StatusCreated, rr.Code, "CreateSession failed: %s", rr.Body.String())
	var resp struct {
		UploadID string `json:"upload_id"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	row, err := rig.sessions.GetByTUSUploadID(context.Background(), resp.UploadID)
	require.NoError(t, err)
	assert.JSONEq(t, mustJSON(t, encryptedManifestForBytes(t, ciphertext)), string(row.MediaEncryption))

	require.Len(t, rig.store.uploads, 1)
	for _, upload := range rig.store.uploads {
		assert.Equal(t, "application/vnd.rawdrive.encrypted", upload.contentType)
	}
}

func TestFinalizeUpload_E2EESkipsPlaintextSniffingAndWaitsForSourceDerivatives(t *testing.T) {
	rig := setupStreamingRig(t)
	rig.handler.WithClientSideEncryptionRequired(true)
	ciphertext := []byte("not-a-jpeg-because-this-is-aes-gcm-ciphertext")

	body, _ := json.Marshal(map[string]interface{}{
		"filename":         "private.jpg",
		"content_type":     "image/jpeg",
		"total_size":       int64(len(ciphertext)),
		"chunk_size":       int64(len(ciphertext)),
		"media_encryption": encryptedManifestForBytes(t, ciphertext),
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)
	require.Equal(t, http.StatusCreated, rr.Code, "CreateSession failed: %s", rr.Body.String())
	var resp struct {
		UploadID string `json:"upload_id"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))

	rr = rig.patchChunk(t, resp.UploadID, 0, ciphertext, "")

	require.Equal(t, http.StatusOK, rr.Code, "encrypted finalize failed: %s", rr.Body.String())
	var finalize struct {
		Asset struct {
			Status            string                 `json:"status"`
			IsEncrypted       bool                   `json:"is_encrypted"`
			EncryptionAlgo    string                 `json:"encryption_algo"`
			EncryptionVersion int                    `json:"encryption_version"`
			MediaEncryption   map[string]interface{} `json:"media_encryption"`
		} `json:"asset"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &finalize))
	assert.Equal(t, "waiting_derivatives", finalize.Asset.Status)
	assert.True(t, finalize.Asset.IsEncrypted)
	assert.Equal(t, "client-side-aes-256-gcm", finalize.Asset.EncryptionAlgo)
	assert.Equal(t, 1, finalize.Asset.EncryptionVersion)
	assert.Equal(t, "rawdrive-e2ee-v1", finalize.Asset.MediaEncryption["scheme"])
}

func TestFinalizeUpload_E2EERejectsCiphertextHashMismatch(t *testing.T) {
	rig := setupStreamingRig(t)
	rig.handler.WithClientSideEncryptionRequired(true)
	ciphertext := []byte("real ciphertext")
	manifest := encryptedManifestForBytes(t, ciphertext)
	manifest["ciphertext_sha256"] = hex.EncodeToString(make([]byte, 32))

	body, _ := json.Marshal(map[string]interface{}{
		"filename":         "private.jpg",
		"content_type":     "image/jpeg",
		"total_size":       int64(len(ciphertext)),
		"chunk_size":       int64(len(ciphertext)),
		"media_encryption": manifest,
	})
	req := rig.authedRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.handler.CreateSession(rr, req)
	require.Equal(t, http.StatusCreated, rr.Code, "CreateSession failed: %s", rr.Body.String())
	var resp struct {
		UploadID string `json:"upload_id"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))

	rr = rig.patchChunk(t, resp.UploadID, 0, ciphertext, "")

	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code)
	assert.Contains(t, rr.Body.String(), "ENCRYPTED_MEDIA_HASH_MISMATCH")
}

func mustJSON(t *testing.T, v interface{}) string {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return string(b)
}
