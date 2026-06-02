package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// TermsHandler serves the photographer Terms-of-Service / copyright acceptance
// API: the active version (for the modal), the accept action, and the per-user
// status. Mounted under the authenticated /api/v1 group — these endpoints must
// NOT sit behind the upload terms gate (a user has to be able to read and
// accept the terms before they are allowed to upload).
type TermsHandler struct {
	termsSvc *service.TermsService
}

// NewTermsHandler constructs a TermsHandler.
func NewTermsHandler(termsSvc *service.TermsService) *TermsHandler {
	return &TermsHandler{termsSvc: termsSvc}
}

// RegisterRoutes wires the legal/terms endpoints onto the authenticated router.
func (h *TermsHandler) RegisterRoutes(r chi.Router) {
	r.Get("/api/v1/legal/terms/current", h.GetCurrent)
	r.Get("/api/v1/legal/terms/status", h.GetStatus)
	r.Post("/api/v1/legal/terms/accept", h.Accept)
}

// GetCurrent returns the active terms version and the exact text the client must
// display. Serving the text from the same source that gets hashed guarantees the
// displayed text and the recorded version_hash refer to the identical document.
func (h *TermsHandler) GetCurrent(w http.ResponseWriter, r *http.Request) {
	if h.termsSvc == nil {
		http.Error(w, `{"error":"terms service unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	v, err := h.termsSvc.ActiveVersion(r.Context())
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			http.Error(w, `{"error":"no active terms version"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"failed to load terms"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"version":        v.Version,
		"effective_at":   v.EffectiveAt,
		"document_types": v.DocumentTypes,
		"text":           v.TermsText,
		"hash":           v.TextSHA256,
	})
}

// GetStatus returns the calling user's acceptance status relative to the active
// version. Used by the frontend to decide whether to prompt before an upload.
func (h *TermsHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	if h.termsSvc == nil {
		http.Error(w, `{"error":"terms service unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	status, err := h.termsSvc.StatusForUser(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"failed to load terms status"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, status)
}

// Accept records the calling user's acceptance of the active terms version.
// Captures the proxy-aware client IP and user-agent as IT Act §10A / DPDP
// evidence. Idempotent — re-accepting the active version is a no-op success.
func (h *TermsHandler) Accept(w http.ResponseWriter, r *http.Request) {
	if h.termsSvc == nil {
		http.Error(w, `{"error":"terms service unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Body is optional; when a version is supplied it must match the active one
	// so a client cannot record acceptance of a stale document it was shown
	// before a republish.
	var input struct {
		Version string `json:"version,omitempty"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&input)
	}

	active, err := h.termsSvc.ActiveVersion(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to load terms"}`, http.StatusInternalServerError)
		return
	}
	if input.Version != "" && input.Version != active.Version {
		respondJSON(w, http.StatusConflict, map[string]any{
			"error":           "TERMS_VERSION_STALE",
			"message":         "the terms have been updated; please review and accept the current version",
			"current_version": active.Version,
		})
		return
	}

	// "first_upload" is the surface for the modal-driven accept; the service
	// promotes it to "re_acceptance" when the user previously accepted an older
	// version. Registration/OAuth acceptance go through the service directly with
	// their own method and never hit this endpoint.
	version, err := h.termsSvc.AcceptTerms(r.Context(), userID, "first_upload", middleware.ClientIP(r), r.UserAgent())
	if err != nil {
		http.Error(w, `{"error":"failed to record acceptance"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]any{
		"accepted": true,
		"version":  version,
	})
}
