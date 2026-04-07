package handler

import (
	"encoding/json"
	"net/http"

	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

// StorageConfigHandler handles storage configuration HTTP requests.
type StorageConfigHandler struct {
	configSvc *service.StorageConfigService
}

func NewStorageConfigHandler(svc *service.StorageConfigService) *StorageConfigHandler {
	return &StorageConfigHandler{configSvc: svc}
}

// TestConnection handles POST /api/v1/workspaces/{workspaceId}/storage-config/test
func (h *StorageConfigHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Driver    string `json:"driver"`
		Bucket    string `json:"bucket"`
		Region    string `json:"region"`
		Endpoint  string `json:"endpoint"`
		AccessKey string `json:"access_key"`
		SecretKey string `json:"secret_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	cfg := storage.Config{
		Driver:    input.Driver,
		Bucket:    input.Bucket,
		Region:    input.Region,
		Endpoint:  input.Endpoint,
		AccessKey: input.AccessKey,
		SecretKey: input.SecretKey,
	}

	if err := h.configSvc.TestConnection(r.Context(), cfg); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"status": "failed",
			"error":  err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
