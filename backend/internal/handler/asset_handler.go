package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// AssetHandler handles asset HTTP requests.
type AssetHandler struct {
	assetSvc  *service.AssetService
	uploadSvc *service.UploadService
}

// NewAssetHandler creates a new AssetHandler.
func NewAssetHandler(assetSvc *service.AssetService, uploadSvc *service.UploadService) *AssetHandler {
	return &AssetHandler{assetSvc: assetSvc, uploadSvc: uploadSvc}
}

// List handles GET /api/v1/assets
func (h *AssetHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	assets, err := h.assetSvc.List(r.Context(), repository.AssetFilter{
		WorkspaceID: workspaceID,
		Status:      r.URL.Query().Get("status"),
		ContentType: r.URL.Query().Get("content_type"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, assets)
}

// GetByID handles GET /api/v1/assets/{id}
func (h *AssetHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	asset, err := h.assetSvc.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if asset == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	respondJSON(w, http.StatusOK, asset)
}

// Upload handles POST /api/v1/assets
func (h *AssetHandler) Upload(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"missing user_id"}`, http.StatusUnauthorized)
		return
	}

	if err := r.ParseMultipartForm(500 << 20); err != nil { // 500MB max
		http.Error(w, `{"error":"invalid multipart form"}`, http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"file required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	result, err := h.uploadSvc.Upload(r.Context(), service.UploadInput{
		WorkspaceID: workspaceID,
		Filename:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		SizeBytes:   header.Size,
		UploadedBy:  userID,
		Body:        file,
	})
	if err != nil {
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, result)
}

// SoftDelete handles DELETE /api/v1/assets/{id}
func (h *AssetHandler) SoftDelete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	if err := h.assetSvc.SoftDelete(r.Context(), id); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// helpers

func getWorkspaceID(r *http.Request) (uuid.UUID, bool) {
	// Try typed context key first (from TenantContext middleware)
	wsStr := middleware.WorkspaceIDFromContext(r.Context())
	if wsStr == "" || wsStr == "pending-onboarding" {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(wsStr)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

func getUserID(r *http.Request) (uuid.UUID, bool) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		return uuid.Nil, false
	}
	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(sub)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
