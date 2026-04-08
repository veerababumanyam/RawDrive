package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// EventPublisher publishes events for SSE delivery.
type EventPublisher interface {
	Publish(ctx context.Context, subject string, data []byte) error
}

// MessagingHandler handles messaging endpoints.
type MessagingHandler struct {
	repo    *repository.MessagingRepo
	modRepo *repository.ModerationRepo
	events  EventPublisher
}

func NewMessagingHandler(repo *repository.MessagingRepo, modRepo *repository.ModerationRepo, events EventPublisher) *MessagingHandler {
	return &MessagingHandler{repo: repo, modRepo: modRepo, events: events}
}

func (h *MessagingHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace"}`, http.StatusBadRequest)
		return
	}
	channels, err := h.repo.ListChannels(r.Context(), wsID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": channels})
}

func (h *MessagingHandler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Name        string `json:"name"`
		ChannelType string `json:"channel_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}
	if req.ChannelType == "" {
		req.ChannelType = "general"
	}
	ch := &repository.Channel{
		WorkspaceID: wsID,
		Name:        req.Name,
		ChannelType: req.ChannelType,
		CreatedBy:   userID,
	}
	if err := h.repo.CreateChannel(r.Context(), ch); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	// Auto-add creator as admin member
	h.repo.AddMember(r.Context(), &repository.ChannelMember{
		ChannelID: ch.ID,
		UserID:    userID,
		Role:      "admin",
	})
	respondJSON(w, http.StatusCreated, map[string]any{"data": ch})
}

func (h *MessagingHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelId"))
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 50 {
			limit = v
		}
	}
	messages, err := h.repo.ListMessages(r.Context(), channelID, limit, nil)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": messages})
}

func (h *MessagingHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace"}`, http.StatusBadRequest)
		return
	}
	channelID, err := uuid.Parse(chi.URLParam(r, "channelId"))
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Body            string  `json:"body"`
		MessageType     string  `json:"message_type"`
		AttachmentURL   *string `json:"attachment_url"`
		ParentMessageID *string `json:"parent_message_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Body == "" {
		http.Error(w, `{"error":"body is required"}`, http.StatusBadRequest)
		return
	}
	if req.MessageType == "" {
		req.MessageType = "text"
	}

	msg := &repository.Message{
		WorkspaceID:   wsID,
		ChannelID:     channelID,
		SenderID:      userID,
		MessageType:   req.MessageType,
		Body:          req.Body,
		AttachmentURL: req.AttachmentURL,
	}
	if req.ParentMessageID != nil {
		if pid, err := uuid.Parse(*req.ParentMessageID); err == nil {
			msg.ParentMessageID = &pid
		}
	}
	if err := h.repo.CreateMessage(r.Context(), msg); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// GAP-001 fix: Publish SSE event for real-time delivery
	if h.events != nil {
		eventData, _ := json.Marshal(msg)
		if err := h.events.Publish(r.Context(), "chat.message."+channelID.String(), eventData); err != nil {
			log.Printf("messaging: failed to publish chat.message event: %v", err)
		}
	}

	// GAP-008 fix: Inline content screening
	if h.modRepo != nil {
		flagged, err := h.modRepo.ScreenContent(r.Context(), "message", msg.Body)
		if err == nil && flagged {
			_ = h.modRepo.CreateItem(r.Context(), &repository.ModerationItem{
				ContentType: "message",
				ContentID:   msg.ID,
				WorkspaceID: wsID,
				Reason:      "auto_flagged",
			})
		}
	}

	respondJSON(w, http.StatusCreated, map[string]any{"data": msg})
}

func (h *MessagingHandler) EditMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "messageId"))
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}
	// Verify sender ownership
	msg, err := h.repo.GetMessage(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}
	if msg.SenderID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.EditMessage(r.Context(), id, req.Body); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"status": "updated"})
}

func (h *MessagingHandler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "messageId"))
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}
	// Verify sender ownership
	msg, err := h.repo.GetMessage(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}
	if msg.SenderID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	if err := h.repo.DeleteMessage(r.Context(), id); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *MessagingHandler) SearchMessages(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace"}`, http.StatusBadRequest)
		return
	}
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, `{"error":"q parameter is required"}`, http.StatusBadRequest)
		return
	}
	messages, err := h.repo.SearchMessages(r.Context(), wsID, query)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": messages})
}

// ModerationHandler handles content moderation endpoints.
type ModerationHandler struct {
	repo *repository.ModerationRepo
}

func NewModerationHandler(repo *repository.ModerationRepo) *ModerationHandler {
	return &ModerationHandler{repo: repo}
}

func (h *ModerationHandler) ReportContent(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		ContentType string `json:"content_type"`
		ContentID   string `json:"content_id"`
		Reason      string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	contentID, err := uuid.Parse(req.ContentID)
	if err != nil {
		http.Error(w, `{"error":"invalid content_id"}`, http.StatusBadRequest)
		return
	}
	item := &repository.ModerationItem{
		ContentType: req.ContentType,
		ContentID:   contentID,
		WorkspaceID: wsID,
		Reason:      "reported",
		ReporterID:  &userID,
	}
	if err := h.repo.CreateItem(r.Context(), item); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, map[string]any{"data": item})
}

func (h *ModerationHandler) GetQueue(w http.ResponseWriter, r *http.Request) {
	items, err := h.repo.ListPending(r.Context())
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": items})
}

func (h *ModerationHandler) ResolveItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	var req struct {
		Action string  `json:"action"`
		Notes  *string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.ResolveItem(r.Context(), id, userID, req.Action, req.Notes); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"status": "resolved"})
}
