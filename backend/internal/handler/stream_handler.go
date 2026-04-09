package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// StreamHandler handles live stream HTTP endpoints.
type StreamHandler struct {
	svc *service.StreamService
}

// NewStreamHandler creates a new StreamHandler.
func NewStreamHandler(svc *service.StreamService) *StreamHandler {
	return &StreamHandler{svc: svc}
}

// Create handles POST /api/v1/streams
func (h *StreamHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"workspace context required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Title       string  `json:"title"`
		Description *string `json:"description"`
		GalleryID   *string `json:"gallery_id"`
		ScheduledAt *string `json:"scheduled_at"`
		PinCode     *string `json:"pin_code"`
		MaxQuality  string  `json:"max_quality"`
		ChatEnabled *bool   `json:"chat_enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		http.Error(w, `{"error":"title is required"}`, http.StatusBadRequest)
		return
	}

	input := service.CreateStreamInput{
		WorkspaceID: wsID,
		CreatedBy:   userID,
		Title:       req.Title,
		Description: req.Description,
		MaxQuality:  req.MaxQuality,
		ChatEnabled: true,
		PinCode:     req.PinCode,
	}
	if req.ChatEnabled != nil {
		input.ChatEnabled = *req.ChatEnabled
	}
	if req.GalleryID != nil {
		gid, err := uuid.Parse(*req.GalleryID)
		if err == nil {
			input.GalleryID = &gid
		}
	}
	if req.ScheduledAt != nil {
		t, err := time.Parse(time.RFC3339, *req.ScheduledAt)
		if err == nil {
			input.ScheduledAt = &t
		}
	}

	stream, err := h.svc.CreateStream(r.Context(), input)
	if err != nil {
		log.Printf("stream create error: %v", err)
		http.Error(w, `{"error":"failed to create stream"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, stream)
}

// Get handles GET /api/v1/streams/{id} (authenticated — includes RTMPS keys)
func (h *StreamHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	stream, err := h.svc.GetStream(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"stream not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, stream)
}

// GetPublic handles GET /api/v1/public/streams/{id} — strips sensitive fields.
func (h *StreamHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	stream, err := h.svc.GetStream(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"stream not found"}`, http.StatusNotFound)
		return
	}
	// Public DTO — never expose RTMPS credentials or PIN to unauthenticated viewers
	publicStream := map[string]any{
		"id":                    stream.ID,
		"title":                 stream.Title,
		"description":           stream.Description,
		"status":                stream.Status,
		"scheduled_at":          stream.ScheduledAt,
		"started_at":            stream.StartedAt,
		"ended_at":              stream.EndedAt,
		"cf_playback_url":       stream.CFPlaybackURL,
		"max_quality":           stream.MaxQuality,
		"chat_enabled":          stream.ChatEnabled,
		"chat_slow_mode_seconds": stream.ChatSlowModeSecs,
		"peak_viewers":          stream.PeakViewers,
		"total_views":           stream.TotalViews,
		"duration_seconds":      stream.DurationSeconds,
		"pin_required":          stream.PinCode != nil && *stream.PinCode != "",
	}
	respondJSON(w, http.StatusOK, publicStream)
}

// List handles GET /api/v1/streams
func (h *StreamHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"workspace context required"}`, http.StatusBadRequest)
		return
	}
	status := r.URL.Query().Get("status")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	streams, err := h.svc.ListStreams(r.Context(), wsID, status, limit, offset)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if streams == nil {
		streams = []repository.Stream{}
	}
	respondJSON(w, http.StatusOK, streams)
}

// Start handles PUT /api/v1/streams/{id}/start
func (h *StreamHandler) Start(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.StartStream(r.Context(), id); err != nil {
		http.Error(w, `{"error":"failed to start stream"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "live"})
}

// End handles PUT /api/v1/streams/{id}/end
func (h *StreamHandler) End(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		DurationSeconds int `json:"duration_seconds"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if err := h.svc.EndStream(r.Context(), id, req.DurationSeconds); err != nil {
		http.Error(w, `{"error":"failed to end stream"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ended"})
}

// Delete handles DELETE /api/v1/streams/{id}
func (h *StreamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.DeleteStream(r.Context(), id); err != nil {
		http.Error(w, `{"error":"failed to delete stream"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ChatHistory handles GET /api/v1/streams/{id}/chat
func (h *StreamHandler) ChatHistory(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	messages, err := h.svc.GetChatHistory(r.Context(), id, limit, offset)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if messages == nil {
		messages = []repository.StreamChat{}
	}
	respondJSON(w, http.StatusOK, messages)
}

// SendChat handles POST /api/v1/streams/{id}/chat
func (h *StreamHandler) SendChat(w http.ResponseWriter, r *http.Request) {
	streamID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		UserName string `json:"user_name"`
		Message  string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
		http.Error(w, `{"error":"message is required"}`, http.StatusBadRequest)
		return
	}
	if req.UserName == "" {
		req.UserName = "Anonymous"
	}

	msg := &repository.StreamChat{
		StreamID:    streamID,
		UserName:    req.UserName,
		Message:     req.Message,
		MessageType: "chat",
	}

	// If authenticated, attach user ID
	if userID, ok := getUserID(r); ok {
		msg.UserID = &userID
	}

	if err := h.svc.SendChatMessage(r.Context(), msg); err != nil {
		http.Error(w, `{"error":"failed to send message"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, msg)
}

// MuteUser handles PUT /api/v1/streams/{id}/chat/mute
func (h *StreamHandler) MuteUser(w http.ResponseWriter, r *http.Request) {
	streamID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		UserName string `json:"user_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserName == "" {
		http.Error(w, `{"error":"user_name is required"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.MuteUser(r.Context(), streamID, req.UserName); err != nil {
		http.Error(w, `{"error":"failed to mute user"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "muted"})
}

// DeleteChat handles DELETE /api/v1/streams/{id}/chat/{messageId}
func (h *StreamHandler) DeleteChat(w http.ResponseWriter, r *http.Request) {
	msgID, err := uuid.Parse(chi.URLParam(r, "messageId"))
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.DeleteChatMessage(r.Context(), msgID); err != nil {
		http.Error(w, `{"error":"failed to delete message"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpdateChatSettings handles PUT /api/v1/streams/{id}/chat/settings
func (h *StreamHandler) UpdateChatSettings(w http.ResponseWriter, r *http.Request) {
	streamID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Enabled      bool `json:"enabled"`
		SlowModeSecs int  `json:"slow_mode_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.UpdateChatSettings(r.Context(), streamID, req.Enabled, req.SlowModeSecs); err != nil {
		http.Error(w, `{"error":"failed to update chat settings"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// VerifyPin handles POST /api/v1/streams/{id}/verify-pin (public)
func (h *StreamHandler) VerifyPin(w http.ResponseWriter, r *http.Request) {
	streamID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid stream id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Pin string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	valid, err := h.svc.VerifyStreamPin(r.Context(), streamID, req.Pin)
	if err != nil {
		http.Error(w, `{"error":"stream not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"valid": valid})
}
