package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// DesignAIHandler handles AI design recommendation endpoints.
type DesignAIHandler struct {
	svc *service.DesignAIService
}

// NewDesignAIHandler creates a new DesignAIHandler.
func NewDesignAIHandler(svc *service.DesignAIService) *DesignAIHandler {
	return &DesignAIHandler{svc: svc}
}

// Suggest handles GET /api/v1/galleries/{id}/ai-suggest.
func (h *DesignAIHandler) Suggest(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery ID"}`, http.StatusBadRequest)
		return
	}

	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsIDStr, _ := claims["workspace_id"].(string)
	wsID, _ := uuid.Parse(wsIDStr)

	suggestions, err := h.svc.Suggest(r.Context(), wsID, galleryID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": suggestions})
}
