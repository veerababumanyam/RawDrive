package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// DownloadHandler handles download HTTP requests.
type DownloadHandler struct {
	downloadSvc *service.DownloadService
}

// NewDownloadHandler creates a new DownloadHandler.
func NewDownloadHandler(svc *service.DownloadService) *DownloadHandler {
	return &DownloadHandler{downloadSvc: svc}
}

// CreateJob handles POST /galleries/{id}/downloads
func (h *DownloadHandler) CreateJob(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		AssetIDs []string `json:"asset_ids"`
		Variant  string   `json:"variant"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	assetIDs := make([]uuid.UUID, 0, len(input.AssetIDs))
	for _, id := range input.AssetIDs {
		uid, err := uuid.Parse(id)
		if err != nil {
			continue
		}
		assetIDs = append(assetIDs, uid)
	}

	job := &repository.DownloadJob{
		GalleryID:   galleryID,
		WorkspaceID: galleryID, // simplified — would come from gallery lookup
		AssetIDs:    assetIDs,
		Variant:     input.Variant,
		TotalAssets: len(assetIDs),
	}

	if err := h.downloadSvc.CreateDownloadJob(r.Context(), job); err != nil {
		http.Error(w, `{"error":"failed to create download job"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, job)
}

// GetJob handles GET /galleries/{id}/downloads/{jobId}
func (h *DownloadHandler) GetJob(w http.ResponseWriter, r *http.Request) {
	jobID, err := uuid.Parse(chi.URLParam(r, "jobId"))
	if err != nil {
		http.Error(w, `{"error":"invalid job id"}`, http.StatusBadRequest)
		return
	}

	job, err := h.downloadSvc.GetDownloadJob(r.Context(), jobID)
	if err != nil {
		http.Error(w, `{"error":"job not found"}`, http.StatusNotFound)
		return
	}

	respondJSON(w, http.StatusOK, job)
}

// ListJobs handles GET /galleries/{id}/downloads
func (h *DownloadHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	jobs, err := h.downloadSvc.ListDownloadJobs(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, jobs)
}

// GetAudit handles GET /galleries/{id}/download-audit
func (h *DownloadHandler) GetAudit(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	events, err := h.downloadSvc.GetDownloadAudit(r.Context(), galleryID, limit)
	if err != nil {
		http.Error(w, `{"error":"audit failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, events)
}

// DownloadZIP handles GET /galleries/{id}/download-zip — streams a ZIP file
func (h *DownloadHandler) DownloadZIP(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=gallery.zip")

	if err := h.downloadSvc.WriteZIP(r.Context(), galleryID, w); err != nil {
		// Can't send error after headers written
		return
	}
}
