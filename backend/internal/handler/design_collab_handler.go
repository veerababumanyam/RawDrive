package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// CollabProfileLookup resolves a user's display name and avatar for presence
// and lock attribution. Display fields are NOT JWT claims (the access token
// only carries sub/workspace_id/role/platform_role/state_id/mfa_verified), so
// they must come from a profile lookup. Implemented by the user/auth adapter
// (auth.UserService.GetProfileByID). Optional: when nil, presence falls back
// to empty display fields rather than the previous always-empty
// claims["full_name"]/claims["avatar_url"] reads.
type CollabProfileLookup interface {
	// DisplayProfile returns (displayName, avatarURL) for the given user id.
	// Implementations must not error the request path on lookup failure —
	// return empty strings so collaboration degrades to a blank identity
	// instead of failing the join/lock.
	DisplayProfile(ctx context.Context, userID string) (displayName, avatarURL string)
}

// DesignCollabHandler handles collaborative editing endpoints.
type DesignCollabHandler struct {
	svc        *service.DesignCollabService
	profiles   CollabProfileLookup
	gallerySvc *service.GalleryService
}

// NewDesignCollabHandler creates a new DesignCollabHandler. Display-name/avatar
// enrichment is opt-in via WithProfileLookup so the existing single-argument
// wiring keeps compiling; without it, presence shows the user id with empty
// display fields.
func NewDesignCollabHandler(svc *service.DesignCollabService) *DesignCollabHandler {
	return &DesignCollabHandler{svc: svc}
}

// WithProfileLookup attaches a profile resolver so presence and lock
// attribution carry real display names/avatars instead of empty strings.
func (h *DesignCollabHandler) WithProfileLookup(p CollabProfileLookup) *DesignCollabHandler {
	h.profiles = p
	return h
}

// WithGalleryResolver attaches a gallery resolver so collaboration endpoints
// can reject cross-workspace gallery IDs before touching in-memory presence or
// locks. Nil keeps lightweight unit tests on the historical behavior.
func (h *DesignCollabHandler) WithGalleryResolver(s *service.GalleryService) *DesignCollabHandler {
	h.gallerySvc = s
	return h
}

// resolveDisplay returns the display name and avatar for a user id, using the
// optional profile lookup. Display fields are never sourced from JWT claims
// because the access token does not carry them.
func (h *DesignCollabHandler) resolveDisplay(ctx context.Context, userID string) (userName, avatarURL string) {
	if h.profiles == nil || userID == "" {
		return "", ""
	}
	return h.profiles.DisplayProfile(ctx, userID)
}

func (h *DesignCollabHandler) authorizeGalleryAccess(w http.ResponseWriter, r *http.Request, galleryID string) bool {
	if h.gallerySvc == nil {
		return true
	}
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return false
	}
	wsIDStr, _ := claims["workspace_id"].(string)
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil || wsID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return false
	}
	id, err := uuid.Parse(galleryID)
	if err != nil {
		http.Error(w, `{"error":"invalid gallery ID"}`, http.StatusBadRequest)
		return false
	}
	gallery, err := h.gallerySvc.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"failed to validate gallery"}`, http.StatusInternalServerError)
		return false
	}
	if gallery == nil || gallery.WorkspaceID != wsID {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return false
	}
	return true
}

// JoinSession handles POST /api/v1/galleries/{id}/collab/join.
func (h *DesignCollabHandler) JoinSession(w http.ResponseWriter, r *http.Request) {
	galleryID := chi.URLParam(r, "id")
	if !h.authorizeGalleryAccess(w, r, galleryID) {
		return
	}
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	// "sub" is the authenticated user's UUID. "user_id"/"full_name"/"avatar_url"
	// are NOT in the JWT claims map (see middleware.JWTAuth), so reading them
	// here attributed every session to uuid.Nil with a blank identity.
	userID, _ := claims["sub"].(string)
	userName, avatarURL := h.resolveDisplay(r.Context(), userID)

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
	if !h.authorizeGalleryAccess(w, r, galleryID) {
		return
	}
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID, _ := claims["sub"].(string)
	h.svc.LeaveSession(r.Context(), galleryID, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "left"})
}

// AcquireLock handles POST /api/v1/galleries/{id}/collab/lock.
func (h *DesignCollabHandler) AcquireLock(w http.ResponseWriter, r *http.Request) {
	galleryID := chi.URLParam(r, "id")
	if !h.authorizeGalleryAccess(w, r, galleryID) {
		return
	}
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID, _ := claims["sub"].(string)
	userName, _ := h.resolveDisplay(r.Context(), userID)

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
	if !h.authorizeGalleryAccess(w, r, galleryID) {
		return
	}
	sectionID := chi.URLParam(r, "sectionId")
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID, _ := claims["sub"].(string)
	h.svc.ReleaseLock(r.Context(), galleryID, sectionID, userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "released"})
}

// SSEStream handles GET /api/v1/galleries/{id}/collab/stream — Server-Sent Events.
func (h *DesignCollabHandler) SSEStream(w http.ResponseWriter, r *http.Request) {
	galleryID := chi.URLParam(r, "id")
	if !h.authorizeGalleryAccess(w, r, galleryID) {
		return
	}

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
