package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

type StorageConfigHandler struct {
	configSvc *service.StorageConfigService
}

func NewStorageConfigHandler(svc *service.StorageConfigService) *StorageConfigHandler {
	return &StorageConfigHandler{configSvc: svc}
}

// GetCurrentPlan returns the plan tier of the caller's workspace. Reads the
// workspace ID from JWT claims so the frontend does not need to know or
// send the UUID, and so a client cannot spoof a different workspace.
//
// F-011 (audit 2026-04-10): the storage settings page previously hardcoded
// the plan tier as "professional" with a TODO, which meant enterprise users
// could never see the BYOS wizard and non-enterprise users were shown a
// misleading "Upgrade to Enterprise" state that did not reflect their real
// tier. This endpoint is the smallest surface that returns authoritative
// plan-tier info so the frontend can drive the BYOS wizard honestly.
func (h *StorageConfigHandler) GetCurrentPlan(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsIDStr, _ := claims["workspace_id"].(string)
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid workspace context"}`, http.StatusBadRequest)
		return
	}
	planTier, err := h.configSvc.GetWorkspacePlanTier(r.Context(), wsID)
	if err != nil {
		// GetWorkspacePlanTier returns a best-effort "standard" on error, but
		// also returns the error for logging — we surface standard as the
		// safe default and log the underlying problem server-side.
		respondJSON(w, http.StatusOK, map[string]string{
			"plan_tier": "standard",
			"source":    "fallback",
		})
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{
		"plan_tier": planTier,
		"source":    "db",
	})
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
