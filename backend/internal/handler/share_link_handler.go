package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ShareLinkHandler handles share link HTTP requests.
type ShareLinkHandler struct {
	shareSvc *service.ShareLinkService
}

func NewShareLinkHandler(svc *service.ShareLinkService) *ShareLinkHandler {
	return &ShareLinkHandler{shareSvc: svc}
}

func (h *ShareLinkHandler) Create(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		PIN             string `json:"pin"`
		ExpiryDays      *int   `json:"expiry_days"`
		DownloadAllowed bool   `json:"download_allowed"`
		MaxAccessCount  *int   `json:"max_access_count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	createInput := service.CreateShareLinkInput{
		GalleryID:       galleryID,
		PIN:             input.PIN,
		DownloadAllowed: input.DownloadAllowed,
		MaxAccessCount:  input.MaxAccessCount,
		Permissions:     map[string]interface{}{},
	}
	if input.ExpiryDays != nil && *input.ExpiryDays > 0 {
		d := time.Duration(*input.ExpiryDays) * 24 * time.Hour
		createInput.ExpiresIn = &d
	}

	link, err := h.shareSvc.Create(r.Context(), createInput)
	if err != nil {
		http.Error(w, `{"error":"create failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, link)
}

func (h *ShareLinkHandler) ListByGallery(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	links, err := h.shareSvc.ListByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, links)
}

// Verify validates a share link token and optional credential, then atomically
// increments access_count. Returns 403 with "access_limit_exceeded" when the
// link has reached its max_access_count cap (GAL-FR-112).
func (h *ShareLinkHandler) Verify(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		http.Error(w, `{"error":"missing token"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Credential string `json:"credential"`
	}
	_ = json.NewDecoder(r.Body).Decode(&input) // credential optional

	ok, err := h.shareSvc.ValidateAccess(r.Context(), token, input.Credential)
	if err != nil {
		if err.Error() == "share link access limit reached" {
			http.Error(w, `{"error":"access_limit_exceeded"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusUnauthorized)
		return
	}
	if !ok {
		http.Error(w, `{"error":"invalid_credential"}`, http.StatusUnauthorized)
		return
	}

	// Atomically commit the access (enforces max_access_count under concurrent load).
	if _, err := h.shareSvc.TrackAccess(r.Context(), token); err != nil {
		if errors.Is(err, repository.ErrAccessLimitExceeded) {
			http.Error(w, `{"error":"access_limit_exceeded"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"track failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (h *ShareLinkHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	linkID, err := uuid.Parse(chi.URLParam(r, "linkId"))
	if err != nil {
		http.Error(w, `{"error":"invalid link id"}`, http.StatusBadRequest)
		return
	}

	if err := h.shareSvc.Revoke(r.Context(), linkID); err != nil {
		http.Error(w, `{"error":"revoke failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
