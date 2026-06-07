package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// workspaceLogoMaxBytes caps the raw business-logo upload. Mirrors the
// photographer-profile avatar/logo cap so the two logo flows behave the same.
const workspaceLogoMaxBytes = profileAvatarMaxBytes

// workspaceLogoMaxDim bounds the rendered WebP brand mark (longest edge).
// The render never upscales, so small wordmarks keep their native size.
const workspaceLogoMaxDim = 640

var (
	errWorkspaceLogoStorageUnavailable = errors.New("logo storage is not configured")
	errWorkspaceLogoMissingOriginal    = errors.New("upload a logo before adjusting its crop")
)

// UploadLogo accepts a raw business-logo image for the caller's workspace,
// renders a free-aspect (object-contain, never square-clipped) WebP brand mark
// server-side from the requested crop, stores both the original (kept for
// re-cropping) and the rendered mark on the managed object store, creates an
// asset row for the rendered mark, and points workspaces.logo_asset_id /
// logo_url / logo_metadata at it.
//
// Wired at POST /api/v1/workspaces/current/logo/upload. The workspace is read
// from JWT claims (getWorkspaceID) so a client cannot target another workspace.
// The logo is a PUBLIC, unencrypted brand mark (same posture as the avatar
// pipeline) — it is intentionally not E2EE.
func (h *WorkspaceProfileHandler) UploadLogo(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := getUserID(r)
	if h.Store == nil || h.Assets == nil || h.DB == nil {
		http.Error(w, `{"error":"logo upload unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, workspaceLogoMaxBytes)
	if err := r.ParseMultipartForm(workspaceLogoMaxBytes); err != nil {
		http.Error(w, `{"error":"logo upload is too large or invalid"}`, http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("logo")
	if err != nil {
		http.Error(w, `{"error":"logo file is required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, workspaceLogoMaxBytes))
	if err != nil {
		http.Error(w, `{"error":"failed to read logo"}`, http.StatusBadRequest)
		return
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = http.DetectContentType(data[:min(len(data), 512)])
	}
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		http.Error(w, `{"error":"logo must be an image"}`, http.StatusBadRequest)
		return
	}

	pos := parseLogoCropPosition(r.FormValue)
	logoID := uuid.New()
	renderedKey, originalKey, renderedSize, err := buildWorkspaceLogo(r.Context(), h.Store, wsID, logoID, data, contentType, header.Filename, pos)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to process logo: %s"}`, jsonEscape(err.Error())), http.StatusBadRequest)
		return
	}

	prev := h.currentWorkspaceLogo(r.Context(), wsID)

	asset := &repository.Asset{
		WorkspaceID:   wsID,
		Filename:      workspaceLogoFilename(header.Filename),
		ContentType:   "image/webp",
		SizeBytes:     int64(renderedSize),
		StorageKey:    renderedKey,
		StorageDriver: "s3",
		Status:        "ready",
		IsEncrypted:   false,
		ExifData:      map[string]interface{}{},
		ThumbnailURLs: map[string]string{},
	}
	if userID != uuid.Nil {
		asset.UploadedBy = &userID
	}
	if err := h.Assets.Create(r.Context(), asset); err != nil {
		http.Error(w, `{"error":"failed to save logo"}`, http.StatusInternalServerError)
		return
	}

	metadata := workspaceLogoMetadata(asset.ID, asset.Filename, int64(renderedSize), renderedKey, originalKey, pos)
	if err := h.persistWorkspaceLogo(r.Context(), wsID, asset.ID, renderedKey, metadata); err != nil {
		http.Error(w, `{"error":"failed to save logo"}`, http.StatusInternalServerError)
		return
	}

	// Best-effort: reclaim the storage + asset row the previous logo held so
	// repeated re-uploads do not accumulate orphaned objects. Never fails the
	// request — the new logo is already committed.
	h.cleanupWorkspaceLogo(r.Context(), prev)

	h.respondWorkspaceProfile(w, r, wsID)
}

// CropLogo re-renders the workspace's stored ORIGINAL logo with a new crop
// position, without requiring a re-upload. Wired at
// POST /api/v1/workspaces/current/logo/crop.
func (h *WorkspaceProfileHandler) CropLogo(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := getUserID(r)
	if h.Store == nil || h.Assets == nil || h.DB == nil {
		http.Error(w, `{"error":"logo crop unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	var pos service.LogoCropPosition
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&pos); err != nil {
		http.Error(w, `{"error":"invalid crop body"}`, http.StatusBadRequest)
		return
	}

	prev := h.currentWorkspaceLogo(r.Context(), wsID)
	if prev.originalKey == "" {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, errWorkspaceLogoMissingOriginal.Error()), http.StatusBadRequest)
		return
	}

	rc, err := h.Store.Get(r.Context(), prev.originalKey)
	if err != nil {
		http.Error(w, `{"error":"logo original not found"}`, http.StatusNotFound)
		return
	}
	rendered, err := service.RenderLogoCropWebP(r.Context(), rc, pos, workspaceLogoMaxDim)
	_ = rc.Close()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to crop logo: %s"}`, jsonEscape(err.Error())), http.StatusBadRequest)
		return
	}

	renderedKey := workspaceRenderedLogoKey(wsID, uuid.New())
	if err := h.Store.Put(r.Context(), renderedKey, bytes.NewReader(rendered), int64(len(rendered)), "image/webp"); err != nil {
		http.Error(w, `{"error":"failed to store logo crop"}`, http.StatusInternalServerError)
		return
	}

	asset := &repository.Asset{
		WorkspaceID:   wsID,
		Filename:      prev.filename,
		ContentType:   "image/webp",
		SizeBytes:     int64(len(rendered)),
		StorageKey:    renderedKey,
		StorageDriver: "s3",
		Status:        "ready",
		IsEncrypted:   false,
		ExifData:      map[string]interface{}{},
		ThumbnailURLs: map[string]string{},
	}
	if asset.Filename == "" {
		asset.Filename = "logo.webp"
	}
	if userID != uuid.Nil {
		asset.UploadedBy = &userID
	}
	if err := h.Assets.Create(r.Context(), asset); err != nil {
		http.Error(w, `{"error":"failed to save logo crop"}`, http.StatusInternalServerError)
		return
	}

	metadata := workspaceLogoMetadata(asset.ID, asset.Filename, int64(len(rendered)), renderedKey, prev.originalKey, pos)
	if err := h.persistWorkspaceLogo(r.Context(), wsID, asset.ID, renderedKey, metadata); err != nil {
		http.Error(w, `{"error":"failed to save logo crop"}`, http.StatusInternalServerError)
		return
	}

	// Best-effort: drop the prior RENDERED object + asset row, but KEEP the
	// shared original (it is reused for the next crop).
	h.cleanupWorkspaceRendered(r.Context(), prev)

	h.respondWorkspaceProfile(w, r, wsID)
}

