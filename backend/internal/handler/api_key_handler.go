package handler

// api_key_handler.go — HTTP surface for the developer-platform API key
// management UI (M9 E25-S1).
//
// Endpoints (mounted under the JWT-protected /api/v1 group, NOT the
// API-key-protected dataplane — keys are managed via the regular dashboard):
//
//	POST   /api/v1/api-keys           — create a key (returns cleartext ONCE)
//	GET    /api/v1/api-keys           — list keys for the workspace
//	DELETE /api/v1/api-keys/{id}      — revoke a key

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// APIKeyHandler handles API key management.
type APIKeyHandler struct {
	svc *service.APIKeyService
}

// NewAPIKeyHandler constructs the handler.
func NewAPIKeyHandler(svc *service.APIKeyService) *APIKeyHandler {
	return &APIKeyHandler{svc: svc}
}

// Create handles POST /api/v1/api-keys.
// Body: {"name": "...", "scopes": [...], "rate_limit": 1000, "expires_at": "..."}
// Response (200): {"id":"...", "cleartext":"rd_...", "prefix":"...", ...}
// CRITICAL: cleartext is shown ONCE — frontend MUST display + warn user.
func (h *APIKeyHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsIDStr := middleware.WorkspaceIDFromContext(r.Context())
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		http.Error(w, `{"error":"workspace required"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		Name      string     `json:"name"`
		Scopes    []string   `json:"scopes"`
		RateLimit int        `json:"rate_limit"`
		ExpiresAt *time.Time `json:"expires_at,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	created, err := h.svc.CreateKey(r.Context(), service.CreateAPIKeyInput{
		WorkspaceID: wsID,
		Name:        body.Name,
		Scopes:      body.Scopes,
		RateLimit:   body.RateLimit,
		ExpiresAt:   body.ExpiresAt,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrAPIKeyInvalidName):
			http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
		case errors.Is(err, service.ErrAPIKeyInvalidScope):
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		default:
			log.Printf("api key create: %v", err)
			http.Error(w, `{"error":"failed to create api key"}`, http.StatusInternalServerError)
		}
		return
	}
	respondJSON(w, http.StatusCreated, created)
}

// List handles GET /api/v1/api-keys.
func (h *APIKeyHandler) List(w http.ResponseWriter, r *http.Request) {
	wsIDStr := middleware.WorkspaceIDFromContext(r.Context())
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		http.Error(w, `{"error":"workspace required"}`, http.StatusBadRequest)
		return
	}
	keys, err := h.svc.ListKeys(r.Context(), wsID)
	if err != nil {
		log.Printf("api key list: %v", err)
		http.Error(w, `{"error":"failed to list api keys"}`, http.StatusInternalServerError)
		return
	}
	if keys == nil {
		keys = nil // explicit empty array via JSON nil → []
	}
	respondJSON(w, http.StatusOK, keys)
}

// Revoke handles DELETE /api/v1/api-keys/{id}.
func (h *APIKeyHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	wsIDStr := middleware.WorkspaceIDFromContext(r.Context())
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		http.Error(w, `{"error":"workspace required"}`, http.StatusBadRequest)
		return
	}
	keyID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid key id"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.RevokeKey(r.Context(), keyID, wsID); err != nil {
		log.Printf("api key revoke %s: %v", keyID, err)
		http.Error(w, `{"error":"failed to revoke api key"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
