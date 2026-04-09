package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// WebhookHandler handles webhook HTTP requests.
type WebhookHandler struct {
	webhookSvc *service.WebhookService
}

// NewWebhookHandler creates a new WebhookHandler.
func NewWebhookHandler(svc *service.WebhookService) *WebhookHandler {
	return &WebhookHandler{webhookSvc: svc}
}

// Create handles POST /workspaces/{workspaceId}/webhooks
func (h *WebhookHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID, err := uuid.Parse(chi.URLParam(r, "workspaceId"))
	if err != nil {
		http.Error(w, `{"error":"invalid workspace id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		URL    string   `json:"url"`
		Secret string   `json:"secret"`
		Events []string `json:"events"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	webhook, err := h.webhookSvc.CreateWebhook(r.Context(), service.CreateWebhookInput{
		WorkspaceID: wsID,
		URL:         input.URL,
		Secret:      input.Secret,
		Events:      input.Events,
	})
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	respondJSON(w, http.StatusCreated, webhook)
}

// List handles GET /workspaces/{workspaceId}/webhooks
func (h *WebhookHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID, err := uuid.Parse(chi.URLParam(r, "workspaceId"))
	if err != nil {
		http.Error(w, `{"error":"invalid workspace id"}`, http.StatusBadRequest)
		return
	}

	webhooks, err := h.webhookSvc.ListWebhooks(r.Context(), wsID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, webhooks)
}

// Delete handles DELETE /workspaces/{workspaceId}/webhooks/{id}
func (h *WebhookHandler) Delete(w http.ResponseWriter, r *http.Request) {
	webhookID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid webhook id"}`, http.StatusBadRequest)
		return
	}

	if err := h.webhookSvc.DeleteWebhook(r.Context(), webhookID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetDeliveries handles GET /workspaces/{workspaceId}/webhooks/{id}/deliveries
func (h *WebhookHandler) GetDeliveries(w http.ResponseWriter, r *http.Request) {
	webhookID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid webhook id"}`, http.StatusBadRequest)
		return
	}

	deliveries, err := h.webhookSvc.GetDeliveries(r.Context(), webhookID, 50)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, deliveries)
}
