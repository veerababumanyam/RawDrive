package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// GalleryHandler handles gallery HTTP requests.
type GalleryHandler struct {
	gallerySvc *service.GalleryService

	// M21: optional AI face scan dependencies (nil-safe — handlers degrade
	// gracefully so existing callers that construct GalleryHandler without
	// these continue to compile).
	faceSvc  *ai.FaceService
	assetSvc *service.AssetService
	jobRepo  *ai.JobRepo
}

// NewGalleryHandler creates a new GalleryHandler.
func NewGalleryHandler(svc *service.GalleryService) *GalleryHandler {
	return &GalleryHandler{gallerySvc: svc}
}

// WithAIDeps injects face scan dependencies for the M21 gallery-scoped
// face detection endpoints. Call after construction when wiring routes_m2.
// Returns the receiver so callers can chain.
func (h *GalleryHandler) WithAIDeps(faceSvc *ai.FaceService, assetSvc *service.AssetService, jobRepo *ai.JobRepo) *GalleryHandler {
	h.faceSvc = faceSvc
	h.assetSvc = assetSvc
	h.jobRepo = jobRepo
	return h
}

// Create handles POST /api/v1/galleries
func (h *GalleryHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := getUserID(r)

	var input struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		GalleryType string `json:"gallery_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if input.Title == "" {
		http.Error(w, `{"error":"title required"}`, http.StatusBadRequest)
		return
	}
	if input.GalleryType == "" {
		input.GalleryType = "proofing"
	}

	gallery, err := h.gallerySvc.Create(r.Context(), service.CreateGalleryInput{
		WorkspaceID: workspaceID,
		Title:       input.Title,
		Description: input.Description,
		GalleryType: input.GalleryType,
		CreatedBy:   userID,
	})
	if err != nil {
		http.Error(w, `{"error":"create failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, gallery)
}

// List handles GET /api/v1/galleries
func (h *GalleryHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	galleries, err := h.gallerySvc.List(r.Context(), repository.GalleryFilter{
		WorkspaceID: workspaceID,
		Status:      r.URL.Query().Get("status"),
		GalleryType: r.URL.Query().Get("type"),
		Search:      r.URL.Query().Get("search"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, galleries)
}

// GetByID handles GET /api/v1/galleries/{id}
func (h *GalleryHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if gallery == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	respondJSON(w, http.StatusOK, gallery)
}

// Update handles PUT /api/v1/galleries/{id}
func (h *GalleryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetByID(r.Context(), id)
	if err != nil || gallery == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	var input struct {
		Title       *string `json:"title,omitempty"`
		Description *string `json:"description,omitempty"`
		Status      *string `json:"status,omitempty"`
		IsPublished *bool   `json:"is_published,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if input.Title != nil {
		gallery.Title = *input.Title
	}
	if input.Description != nil {
		gallery.Description = *input.Description
	}
	if input.Status != nil {
		gallery.Status = *input.Status
	}
	if input.IsPublished != nil {
		gallery.IsPublished = *input.IsPublished
	}

	if err := h.gallerySvc.Update(r.Context(), gallery); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, gallery)
}

// SetFaceDetection handles PATCH /api/v1/galleries/{id}/face-detection
// Body: {"enabled": true|false}
// Toggles the privacy opt-out flag that controls whether the face detection
// ML pipeline runs on assets in this gallery (M3 E8-S1 #6).
func (h *GalleryHandler) SetFaceDetection(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	var input struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if input.Enabled == nil {
		http.Error(w, `{"error":"enabled field required"}`, http.StatusBadRequest)
		return
	}
	if err := h.gallerySvc.SetFaceDetectionEnabled(r.Context(), id, *input.Enabled); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"gallery_id":              id,
		"face_detection_enabled":  *input.Enabled,
	})
}

// SoftDelete handles DELETE /api/v1/galleries/{id}
func (h *GalleryHandler) SoftDelete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	if err := h.gallerySvc.SoftDelete(r.Context(), id); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// AddAsset handles POST /api/v1/galleries/{id}/assets
func (h *GalleryHandler) AddAsset(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		AssetID   string `json:"asset_id"`
		SortOrder int    `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	assetID, err := uuid.Parse(input.AssetID)
	if err != nil {
		http.Error(w, `{"error":"invalid asset_id"}`, http.StatusBadRequest)
		return
	}

	if err := h.gallerySvc.AddAsset(r.Context(), galleryID, assetID, input.SortOrder); err != nil {
		http.Error(w, `{"error":"add asset failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// DuplicateGallery handles POST /api/v1/galleries/{id}/duplicate
func (h *GalleryHandler) DuplicateGallery(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsIDStr, _ := claims["workspace_id"].(string)
	userIDStr, _ := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)
	wsID, _ := uuid.Parse(wsIDStr)

	// Verify source gallery belongs to this workspace
	src, err := h.gallerySvc.GetByID(r.Context(), galleryID)
	if err != nil || src == nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if src.WorkspaceID != wsID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var input struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Title == "" {
		input.Title = src.Title + " (Copy)"
	}

	dup, err := h.gallerySvc.DuplicateGallery(r.Context(), galleryID, input.Title, userID)
	if err != nil {
		http.Error(w, `{"error":"duplicate failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(dup)
}

// ReorderAssets handles PATCH /api/v1/galleries/{id}/assets/reorder
func (h *GalleryHandler) ReorderAssets(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Order []struct {
			AssetID   string `json:"asset_id"`
			SortOrder int    `json:"sort_order"`
		} `json:"order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if len(input.Order) == 0 {
		http.Error(w, `{"error":"order array is required"}`, http.StatusBadRequest)
		return
	}

	items := make([]repository.ReorderItem, 0, len(input.Order))
	for _, item := range input.Order {
		assetID, err := uuid.Parse(item.AssetID)
		if err != nil {
			continue
		}
		items = append(items, repository.ReorderItem{AssetID: assetID, SortOrder: item.SortOrder})
	}

	if err := h.gallerySvc.ReorderAssets(r.Context(), galleryID, items); err != nil {
		http.Error(w, `{"error":"reorder failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// RemoveAsset handles DELETE /api/v1/galleries/{id}/assets/{assetId}
func (h *GalleryHandler) RemoveAsset(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	assetID, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	if err := h.gallerySvc.RemoveAsset(r.Context(), galleryID, assetID); err != nil {
		http.Error(w, `{"error":"remove asset failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Timeline handles GET /api/v1/galleries/{id}/assets/timeline
func (h *GalleryHandler) Timeline(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	groups, err := h.gallerySvc.GetTimeline(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"timeline failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, groups)
}

// ListAssets handles GET /api/v1/galleries/{id}/assets
func (h *GalleryHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	assets, err := h.gallerySvc.ListAssets(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, assets)
}

// ──────────────────────────────────────────────────────────────────────────────
// M21: Gallery Face Scan Trigger
// ──────────────────────────────────────────────────────────────────────────────

// TriggerFaceScan handles POST /api/v1/galleries/{id}/ai/scan-faces.
// Enqueues a face detection job for all assets in the gallery.
func (h *GalleryHandler) TriggerFaceScan(w http.ResponseWriter, r *http.Request) {
	if h.faceSvc == nil || h.assetSvc == nil {
		http.Error(w, `{"error":"face scan service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
		return
	}

	wsStr, _ := claims["workspace_id"].(string)
	workspaceID, err := uuid.Parse(wsStr)
	if err != nil {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	// Get all asset IDs for this gallery
	galleryAssets, err := h.gallerySvc.ListAssets(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"failed to list gallery assets"}`, http.StatusInternalServerError)
		return
	}
	if len(galleryAssets) == 0 {
		http.Error(w, `{"error":"gallery has no assets"}`, http.StatusBadRequest)
		return
	}

	assetIDs := make([]uuid.UUID, len(galleryAssets))
	for i, ga := range galleryAssets {
		assetIDs[i] = ga.AssetID
	}

	gid := galleryID // copy for pointer
	job, err := h.faceSvc.EnqueueDetection(r.Context(), workspaceID, assetIDs, &gid)
	if err != nil {
		http.Error(w, `{"error":"failed to enqueue face scan"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusAccepted, map[string]interface{}{
		"job_id":      job.ID,
		"status":      job.Status,
		"total_items": job.TotalItems,
	})
}

// GetFaceScanStatus handles GET /api/v1/galleries/{id}/ai/scan-status.
// Returns the latest face detection job status for this gallery.
func (h *GalleryHandler) GetFaceScanStatus(w http.ResponseWriter, r *http.Request) {
	if h.jobRepo == nil {
		http.Error(w, `{"error":"face scan service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
		return
	}

	job, err := h.jobRepo.GetLatestByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"failed to get scan status"}`, http.StatusInternalServerError)
		return
	}
	if job == nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "none",
			"message": "no face scan has been run for this gallery",
		})
		return
	}

	// Extract faces_found from result if available
	facesFound := 0
	if ff, ok := job.Result["faces_found"]; ok {
		if v, ok := ff.(float64); ok {
			facesFound = int(v)
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"job_id":          job.ID,
		"status":          job.Status,
		"processed_items": job.ProcessedItems,
		"total_items":     job.TotalItems,
		"faces_found":     facesFound,
		"created_at":      job.CreatedAt,
		"updated_at":      job.UpdatedAt,
	})
}
