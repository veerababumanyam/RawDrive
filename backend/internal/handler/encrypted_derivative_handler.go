package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

var encryptedDerivativeVariants = map[string]struct{}{
	"thumb_sm_webp": {},
	"thumb_md_webp": {},
	"thumb_lg_webp": {},
	"display_webp":  {},
}

const maxEncryptedDerivativeBytes int64 = 64 << 20

type EncryptedDerivativeHandler struct {
	assetRepo *repository.AssetRepo
	derivRepo *repository.AssetDerivativeRepo
	store     storage.Provider
}

func NewEncryptedDerivativeHandler(
	assetRepo *repository.AssetRepo,
	derivRepo *repository.AssetDerivativeRepo,
	store storage.Provider,
) *EncryptedDerivativeHandler {
	return &EncryptedDerivativeHandler{
		assetRepo: assetRepo,
		derivRepo: derivRepo,
		store:     store,
	}
}

func (h *EncryptedDerivativeHandler) Upload(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	assetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	if h.assetRepo == nil || h.derivRepo == nil || h.store == nil {
		http.Error(w, `{"error":"encrypted derivative dependencies not wired"}`, http.StatusServiceUnavailable)
		return
	}

	asset, err := h.assetRepo.GetByIDAndWorkspace(r.Context(), assetID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if asset == nil {
		http.Error(w, `{"error":"asset not found"}`, http.StatusNotFound)
		return
	}
	if !asset.IsEncrypted {
		respondJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":   "ASSET_NOT_CLIENT_ENCRYPTED",
			"message": "encrypted derivatives can only be attached to encrypted assets",
		})
		return
	}

	parsed, err := parseEncryptedDerivativeMultipart(r)
	if err != nil {
		http.Error(w, `{"error":"invalid multipart form"}`, http.StatusBadRequest)
		return
	}
	variant := parsed.variant
	if _, ok := encryptedDerivativeVariants[variant]; !ok {
		respondJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":   "INVALID_DERIVATIVE_VARIANT",
			"message": "variant must be one of thumb_sm_webp, thumb_md_webp, thumb_lg_webp, display_webp",
		})
		return
	}

	var manifest map[string]interface{}
	if err := json.Unmarshal([]byte(parsed.mediaEncryption), &manifest); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":   "MEDIA_ENCRYPTION_INVALID",
			"message": "media_encryption must be valid JSON",
		})
		return
	}

	if len(parsed.fileBytes) == 0 {
		http.Error(w, `{"error":"file required"}`, http.StatusBadRequest)
		return
	}
	fileSize := int64(len(parsed.fileBytes))
	if err := validateClientSideMediaManifest(manifest, fileSize); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":   "MEDIA_ENCRYPTION_INVALID",
			"message": err.Error(),
		})
		return
	}
	if objectType := stringField(manifest, "object_type"); objectType != variant {
		respondJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":   "MEDIA_ENCRYPTION_INVALID",
			"message": fmt.Sprintf("object_type must match variant %q", variant),
		})
		return
	}

	width := parsePositiveInt(parsed.width)
	height := parsePositiveInt(parsed.height)
	storageKey := encryptedDerivativeStorageKey(assetID, variant)
	if err := h.store.Put(r.Context(), storageKey, bytes.NewReader(parsed.fileBytes), fileSize, clientSideMediaStorageContentType); err != nil {
		http.Error(w, `{"error":"store derivative failed"}`, http.StatusInternalServerError)
		return
	}

	algo := clientSideMediaAssetAlgo
	derivative := &repository.AssetDerivative{
		AssetID:           assetID,
		Variant:           variant,
		StorageKey:        storageKey,
		Width:             width,
		Height:            height,
		SizeBytes:         fileSize,
		Format:            "webp",
		IsEncrypted:       true,
		EncryptionAlgo:    &algo,
		EncryptionVersion: clientSideMediaAssetVersion,
		MediaEncryption:   manifest,
	}
	if err := h.derivRepo.Upsert(r.Context(), derivative); err != nil {
		_ = h.store.Delete(r.Context(), storageKey)
		http.Error(w, `{"error":"persist derivative failed"}`, http.StatusInternalServerError)
		return
	}

	thumbnails := asset.ThumbnailURLs
	if thumbnails == nil {
		thumbnails = map[string]string{}
	}
	thumbnails[variant] = storageKey
	mediaEncryption := withVariantManifest(asset.MediaEncryption, variant, manifest)
	status := clientSideMediaWaitingStatus
	if hasAllEncryptedWebPVariants(thumbnails) {
		status = "ready"
	}
	if err := h.assetRepo.UpdateEncryptedDerivatives(r.Context(), assetID, thumbnails, mediaEncryption, status); err != nil {
		http.Error(w, `{"error":"update asset derivatives failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"derivative": derivative,
		"status":     status,
	})
}

type encryptedDerivativeMultipart struct {
	variant         string
	width           string
	height          string
	mediaEncryption string
	fileBytes       []byte
}

func parseEncryptedDerivativeMultipart(r *http.Request) (*encryptedDerivativeMultipart, error) {
	reader, err := r.MultipartReader()
	if err != nil {
		return nil, err
	}
	parsed := &encryptedDerivativeMultipart{}
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		switch part.FormName() {
		case "variant":
			parsed.variant = readMultipartField(part, 128)
		case "width":
			parsed.width = readMultipartField(part, 32)
		case "height":
			parsed.height = readMultipartField(part, 32)
		case "media_encryption":
			parsed.mediaEncryption = readMultipartField(part, 64<<10)
		case "file":
			data, err := io.ReadAll(io.LimitReader(part, maxEncryptedDerivativeBytes+1))
			if err != nil {
				_ = part.Close()
				return nil, err
			}
			if int64(len(data)) > maxEncryptedDerivativeBytes {
				_ = part.Close()
				return nil, fmt.Errorf("encrypted derivative exceeds %d bytes", maxEncryptedDerivativeBytes)
			}
			parsed.fileBytes = data
		}
		_ = part.Close()
	}
	return parsed, nil
}

func readMultipartField(part interface {
	io.Reader
	Close() error
}, maxBytes int64) string {
	data, err := io.ReadAll(io.LimitReader(part, maxBytes+1))
	if err != nil || int64(len(data)) > maxBytes {
		return ""
	}
	return string(data)
}

func encryptedDerivativeStorageKey(assetID uuid.UUID, variant string) string {
	if variant == "display_webp" {
		return fmt.Sprintf("derivatives/%s/%s.webp.enc", assetID.String(), variant)
	}
	return fmt.Sprintf("thumbnails/%s/%s.webp", assetID.String(), variant)
}

func withVariantManifest(base map[string]interface{}, variant string, manifest map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	for k, v := range base {
		out[k] = v
	}
	variants := map[string]interface{}{}
	if existing, ok := out["variants"].(map[string]interface{}); ok {
		for k, v := range existing {
			variants[k] = v
		}
	}
	variants[variant] = manifest
	out["variants"] = variants
	return out
}

func hasAllEncryptedWebPVariants(thumbnails map[string]string) bool {
	for _, variant := range []string{"thumb_sm_webp", "thumb_md_webp", "thumb_lg_webp", "display_webp"} {
		if thumbnails[variant] == "" {
			return false
		}
	}
	return true
}

func parsePositiveInt(raw string) int {
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 0
	}
	return n
}
