package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// DesignTemplateHandler handles design template CRUD endpoints.
type DesignTemplateHandler struct {
	svc *service.DesignTemplateService
}

// NewDesignTemplateHandler creates a new DesignTemplateHandler.
func NewDesignTemplateHandler(svc *service.DesignTemplateService) *DesignTemplateHandler {
	return &DesignTemplateHandler{svc: svc}
}

// CreateTemplate handles POST /api/v1/galleries/templates.
func (h *DesignTemplateHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsIDStr, _ := claims["workspace_id"].(string)
	wsID, _ := uuid.Parse(wsIDStr)
	userIDStr, _ := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)

	var req struct {
		Name        string                 `json:"name"`
		Description string                 `json:"description"`
		Config      map[string]interface{} `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	t, err := h.svc.CreateTemplate(r.Context(), wsID, req.Name, req.Description, req.Config, &userID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"data": t})
}

// ListTemplates handles GET /api/v1/galleries/templates.
func (h *DesignTemplateHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsIDStr, _ := claims["workspace_id"].(string)
	wsID, _ := uuid.Parse(wsIDStr)

	templates, err := h.svc.ListTemplates(r.Context(), wsID)
	if err != nil {
		http.Error(w, `{"error":"failed to list templates"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": templates})
}

// GetTemplate handles GET /api/v1/galleries/templates/{id}.
func (h *DesignTemplateHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid template ID"}`, http.StatusBadRequest)
		return
	}

	t, err := h.svc.GetTemplate(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"failed to get template"}`, http.StatusInternalServerError)
		return
	}
	if t == nil {
		http.Error(w, `{"error":"template not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": t})
}

// UpdateTemplate handles PUT /api/v1/galleries/templates/{id}.
func (h *DesignTemplateHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid template ID"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Name        string                 `json:"name"`
		Description string                 `json:"description"`
		Config      map[string]interface{} `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := h.svc.UpdateTemplate(r.Context(), id, req.Name, req.Description, req.Config); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "updated"})
}

// DeleteTemplate handles DELETE /api/v1/galleries/templates/{id}.
func (h *DesignTemplateHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid template ID"}`, http.StatusBadRequest)
		return
	}

	if err := h.svc.DeleteTemplate(r.Context(), id); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "deleted"})
}

// RestoreTemplate handles POST /api/v1/galleries/templates/{id}/restore.
func (h *DesignTemplateHandler) RestoreTemplate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid template ID"}`, http.StatusBadRequest)
		return
	}

	if err := h.svc.RestoreTemplate(r.Context(), id); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "restored"})
}

// ApplyTemplate handles POST /api/v1/galleries/{id}/apply-template.
func (h *DesignTemplateHandler) ApplyTemplate(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery ID"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		TemplateID string `json:"template_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	templateID, err := uuid.Parse(req.TemplateID)
	if err != nil {
		http.Error(w, `{"error":"invalid template_id"}`, http.StatusBadRequest)
		return
	}

	if err := h.svc.ApplyTemplate(r.Context(), galleryID, templateID); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "applied"})
}
