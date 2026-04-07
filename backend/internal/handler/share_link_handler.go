package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	createInput := service.CreateShareLinkInput{
		GalleryID:       galleryID,
		PIN:             input.PIN,
		DownloadAllowed: input.DownloadAllowed,
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
