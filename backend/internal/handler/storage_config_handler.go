package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

type StorageConfigHandler struct {
	configSvc *service.StorageConfigService
}

func NewStorageConfigHandler(svc *service.StorageConfigService) *StorageConfigHandler {
	return &StorageConfigHandler{configSvc: svc}
}

func (h *StorageConfigHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	wsIDStr := chi.URLParam(r, "workspaceId")
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid workspace_id"}`, http.StatusBadRequest)
		return
	}
	planTier, err := h.configSvc.GetWorkspacePlanTier(r.Context(), wsID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to check plan tier"})
		return
	}
	if planTier != "enterprise" {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "BYOS (Bring Your Own Storage) is restricted to enterprise plan", "current_plan": planTier, "required_plan": "enterprise"})
		return
	}
	var input struct {
		Driver    string `json:"driver"`
		LocalDir  string `json:"local_dir"`
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
	if input.Driver == "local" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "local storage driver is not allowed"})
		return
	}
	cfg := storage.Config{Driver: input.Driver, LocalDir: input.LocalDir, Bucket: input.Bucket, Region: input.Region, Endpoint: input.Endpoint, AccessKey: input.AccessKey, SecretKey: input.SecretKey}
	if err := h.configSvc.TestConnection(r.Context(), cfg); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"status": "failed", "error": err.Error()})
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