// ── pure helpers (unit-testable, no DB / no network) ─────────────────────────

// parseLogoCropPosition reads x/y/zoom from form values. Missing/invalid
// values default to the fit-to-contain whole-logo view (x=0, y=0, zoom=1).
// The render service clamps to the valid range, so out-of-range input is safe.
func parseLogoCropPosition(get func(string) string) service.LogoCropPosition {
	pos := service.LogoCropPosition{Zoom: 1}
	if v := strings.TrimSpace(get("x")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			pos.X = f
		}
	}
	if v := strings.TrimSpace(get("y")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			pos.Y = f
		}
	}
	if v := strings.TrimSpace(get("zoom")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			pos.Zoom = f
		}
	}
	return pos
}

// workspaceLogoStorageKeys derives the original + rendered object keys for a
// workspace logo. Mirrors the photographer-profile key layout, scoped to the
// workspace instead of a photographer profile.
func workspaceLogoStorageKeys(wsID, logoID uuid.UUID, ext string) (originalKey, renderedKey string) {
	if ext == "" {
		ext = ".img"
	}
	originalKey = fmt.Sprintf("workspaces/%s/logo/%s/original%s", wsID, logoID, ext)
	renderedKey = fmt.Sprintf("workspaces/%s/logo/%s/render.webp", wsID, logoID)
	return originalKey, renderedKey
}

func workspaceRenderedLogoKey(wsID, logoID uuid.UUID) string {
	return fmt.Sprintf("workspaces/%s/logo/%s/render.webp", wsID, logoID)
}

func workspaceLogoFilename(original string) string {
	base := strings.TrimSpace(original)
	if base == "" {
		return "logo.webp"
	}
	// Normalize to a .webp name since the stored brand mark is always WebP.
	if dot := strings.LastIndexByte(base, '.'); dot > 0 {
		base = base[:dot]
	}
	base = strings.ReplaceAll(base, "/", "_")
	return base + ".webp"
}

// buildWorkspaceLogo renders the WebP brand mark from the requested crop and
// stores BOTH the original (for re-cropping) and the rendered mark. It returns
// the storage keys and the rendered size. Pure of any DB access, so it is
// unit-testable with a fake storage.Provider.
func buildWorkspaceLogo(ctx context.Context, store storageProviderPutGet, wsID, logoID uuid.UUID, data []byte, contentType, filename string, pos service.LogoCropPosition) (renderedKey, originalKey string, renderedSize int, err error) {
	if store == nil {
		return "", "", 0, errWorkspaceLogoStorageUnavailable
	}
	rendered, err := service.RenderLogoCropWebP(ctx, bytes.NewReader(data), pos, workspaceLogoMaxDim)
	if err != nil {
		return "", "", 0, err
	}
	ext := profileImageExt(filename, contentType)
	originalKey, renderedKey = workspaceLogoStorageKeys(wsID, logoID, ext)
	if err := store.Put(ctx, originalKey, bytes.NewReader(data), int64(len(data)), contentType); err != nil {
		return "", "", 0, fmt.Errorf("store logo original: %w", err)
	}
	if err := store.Put(ctx, renderedKey, bytes.NewReader(rendered), int64(len(rendered)), "image/webp"); err != nil {
		return "", "", 0, fmt.Errorf("store logo render: %w", err)
	}
	return renderedKey, originalKey, len(rendered), nil
}

