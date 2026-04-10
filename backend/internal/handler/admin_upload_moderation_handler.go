package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E50-S1 / E50-S3 — Admin upload moderation handler.
//
// Routes (mounted under the /api/v1/admin group):
//   GET  /api/v1/admin/upload-moderation                    → queue
//   POST /api/v1/admin/upload-moderation/{assetId}/override → FP override
//   GET  /api/v1/admin/upload-moderation/analytics          → metrics
//
// Nil-safe: route registration succeeds even when the service is unset
// (the handler returns 501 in that path), matching the pattern used by
// admin_workspace_policy_handler so existing admin route tests do not
// need updates.
// ─────────────────────────────────────────────────────────────────────────────

// AdminUploadModerationHandler exposes the admin moderation API.
type AdminUploadModerationHandler struct {
	svc *service.UploadModerationService
}

// NewAdminUploadModerationHandler constructs the handler.
func NewAdminUploadModerationHandler(svc *service.UploadModerationService) *AdminUploadModerationHandler {
	return &AdminUploadModerationHandler{svc: svc}
}

// OverrideRequest is the JSON body for POST /override.
type OverrideRequest struct {
	Justification string `json:"justification"`
	TTLHours      int    `json:"ttl_hours,omitempty"`
}

// ListQueue handles GET /api/v1/admin/upload-moderation.
// Query params: ?workspace_id=<uuid>&limit=<n>&offset=<n>
func (h *AdminUploadModerationHandler) ListQueue(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSONError(w, http.StatusNotImplemented, "UPLOAD_MODERATION_NOT_WIRED",
			"upload moderation service not wired")
		return
	}

	wsIDRaw := r.URL.Query().Get("workspace_id")
	wsID, err := uuid.Parse(wsIDRaw)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_WORKSPACE_ID",
			"workspace_id query parameter must be a valid UUID")
		return
	}

	limit := parseIntParam(r, "limit", 50)
	offset := parseIntParam(r, "offset", 0)

	queue, err := h.svc.ListQueue(r.Context(), wsID, limit, offset)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "QUEUE_READ_FAILED", err.Error())
		return
	}

	// Always emit a concrete array so clients can iterate without a nil check.
	if queue == nil {
		queue = []service.BlockedAssetRow{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"queue": queue,
	})
}

// Override handles POST /api/v1/admin/upload-moderation/{assetId}/override.
func (h *AdminUploadModerationHandler) Override(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSONError(w, http.StatusNotImplemented, "UPLOAD_MODERATION_NOT_WIRED",
			"upload moderation service not wired")
		return
	}

	assetID, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_ASSET_ID",
			"asset id must be a valid UUID")
		return
	}

	var req OverrideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_BODY",
			"request body is not valid JSON")
		return
	}
	if req.Justification == "" {
		writeJSONError(w, http.StatusBadRequest, "JUSTIFICATION_REQUIRED",
			"justification is required for override")
		return
	}

	actorID := adminActorID(r)

	ttl := time.Duration(req.TTLHours) * time.Hour
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}

	result, err := h.svc.Override(r.Context(), service.OverrideInput{
		AssetID:       assetID,
		ActorID:       actorID,
		Justification: req.Justification,
		TTL:           ttl,
	})
	if err != nil {
		if errors.Is(err, service.ErrUploadModerationAssetNotFound) {
			writeJSONError(w, http.StatusNotFound, "ASSET_NOT_FOUND", err.Error())
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "OVERRIDE_FAILED", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// Analytics handles GET /api/v1/admin/upload-moderation/analytics.
// Query params: ?workspace_id=<uuid>&since=<rfc3339>
func (h *AdminUploadModerationHandler) Analytics(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeJSONError(w, http.StatusNotImplemented, "UPLOAD_MODERATION_NOT_WIRED",
			"upload moderation service not wired")
		return
	}

	wsIDRaw := r.URL.Query().Get("workspace_id")
	wsID, err := uuid.Parse(wsIDRaw)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_WORKSPACE_ID",
			"workspace_id query parameter must be a valid UUID")
		return
	}

	var since time.Time
	if sinceRaw := r.URL.Query().Get("since"); sinceRaw != "" {
		since, err = time.Parse(time.RFC3339, sinceRaw)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "INVALID_SINCE",
				"since must be RFC3339 format")
			return
		}
	}

	analytics, err := h.svc.Analytics(r.Context(), wsID, since)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "ANALYTICS_FAILED", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, analytics)
}

// parseIntParam reads a query parameter as int with a fallback default.
func parseIntParam(r *http.Request, name string, def int) int {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return def
	}
	return n
}

// adminActorID extracts the admin's UUID from the JWT claims. Returns the
// nil UUID when the claim is missing or malformed — the caller then still
// proceeds (override is still valid) but the audit log will lack the actor.
// This matches the philosophy in admin_workspace_policy_handler where a
// missing actor is a soft-degradation, not a hard block.
func adminActorID(r *http.Request) uuid.UUID {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		return uuid.Nil
	}
	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return uuid.Nil
	}
	id, err := uuid.Parse(sub)
	if err != nil {
		return uuid.Nil
	}
	return id
}
