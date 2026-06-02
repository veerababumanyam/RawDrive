package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// AssetHandler handles asset HTTP requests.
//
// M16 Round 3: validationSvc is an optional Tier D gate wired via
// WithValidation(). When unset (nil) the handler keeps its pre-M16
// behaviour — direct multipart uploads are accepted without manifest
// screening. When set, the Upload() path enforces the same policy-mode
// rules as the chunked upload handler so attackers cannot bypass Tier D
// by choosing the direct path.
type AssetHandler struct {
	assetSvc      *service.AssetService
	uploadSvc     *service.UploadService
	validationSvc service.UploadManifestValidation
	// assetRepo enforces tenant ownership on asset-id-addressed routes via
	// guardAssetWorkspace (workspace-scoped asset lookup). Nil-safe: when
	// unwired the guard fails closed.
	assetRepo *repository.AssetRepo
}

// NewAssetHandler creates a new AssetHandler.
func NewAssetHandler(assetSvc *service.AssetService, uploadSvc *service.UploadService) *AssetHandler {
	return &AssetHandler{assetSvc: assetSvc, uploadSvc: uploadSvc}
}

// WithAssetRepo injects the workspace-scoped asset resolver used by
// guardAssetWorkspace to enforce tenant ownership before serving
// asset-id-addressed routes. Chainable; tolerates a nil repo (the guard fails
// closed when the resolver is nil).
func (h *AssetHandler) WithAssetRepo(ar *repository.AssetRepo) *AssetHandler {
	h.assetRepo = ar
	return h
}

// WithValidation wires the M16 Tier D upload manifest validator onto the
// asset handler's direct multipart upload path. Chainable so main.go can
// keep a single-line construction (`NewAssetHandler(...).WithValidation(...)`).
// Pass nil to disable validation (legacy behaviour).
func (h *AssetHandler) WithValidation(validationSvc service.UploadManifestValidation) *AssetHandler {
	h.validationSvc = validationSvc
	return h
}