// workspaceLogoMetadata builds the logo_metadata JSONB payload. It is a
// superset of logoMetadataForAsset's shape (so existing readers keep working)
// plus the original key + crop position needed for server-side re-cropping.
func workspaceLogoMetadata(assetID uuid.UUID, filename string, renderedSize int64, renderedKey, originalKey string, pos service.LogoCropPosition) map[string]interface{} {
	return map[string]interface{}{
		"asset_id":             assetID.String(),
		"filename":             filename,
		"content_type":         "image/webp",
		"size_bytes":           renderedSize,
		"storage_key":          renderedKey,
		"storage_driver":       "s3",
		"original_storage_key": originalKey,
		"crop": map[string]interface{}{
			"x":    pos.X,
			"y":    pos.Y,
			"zoom": pos.Zoom,
		},
	}
}

// storageProviderPutGet is the minimal storage surface buildWorkspaceLogo needs.
// *storage.Provider implementations satisfy it; tests pass a fake.
type storageProviderPutGet interface {
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
}

// ── DB helpers ───────────────────────────────────────────────────────────────

type workspaceLogoRef struct {
	assetID     uuid.UUID
	renderedKey string
	originalKey string
	filename    string
}

// currentWorkspaceLogo reads the workspace's current logo asset id + rendered
// and original keys from logo_metadata (best-effort; a missing row/logo yields
// an empty ref).
func (h *WorkspaceProfileHandler) currentWorkspaceLogo(ctx context.Context, wsID uuid.UUID) workspaceLogoRef {
	var ref workspaceLogoRef
	if h.DB == nil {
		return ref
	}
	var assetIDStr string
	var metadata map[string]interface{}
	err := h.DB.QueryRow(ctx, `
		SELECT COALESCE(logo_asset_id::text, ''), COALESCE(logo_metadata, '{}'::jsonb)
		FROM workspaces WHERE id = $1`, wsID).Scan(&assetIDStr, &metadata)
	if err != nil {
		return ref
	}
	if assetIDStr != "" {
		if id, perr := uuid.Parse(assetIDStr); perr == nil {
			ref.assetID = id
		}
	}
	if metadata != nil {
		if v, ok := metadata["original_storage_key"].(string); ok {
			ref.originalKey = v
		}
		if v, ok := metadata["storage_key"].(string); ok {
			ref.renderedKey = v
		}
		if v, ok := metadata["filename"].(string); ok {
			ref.filename = v
		}
	}
	return ref
}

// persistWorkspaceLogo points the workspace row at the new rendered logo asset.
func (h *WorkspaceProfileHandler) persistWorkspaceLogo(ctx context.Context, wsID, assetID uuid.UUID, renderedKey string, metadata map[string]interface{}) error {
	raw, err := workspaceProfileJSONBValue(metadata)
	if err != nil {
		return err
	}
	_, err = h.DB.Exec(ctx, `
		UPDATE workspaces
		SET logo_asset_id = $1::uuid,
		    logo_url = $2,
		    logo_metadata = $3::jsonb,
		    updated_at = now()
		WHERE id = $4`, assetID, renderedKey, raw, wsID)
	return err
}

// cleanupWorkspaceLogo best-effort removes BOTH the rendered + original objects
// and soft-deletes the previous logo asset row. Never returns an error.
func (h *WorkspaceProfileHandler) cleanupWorkspaceLogo(ctx context.Context, prev workspaceLogoRef) {
	h.cleanupWorkspaceRendered(ctx, prev)
	if prev.originalKey != "" {
		_ = h.Store.Delete(ctx, prev.originalKey)
	}
}

// cleanupWorkspaceRendered best-effort removes only the previous RENDERED object
// + asset row (used on re-crop, where the original is reused).
func (h *WorkspaceProfileHandler) cleanupWorkspaceRendered(ctx context.Context, prev workspaceLogoRef) {
	if h.Store != nil && prev.renderedKey != "" {
		_ = h.Store.Delete(ctx, prev.renderedKey)
	}
	if prev.assetID != uuid.Nil && h.DB != nil {
		_, _ = h.DB.Exec(ctx, `UPDATE assets SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, prev.assetID)
	}
}

// respondWorkspaceProfile re-loads + returns the full workspace profile after a
// logo mutation, so the client gets the same shape GetProfile returns.
func (h *WorkspaceProfileHandler) respondWorkspaceProfile(w http.ResponseWriter, r *http.Request, wsID uuid.UUID) {
	profile, err := h.loadWorkspaceProfile(r.Context(), wsID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to load profile: %s"}`, jsonEscape(err.Error())), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, profile)
}
