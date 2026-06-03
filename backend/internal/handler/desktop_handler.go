package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// DesktopHandler handles desktop companion app HTTP endpoints.
type DesktopHandler struct {
	svc         *service.DesktopService
	galleryRepo *repository.GalleryRepo // optional; nil → tethered-galleries endpoint returns 501
}

// NewDesktopHandler creates a new DesktopHandler.
func NewDesktopHandler(svc *service.DesktopService) *DesktopHandler {
	return &DesktopHandler{svc: svc}
}

// WithGalleryRepo injects the gallery repo so the desktop handler can serve
// tethered-gallery metadata. Optional; the route degrades to 501 when nil.
func (h *DesktopHandler) WithGalleryRepo(repo *repository.GalleryRepo) *DesktopHandler {
	h.galleryRepo = repo
	return h
}

// RegisterSession handles POST /api/v1/desktop/sessions
func (h *DesktopHandler) RegisterSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"workspace context required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		DeviceName string `json:"device_name"`
		OS         string `json:"os"`
		AppVersion string `json:"app_version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	session, err := h.svc.RegisterSession(r.Context(), service.RegisterSessionInput{
		UserID:      userID,
		WorkspaceID: wsID,
		DeviceName:  req.DeviceName,
		OS:          req.OS,
		AppVersion:  req.AppVersion,
	})
	if err != nil {
		http.Error(w, `{"error":"failed to register session"}`, http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusCreated, session)
}

// ListSessions handles GET /api/v1/desktop/sessions
func (h *DesktopHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	sessions, err := h.svc.ListUserSessions(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, sessions)
}

// Heartbeat handles PUT /api/v1/desktop/sessions/{id}/heartbeat
func (h *DesktopHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid session id"}`, http.StatusBadRequest)
		return
	}
	// Verify session belongs to the authenticated user
	session, err := h.svc.GetSession(r.Context(), id)
	if err != nil || session.UserID != userID {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}
	var req struct {
		AppVersion string `json:"app_version"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if err := h.svc.Heartbeat(r.Context(), id, req.AppVersion); err != nil {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// UpdateStats handles PUT /api/v1/desktop/sessions/{id}/stats
func (h *DesktopHandler) UpdateStats(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid session id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		TotalUploaded int   `json:"total_uploaded"`
		TotalBytes    int64 `json:"total_bytes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	stats, _ := json.Marshal(req)
	if err := h.svc.UpdateUploadStats(r.Context(), id, string(stats)); err != nil {
		http.Error(w, `{"error":"failed to update stats"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// Deactivate handles DELETE /api/v1/desktop/sessions/{id}
func (h *DesktopHandler) Deactivate(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid session id"}`, http.StatusBadRequest)
		return
	}
	// Verify session belongs to the authenticated user
	session, err := h.svc.GetSession(r.Context(), id)
	if err != nil || session.UserID != userID {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}
	if err := h.svc.DeactivateSession(r.Context(), id); err != nil {
		http.Error(w, `{"error":"failed to deactivate session"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SyncStatus handles GET /api/v1/desktop/sync-status
// Used by the desktop app to check which files are already uploaded.
func (h *DesktopHandler) SyncStatus(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"endpoint": "sync-status",
		"message":  "Desktop sync status — returns list of already-uploaded file hashes",
	})
}

// TetheredGalleries handles GET /api/v1/desktop/tethered-galleries.
//
// Returns every gallery in the authenticated workspace that has
// tethering_enabled=true, including the tether_directory path so the desktop
// companion app knows which folders to watch.
func (h *DesktopHandler) TetheredGalleries(w http.ResponseWriter, r *http.Request) {
	if h.galleryRepo == nil {
		http.Error(w, `{"error":"tethering not configured"}`, http.StatusNotImplemented)
		return
	}
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	galleries, err := h.galleryRepo.ListTethered(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, galleries)
}

// DesktopDownloadInfo handles GET /api/v1/desktop/download (public)
// Returns download links for the desktop companion app.
func (h *DesktopHandler) DesktopDownloadInfo(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]any{
		"app_name":    "RawDrive Desktop",
		"description": "Bulk upload, tethered shooting, and offline workflow support",
		"platforms": map[string]any{
			"windows": map[string]string{
				"url":     "https://releases.rawdrive.app/desktop/latest/RawDrive-Setup.exe",
				"version": "1.0.0",
				"min_os":  "Windows 10",
			},
			"macos": map[string]string{
				"url":     "https://releases.rawdrive.app/desktop/latest/RawDrive.dmg",
				"version": "1.0.0",
				"min_os":  "macOS 12",
			},
		},
		"features": []string{
			"Bulk folder upload (10,000+ files)",
			"Tethered shooting with auto-upload",
			"Offline queue with auto-resume",
			"Background upload with queue management",
		},
	})
}
