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

type AdminModerationHandler struct {
	svc *service.AdminModerationService
}

func NewAdminModerationHandler(svc *service.AdminModerationService) *AdminModerationHandler {
	return &AdminModerationHandler{svc: svc}
}

func (h *AdminModerationHandler) ListQueue(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repository.ModerationFilter{
		ContentType: q.Get("type"),
		Reason:      q.Get("reason"),
		Status:      q.Get("status"),
	}
	result, err := h.svc.GetQueue(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminModerationHandler) Approve(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.ApproveContent(r.Context(), id, actorID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "approved"})
}

func (h *AdminModerationHandler) Reject(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Reason == "" {
		http.Error(w, `{"error":"reason is required"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.RejectContent(r.Context(), id, body.Reason, actorID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

func (h *AdminModerationHandler) Escalate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.EscalateContent(r.Context(), id, actorID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "escalated"})
}