// List handles GET /api/v1/assets
func (h *AssetHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	assets, err := h.assetSvc.List(r.Context(), repository.AssetFilter{
		WorkspaceID: workspaceID,
		Status:      r.URL.Query().Get("status"),
		ContentType: r.URL.Query().Get("content_type"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, assets)
}

// GetByID handles GET /api/v1/assets/{id}
func (h *AssetHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31): the workspace-scoped
	// repo lookup is the IDOR remediation — it returns 404 on a cross-tenant id so
	// asset existence is never disclosed across workspaces.
	asset, _, ok := guardAssetWorkspace(w, r, h.assetRepo, id)
	if !ok {
		return
	}

	respondJSON(w, http.StatusOK, asset)
}

// Upload handles POST /api/v1/assets
func (h *AssetHandler) Upload(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"missing user_id"}`, http.StatusUnauthorized)
		return
	}

	if err := r.ParseMultipartForm(500 << 20); err != nil { // 500MB max
		http.Error(w, `{"error":"invalid multipart form"}`, http.StatusBadRequest)
		return
	}

	// M16 E47-S5 Round 3 GREEN: Tier D validation gate.
	// Parse the optional scan_manifest multipart field FIRST (before touching
	// the file) so we can short-circuit rejections without ever reading bytes
	// from disk. When validationSvc is nil the whole block is a no-op,
	// preserving legacy behaviour for callers that haven't wired M16.
	var scanManifest *service.UploadScanManifest
	if manifestRaw := r.FormValue("scan_manifest"); manifestRaw != "" {
		scanManifest = &service.UploadScanManifest{}
		if err := json.Unmarshal([]byte(manifestRaw), scanManifest); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]interface{}{
				"error":   "SCAN_MANIFEST_INVALID",
				"message": "scan_manifest is not valid JSON: " + err.Error(),
			})
			return
		}
	}

	if h.validationSvc != nil {
		mode, err := h.validationSvc.WorkspacePolicyMode(r.Context(), workspaceID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"error":   "POLICY_LOOKUP_FAILED",
				"message": err.Error(),
			})
			return
		}
		if err := h.validationSvc.ValidateForSessionCreate(r.Context(), mode, scanManifest); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]interface{}{
				"error":   err.Error(),
				"message": "upload manifest validation failed",
			})
			return
		}
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"file required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	if strings.HasPrefix(header.Header.Get("Content-Type"), "video/") {
		http.Error(w, `{"error":"VIDEO_NOT_ALLOWED","message":"video uploads are not supported in photo galleries"}`, http.StatusUnprocessableEntity)
		return
	}

	result, err := h.uploadSvc.Upload(r.Context(), service.UploadInput{
		WorkspaceID: workspaceID,
		Filename:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		SizeBytes:   header.Size,
		UploadedBy:  userID,
		Body:        file,
	})
	if err != nil {
		// 2026-05-20: surface plan-quota rejections as 403 with the documented
		// `storage_quota_exceeded` payload — same shape as the QuotaEnforcer
		// middleware, kept stable for the frontend's upload error handler.
		// Any other error stays at 500 with the generic message so we don't
		// leak storage-layer details.
		if errors.Is(err, service.ErrStorageQuotaExceeded) {
			respondJSON(w, http.StatusForbidden, map[string]interface{}{
				"error":   "storage_quota_exceeded",
				"message": "Your workspace has exceeded its storage quota. Please upgrade your plan or delete unused assets.",
			})
			return
		}
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, result)
}

// Download handles GET /api/v1/assets/{id}/download?format=original|webp|thumbnail
func (h *AssetHandler) Download(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31): the workspace-scoped
	// repo lookup is the IDOR remediation — download is gated on the asset
	// belonging to the caller's workspace, returning 404 on a cross-tenant id.
	asset, _, ok := guardAssetWorkspace(w, r, h.assetRepo, id)
	if !ok {
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "original"
	}

	var downloadKey string
	var filename string

	switch format {
	case "webp":
		// Prefer display_webp, fallback to thumb_lg_webp
		if key, ok := asset.ThumbnailURLs["display_webp"]; ok {
			downloadKey = key
			filename = asset.Filename + ".webp"
		} else if key, ok := asset.ThumbnailURLs["thumb_lg_webp"]; ok {
			downloadKey = key
			filename = asset.Filename + ".webp"
		} else {
			http.Error(w, `{"error":"webp version not available"}`, http.StatusNotFound)
			return
		}
	case "thumbnail":
		if key, ok := asset.ThumbnailURLs["thumb_lg"]; ok {
			downloadKey = key
			filename = "thumb_" + asset.Filename
		} else {
			http.Error(w, `{"error":"thumbnail not available"}`, http.StatusNotFound)
			return
		}
	default: // "original"
		downloadKey = asset.StorageKey
		filename = asset.Filename
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"download_url": "/storage/" + downloadKey,
			"filename":     filename,
			"format":       format,
		},
	})
}

// SoftDelete handles DELETE /api/v1/assets/{id}
func (h *AssetHandler) SoftDelete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31): confirm the asset
	// belongs to the caller's workspace before deleting it, returning 404 on a
	// cross-tenant id so a foreign asset cannot be soft-deleted via its UUID.
	if _, _, ok := guardAssetWorkspace(w, r, h.assetRepo, id); !ok {
		return
	}

	if err := h.assetSvc.SoftDelete(r.Context(), id); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// helpers

func getWorkspaceID(r *http.Request) (uuid.UUID, bool) {
	// Try typed context key first (from TenantContext middleware)
	wsStr := middleware.WorkspaceIDFromContext(r.Context())
	if wsStr == "" || wsStr == "pending-onboarding" {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(wsStr)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

func getUserID(r *http.Request) (uuid.UUID, bool) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		return uuid.Nil, false
	}
	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(sub)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
