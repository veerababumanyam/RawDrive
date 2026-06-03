package handler

import (
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// DownloadHandler handles download HTTP requests.
type DownloadHandler struct {
	downloadSvc *service.DownloadService
	// galleryResolver enforces tenant ownership on gallery-scoped routes via
	// guardGalleryWorkspace. Nil-safe: when unwired the guard fails closed.
	galleryResolver *service.GalleryService
}

// NewDownloadHandler creates a new DownloadHandler.
func NewDownloadHandler(svc *service.DownloadService) *DownloadHandler {
	return &DownloadHandler{downloadSvc: svc}
}

// WithGalleryResolver injects the gallery resolver used by guardGalleryWorkspace
// to enforce tenant ownership before serving gallery-scoped routes. Chainable;
// tolerates a nil resolver (the guard fails closed when the resolver is nil).
func (h *DownloadHandler) WithGalleryResolver(gs *service.GalleryService) *DownloadHandler {
	h.galleryResolver = gs
	return h
}

// CreateJob handles POST /galleries/{id}/downloads
func (h *DownloadHandler) CreateJob(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	_, wsID, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID)
	if !ok {
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
		WorkspaceID: wsID,
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

	// tenant-ownership guard (integration audit 2026-05-31): the route is
	// addressed by jobId alone, so scope the lookup by the caller's workspace.
	// A cross-tenant job_id resolves to not-found (404), never another
	// tenant's job.
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace"}`, http.StatusBadRequest)
		return
	}

	job, err := h.downloadSvc.GetDownloadJobInWorkspace(r.Context(), jobID, wsID)
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

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
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

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
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

// GetAuditCSV handles GET /galleries/{id}/download-audit.csv — M14 GAL-FR-161
// Streams the download event log as a CSV attachment so studios can
// reconcile deliveries with client-reported receipts.
func (h *DownloadHandler) GetAuditCSV(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	events, err := h.downloadSvc.GetDownloadAudit(r.Context(), galleryID, 5000)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "audit_failed", err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=download-audit.csv")
	cw := csv.NewWriter(w)
	defer cw.Flush()

	_ = cw.Write([]string{
		"event_id", "created_at", "asset_id", "download_job_id",
		"downloader_email", "downloader_name", "downloader_ip", "variant", "file_size_bytes",
	})
	for _, e := range events {
		assetID := ""
		if e.AssetID != nil {
			assetID = e.AssetID.String()
		}
		jobID := ""
		if e.DownloadJobID != nil {
			jobID = e.DownloadJobID.String()
		}
		_ = cw.Write([]string{
			e.ID.String(),
			e.CreatedAt.UTC().Format(time.RFC3339),
			assetID,
			jobID,
			e.DownloaderEmail,
			e.DownloaderName,
			e.DownloaderIP,
			e.Variant,
			strconv.FormatInt(e.FileSizeBytes, 10),
		})
	}
}

// DownloadZIP handles GET /galleries/{id}/download-zip — streams a ZIP file
func (h *DownloadHandler) DownloadZIP(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=gallery.zip")

	if err := h.downloadSvc.WriteZIP(r.Context(), galleryID, w); err != nil {
		// Can't send error after headers written
		return
	}
}
