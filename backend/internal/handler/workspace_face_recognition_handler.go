package handler

// PR-3c: workspace-level face-recognition toggle.
//
// Backs the legacy Settings → Face Recognition page. NOTE on shipped
// posture: face recognition is DEFAULT-ON — migration 112 flipped
// workspaces.face_recognition_enabled FALSE → TRUE and backfilled every
// workspace, and the Settings → Face Recognition tile/page were removed. This
// is therefore NOT an opt-in toggle as shipped; the flag is retained as an
// audit/disable surface. The real consent capture (not a default-off gate) is
// delivered by slices 3b/3c, and the licensing + E2EE-posture decision for the
// default-on biometric processing is recorded by slice 3j.
//
// The flag stored at workspaces.face_recognition_enabled still gates the
// detection pipeline — when false, FaceService.DetectAndStore returns nil
// silently, and the public People endpoints (PR-3b) return empty.
//
// Endpoints:
//   GET   /api/v1/workspaces/current/face-recognition → {enabled: bool}
//   PATCH /api/v1/workspaces/current/face-recognition  body {enabled: bool}
//
// Workspace ID is read from the JWT claims rather than the URL — same
// "current" literal pattern as /workspaces/current/plan and /profile,
// so clients can't spoof a different workspace via path manipulation.

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/middleware"
)

type WorkspaceFaceRecognitionHandler struct {
	DB *pgxpool.Pool
}

type faceRecognitionResponse struct {
	Enabled bool `json:"enabled"`
}

type faceRecognitionPatchBody struct {
	Enabled bool `json:"enabled"`
}

func (h *WorkspaceFaceRecognitionHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID, ok := workspaceIDFromJWT(w, r)
	if !ok {
		return
	}
	var enabled bool
	err := h.DB.QueryRow(r.Context(),
		`SELECT face_recognition_enabled FROM workspaces WHERE id = $1`,
		wsID,
	).Scan(&enabled)
	if err != nil {
		http.Error(w, `{"error":"failed to read face recognition state"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, faceRecognitionResponse{Enabled: enabled})
}

func (h *WorkspaceFaceRecognitionHandler) Patch(w http.ResponseWriter, r *http.Request) {
	wsID, ok := workspaceIDFromJWT(w, r)
	if !ok {
		return
	}
	var body faceRecognitionPatchBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	_, err := h.DB.Exec(r.Context(),
		`UPDATE workspaces SET face_recognition_enabled = $2 WHERE id = $1`,
		wsID, body.Enabled,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to update face recognition state"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, faceRecognitionResponse{Enabled: body.Enabled})
}

// workspaceIDFromJWT extracts and validates workspace_id from the JWT
// claims attached to the request context. Writes the HTTP error and
// returns ok=false on missing/invalid claims so callers can return
// immediately. Mirrors the pattern in dashboard_handler.go.
func workspaceIDFromJWT(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return uuid.Nil, false
	}
	wsIDStr, _ := claims["workspace_id"].(string)
	wsID, err := uuid.Parse(wsIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid workspace"}`, http.StatusBadRequest)
		return uuid.Nil, false
	}
	return wsID, true
}
