package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// DesignCollabHandler handles collaborative editing endpoints.
type DesignCollabHandler struct {
	svc *service.DesignCollabService
}

// NewDesignCollabHandler creates a new DesignCollabHandler.
func NewDesignCollabHandler(svc *service.DesignCollabService) *DesignCollabHandler {
	return &DesignCollabHandler{svc: svc}
}

// JoinSession handles POST /api/v1/galleries/{id}/collab/join.
func (h *DesignCollabHandler) JoinSession(w http.ResponseWriter, r *http.Request) {
	galleryID := chi.URLParam(r, "id")
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID, _ := claims["user_id"].(string)
	userName, _ := claims["full_name"].(string)
	avatarURL, _ := claims["avatar_url"].(string)

	if err := h.svc.JoinSession(r.Context(), galleryID, userID, userName, avatarURL); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "joined",
		"viewers":  h.svc.GetViewerCount(galleryID),
		"presence": h.svc.GetPresence(galleryID),
		"locks":    h.svc.GetLocks(galleryID),
	})
}

// LeaveSession handles POST /api/v1/galleries/{id}/collab/leave.
func (h *DesignCollabHandler) LeaveSession(w http.ResponseWriter, r *http.Request) {
	galleryID := chi.URLParam(r, "id")
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID, _ := claims["user_id"].(string)
	h.svc.LeaveSession(r.Context(), galleryID, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "left"})
}

// AcquireLock handles POST /api/v1/galleries/{id}/collab/lock.
func (h *DesignCollabHandler) AcquireLock(w http.ResponseWriter, r *http.Request) {
	galleryID := chi.URLParam(r, "id")
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID, _ := claims["user_id"].(string)
	userName, _ := claims["full_name"].(string)

	var req struct {
		SectionID string `json:"section_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	lock, err := h.svc.AcquireLock(r.Context(), galleryID, req.SectionID, userID, userName)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": lock})
}

// ReleaseLock handles DELETE /api/v1/galleries/{id}/collab/lock/{sectionId}.
func (h *DesignCollabHandler) ReleaseLock(w http.ResponseWriter, r *http.Request) {
	galleryID := chi.URLParam(r, "id")
	sectionID := chi.URLParam(r, "sectionId")
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID, _ := claims["user_id"].(string)
	h.svc.ReleaseLock(r.Context(), galleryID, sectionID, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "released"})
}

// SSEStream handles GET /api/v1/galleries/{id}/collab/stream — Server-Sent Events.
func (h *DesignCollabHandler) SSEStream(w http.ResponseWriter, r *http.Request) {
	galleryID := chi.URLParam(r, "id")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"error":"streaming not supported"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Subscribe to NATS updates
	updateCh, unsub, err := h.svc.SubscribeUpdates(galleryID)
	if err != nil {
		http.Error(w, `{"error":"failed to subscribe"}`, http.StatusInternalServerError)
		return
	}
	defer unsub()

	// Send initial state
	initial := map[string]interface{}{
		"type":     "init",
		"viewers":  h.svc.GetViewerCount(galleryID),
		"presence": h.svc.GetPresence(galleryID),
		"locks":    h.svc.GetLocks(galleryID),
	}
	data, _ := json.Marshal(initial)
	fmt.Fprintf(w, "data: %s\n\n", data)
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case update, ok := <-updateCh:
			if !ok {
				return
			}
			eventData, _ := json.Marshal(map[string]interface{}{
				"type":   "update",
				"update": update,
			})
			fmt.Fprintf(w, "data: %s\n\n", eventData)
			flusher.Flush()
		}
	}
}
