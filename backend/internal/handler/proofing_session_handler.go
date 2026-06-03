package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/service"
)

// ProofingSessionHandler handles proofing session HTTP requests.
type ProofingSessionHandler struct {
	sessionSvc  *service.ProofingSessionService
	commentSvc  *service.ProofingCommentService
	approvalSvc *service.AlbumApprovalService
	// galleryResolver enforces tenant ownership on gallery-scoped routes via
	// guardGalleryWorkspace. Nil-safe: when unwired the guard fails closed.
	galleryResolver *service.GalleryService
}

// NewProofingSessionHandler creates a new ProofingSessionHandler.
func NewProofingSessionHandler(ss *service.ProofingSessionService, cs *service.ProofingCommentService, as *service.AlbumApprovalService) *ProofingSessionHandler {
	return &ProofingSessionHandler{sessionSvc: ss, commentSvc: cs, approvalSvc: as}
}

// WithGalleryResolver injects the gallery resolver used by guardGalleryWorkspace
// to enforce tenant ownership before serving gallery-scoped routes. Chainable;
// tolerates a nil resolver (the guard fails closed when the resolver is nil).
func (h *ProofingSessionHandler) WithGalleryResolver(gs *service.GalleryService) *ProofingSessionHandler {
	h.galleryResolver = gs
	return h
}

// CreateSession handles POST /galleries/{id}/proofing/sessions
func (h *ProofingSessionHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		SessionType string `json:"session_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	session, err := h.sessionSvc.CreateSession(r.Context(), service.CreateSessionInput{
		GalleryID:   galleryID,
		Name:        input.Name,
		Description: input.Description,
		SessionType: input.SessionType,
	})
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	respondJSON(w, http.StatusCreated, session)
}

// ListSessions handles GET /galleries/{id}/proofing/sessions
func (h *ProofingSessionHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	sessions, err := h.sessionSvc.ListSessions(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, sessions)
}

// UpdateSession handles PATCH /galleries/{id}/proofing/sessions/{sessionId}
func (h *ProofingSessionHandler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		http.Error(w, `{"error":"invalid session id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31). The URL carries a
	// session id, not a gallery id, so resolve the session's owning gallery and
	// enforce that it belongs to the caller's workspace via guardGalleryWorkspace.
	// A missing session (lookup error) is treated as cross-tenant/not-found (404)
	// so a foreign session's existence is never disclosed.
	session, err := h.sessionSvc.GetSession(r.Context(), sessionID)
	if err != nil || session == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, session.GalleryID); !ok {
		return
	}

	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.sessionSvc.UpdateSession(r.Context(), sessionID, input.Name, input.Description); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DeleteSession handles DELETE /galleries/{id}/proofing/sessions/{sessionId}
func (h *ProofingSessionHandler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	sessionID, err := uuid.Parse(chi.URLParam(r, "sessionId"))
	if err != nil {
		http.Error(w, `{"error":"invalid session id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31). Resolve the session's
	// owning gallery and enforce that it belongs to the caller's workspace before
	// deleting. A missing session is treated as cross-tenant/not-found (404).
	session, err := h.sessionSvc.GetSession(r.Context(), sessionID)
	if err != nil || session == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, session.GalleryID); !ok {
		return
	}

	if err := h.sessionSvc.DeleteSession(r.Context(), sessionID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// SetStarRating handles PATCH /galleries/{id}/proofing/selections/{selId}/rating
func (h *ProofingSessionHandler) SetStarRating(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	selID, err := uuid.Parse(chi.URLParam(r, "selId"))
	if err != nil {
		http.Error(w, `{"error":"invalid selection id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31). Validates the gallery
	// {id} path belongs to the caller's workspace.
	_, workspaceID, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID)
	if !ok {
		return
	}

	var input struct {
		Rating int `json:"rating"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	// Scope the selection mutation to the workspace too: the gallery {id} guard
	// alone does not stop a foreign selId being updated under an owned gallery id.
	// 0 rows ⇒ selection missing or cross-tenant ⇒ 404.
	rows, err := h.sessionSvc.SetStarRatingInWorkspace(r.Context(), selID, input.Rating, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}
	if rows == 0 {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// SetColorLabel handles PATCH /galleries/{id}/proofing/selections/{selId}/label
func (h *ProofingSessionHandler) SetColorLabel(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	selID, err := uuid.Parse(chi.URLParam(r, "selId"))
	if err != nil {
		http.Error(w, `{"error":"invalid selection id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31). Validates the gallery
	// {id} path belongs to the caller's workspace.
	_, workspaceID, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID)
	if !ok {
		return
	}

	var input struct {
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	// Scope the selection mutation to the workspace too (see SetStarRating).
	// 0 rows ⇒ selection missing or cross-tenant ⇒ 404.
	rows, err := h.sessionSvc.SetColorLabelInWorkspace(r.Context(), selID, input.Label, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}
	if rows == 0 {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// CreateComment handles POST /galleries/{id}/proofing/comments
func (h *ProofingSessionHandler) CreateComment(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	var input struct {
		AssetID     string   `json:"asset_id"`
		ParentID    *string  `json:"parent_id,omitempty"`
		AuthorName  string   `json:"author_name"`
		AuthorEmail string   `json:"author_email"`
		Body        string   `json:"body"`
		PinX        *float64 `json:"pin_x,omitempty"`
		PinY        *float64 `json:"pin_y,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	assetID, err := uuid.Parse(input.AssetID)
	if err != nil {
		http.Error(w, `{"error":"invalid asset_id"}`, http.StatusBadRequest)
		return
	}

	var parentID *uuid.UUID
	if input.ParentID != nil {
		pid, err := uuid.Parse(*input.ParentID)
		if err != nil {
			http.Error(w, `{"error":"invalid parent_id"}`, http.StatusBadRequest)
			return
		}
		parentID = &pid
	}

	comment, err := h.commentSvc.CreateComment(r.Context(), service.CreateCommentInput{
		GalleryID:   galleryID,
		AssetID:     assetID,
		ParentID:    parentID,
		AuthorName:  input.AuthorName,
		AuthorEmail: input.AuthorEmail,
		Body:        input.Body,
		PinX:        input.PinX,
		PinY:        input.PinY,
	})
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	respondJSON(w, http.StatusCreated, comment)
}

// GetComments handles GET /galleries/{id}/proofing/comments?asset_id=X
func (h *ProofingSessionHandler) GetComments(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	assetIDStr := r.URL.Query().Get("asset_id")
	assetID, err := uuid.Parse(assetIDStr)
	if err != nil {
		http.Error(w, `{"error":"asset_id query parameter required"}`, http.StatusBadRequest)
		return
	}

	comments, err := h.commentSvc.GetCommentsByAsset(r.Context(), galleryID, assetID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, comments)
}

// SubmitAlbumApproval handles POST /galleries/{id}/proofing/album-approval
func (h *ProofingSessionHandler) SubmitAlbumApproval(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	var input struct {
		SessionID       *string        `json:"session_id,omitempty"`
		ApprovedByName  string         `json:"approved_by_name"`
		ApprovedByEmail string         `json:"approved_by_email"`
		ConfigSnapshot  map[string]any `json:"config_snapshot"`
		Notes           string         `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	var sessionID *uuid.UUID
	if input.SessionID != nil {
		sid, err := uuid.Parse(*input.SessionID)
		if err != nil {
			http.Error(w, `{"error":"invalid session_id"}`, http.StatusBadRequest)
			return
		}
		sessionID = &sid
	}

	approval, err := h.approvalSvc.SubmitApproval(r.Context(), service.SubmitApprovalInput{
		GalleryID:       galleryID,
		SessionID:       sessionID,
		ApprovedByName:  input.ApprovedByName,
		ApprovedByEmail: input.ApprovedByEmail,
		ConfigSnapshot:  input.ConfigSnapshot,
		IPAddress:       r.RemoteAddr,
		UserAgent:       r.UserAgent(),
		Notes:           input.Notes,
	})
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	respondJSON(w, http.StatusCreated, approval)
}

// ListAlbumApprovals handles GET /galleries/{id}/proofing/album-approval
func (h *ProofingSessionHandler) ListAlbumApprovals(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.galleryResolver, galleryID); !ok {
		return
	}

	approvals, err := h.approvalSvc.ListApprovals(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, approvals)
}
