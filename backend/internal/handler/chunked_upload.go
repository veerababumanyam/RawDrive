package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
)

const tusVersion = "1.0.0"

// setTUSHeaders adds standard TUS protocol headers to every response.
func setTUSHeaders(w http.ResponseWriter) {
	w.Header().Set("Tus-Resumable", tusVersion)
	w.Header().Set("Tus-Version", tusVersion)
	w.Header().Set("Tus-Extension", "creation,termination")
	w.Header().Set("Tus-Max-Size", "2147483648") // 2GB
}

// ChunkedUploadHandler implements the TUS v1.0.0 resumable upload protocol.
// Clients POST to /uploads to create an upload session, then PATCH chunks.
//
// M16 Round 3: validationSvc is an optional dependency wired via
// WithValidation(). When unset (nil), the handler skips Tier D validation
// entirely — the existing pre-M16 behavior. When set, the handler enforces
// upload manifests at session-create (via ValidateForSessionCreate) and
// verifies the final SHA-256 against the manifest at finalize time. The
// validation service owns its own WorkspacePolicyReader internally, so the
// handler does not need a separate policy service dependency.
type ChunkedUploadHandler struct {
	uploadSvc *service.UploadService
	assetRepo *repository.AssetRepo
	store     storage.Provider
	tmpDir    string
	sessions  sync.Map // uploadID -> *uploadSession

	// M16 E47-S5: optional Tier D validation hook. Wired via WithValidation().
	// Nil means validation is disabled (legacy behavior).
	validationSvc service.UploadManifestValidation
}

type uploadSession struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	TotalSize   int64  `json:"total_size"`
	ChunkSize   int64  `json:"chunk_size"`
	Offset      int64  `json:"offset"`
	TmpPath     string `json:"-"`

	// M16 E47-S5: optional scan manifest provided by the client at session
	// create time. Stored verbatim so the finalize step can verify the
	// declared SHA-256 against the actual uploaded bytes.
	Manifest *service.UploadScanManifest `json:"manifest,omitempty"`
}

// NewChunkedUploadHandler creates a new handler for chunked uploads.
func NewChunkedUploadHandler(uploadSvc *service.UploadService, assetRepo *repository.AssetRepo, store storage.Provider, tmpDir string) *ChunkedUploadHandler {
	os.MkdirAll(tmpDir, 0o755)
	return &ChunkedUploadHandler{
		uploadSvc: uploadSvc,
		assetRepo: assetRepo,
		store:     store,
		tmpDir:    tmpDir,
	}
}

// WithValidation wires the M16 E47-S5 Tier D validation hook. Returns the
// same handler for chainable construction (so cmd/api/main.go can write
// `NewChunkedUploadHandler(...).WithValidation(validationSvc)` without
// changing the constructor signature). Pass nil to disable validation.
//
// Rationale: a setter pattern keeps the constructor backwards-compatible
// with existing test fixtures that don't care about scan manifests, while
// letting M16 wiring opt in explicitly. Round 3 GREEN will call this from
// main.go after instantiating the validation service. The validation
// service owns its own WorkspacePolicyReader, so callers don't need to
// pass a separate policy service.
func (h *ChunkedUploadHandler) WithValidation(
	validationSvc service.UploadManifestValidation,
) *ChunkedUploadHandler {
	h.validationSvc = validationSvc
	return h
}

// RegisterRoutes adds chunked upload routes.
func (h *ChunkedUploadHandler) RegisterRoutes(r chi.Router) {
	r.Post("/api/v1/uploads", h.CreateSession)
	r.Patch("/api/v1/uploads/{uploadId}", h.UploadChunk)
	r.Head("/api/v1/uploads/{uploadId}", h.GetOffset)
	r.Delete("/api/v1/uploads/{uploadId}", h.Cancel)
}

// CreateSession creates a new upload session. POST /api/v1/uploads
func (h *ChunkedUploadHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := getUserID(r)

	var input struct {
		Filename    string                       `json:"filename"`
		ContentType string                       `json:"content_type"`
		TotalSize   int64                        `json:"total_size"`
		ChunkSize   int64                        `json:"chunk_size"`
		ScanManifest *service.UploadScanManifest `json:"scan_manifest,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	// M16 E47-S5 Round 3 GREEN: enforce the Tier D upload manifest gate.
	// When validationSvc is nil (legacy / non-M16 wiring), we skip validation
	// entirely — preserves the pre-M16 behavior for any caller that hasn't
	// wired WithValidation. When set, the validator looks up the workspace's
	// configured policy mode and applies the rule matrix from
	// upload_manifest_validation.ValidateForSessionCreate.
	//
	// Sentinel errors (ErrScanDecisionBlock, ErrScanManifestRequired, etc.)
	// are returned as 400 Bad Request with the error code as the response
	// "error" field. The code IS the error message because the sentinels are
	// defined as `errors.New("SCAN_DECISION_BLOCK")` etc. — the test plan
	// asserts on substring presence of these codes.
	if h.validationSvc != nil {
		mode, err := h.validationSvc.WorkspacePolicyMode(r.Context(), workspaceID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"error":   "POLICY_LOOKUP_FAILED",
				"message": err.Error(),
			})
			return
		}
		if err := h.validationSvc.ValidateForSessionCreate(r.Context(), mode, input.ScanManifest); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]interface{}{
				"error":   err.Error(),
				"message": "upload manifest validation failed",
			})
			return
		}
	}

	if input.TotalSize <= 0 || input.TotalSize > 2*1024*1024*1024 { // 2GB limit
		http.Error(w, `{"error":"total_size must be between 1 byte and 2GB"}`, http.StatusBadRequest)
		return
	}
	if input.ChunkSize <= 0 {
		input.ChunkSize = 5 * 1024 * 1024 // default 5MB
	}

	uploadID := uuid.New().String()
	tmpPath := filepath.Join(h.tmpDir, uploadID)

	// Create empty temp file
	f, err := os.Create(tmpPath)
	if err != nil {
		http.Error(w, `{"error":"failed to create upload session"}`, http.StatusInternalServerError)
		return
	}
	f.Close()

	session := &uploadSession{
		ID:          uploadID,
		WorkspaceID: workspaceID.String(),
		UserID:      userID.String(),
		Filename:    input.Filename,
		ContentType: input.ContentType,
		TotalSize:   input.TotalSize,
		ChunkSize:   input.ChunkSize,
		Offset:      0,
		TmpPath:     tmpPath,
		Manifest:    input.ScanManifest, // M16: stored for finalize hash check
	}
	h.sessions.Store(uploadID, session)

	setTUSHeaders(w)
	w.Header().Set("Location", fmt.Sprintf("/api/v1/uploads/%s", uploadID))
	w.Header().Set("Upload-Offset", "0")
	w.Header().Set("Upload-Length", strconv.FormatInt(input.TotalSize, 10))
	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"upload_id":  uploadID,
		"chunk_size": input.ChunkSize,
		"offset":     0,
	})
}

// UploadChunk appends a chunk to an existing session. PATCH /api/v1/uploads/{uploadId}
func (h *ChunkedUploadHandler) UploadChunk(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	val, ok := h.sessions.Load(uploadID)
	if !ok {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	session := val.(*uploadSession)

	// Parse Upload-Offset header (TUS-like)
	offsetStr := r.Header.Get("Upload-Offset")
	if offsetStr != "" {
		offset, err := strconv.ParseInt(offsetStr, 10, 64)
		if err == nil && offset != session.Offset {
			http.Error(w, fmt.Sprintf(`{"error":"offset mismatch: expected %d, got %d"}`, session.Offset, offset), http.StatusConflict)
			return
		}
	}

	// Append chunk to temp file
	f, err := os.OpenFile(session.TmpPath, os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		http.Error(w, `{"error":"failed to open upload file"}`, http.StatusInternalServerError)
		return
	}

	written, err := io.Copy(f, r.Body)
	f.Close()
	if err != nil {
		http.Error(w, `{"error":"failed to write chunk"}`, http.StatusInternalServerError)
		return
	}

	session.Offset += written

	setTUSHeaders(w)
	w.Header().Set("Upload-Offset", strconv.FormatInt(session.Offset, 10))

	// Check if upload is complete
	if session.Offset >= session.TotalSize {
		// Finalize: compute hash, store in storage provider, create asset
		result, err := h.finalizeUpload(r, session)
		if err != nil {
			// F-003 (audit 2026-04-10): map M16 Tier D scan errors to 422 so
			// clients can distinguish "bytes tampered" / "format corrupt" from
			// generic server failures. Any other finalize error stays 500.
			if errors.Is(err, service.ErrScanHashMismatch) {
				http.Error(w, `{"error":"SCAN_HASH_MISMATCH"}`, http.StatusUnprocessableEntity)
				return
			}
			if errors.Is(err, service.ErrScanManifestInvalid) {
				http.Error(w, `{"error":"SCAN_MANIFEST_INVALID"}`, http.StatusUnprocessableEntity)
				return
			}
			http.Error(w, fmt.Sprintf(`{"error":"finalize failed: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
		h.sessions.Delete(uploadID)
		os.Remove(session.TmpPath)
		respondJSON(w, http.StatusOK, result)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"upload_id": uploadID,
		"offset":    session.Offset,
		"complete":  false,
	})
}

// GetOffset returns the current offset. HEAD /api/v1/uploads/{uploadId}
func (h *ChunkedUploadHandler) GetOffset(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	val, ok := h.sessions.Load(uploadID)
	if !ok {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	session := val.(*uploadSession)

	setTUSHeaders(w)
	w.Header().Set("Upload-Offset", strconv.FormatInt(session.Offset, 10))
	w.Header().Set("Upload-Length", strconv.FormatInt(session.TotalSize, 10))
	w.WriteHeader(http.StatusOK)
}

// Cancel removes an upload session. DELETE /api/v1/uploads/{uploadId}
func (h *ChunkedUploadHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	val, ok := h.sessions.Load(uploadID)
	if !ok {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	session := val.(*uploadSession)

	h.sessions.Delete(uploadID)
	os.Remove(session.TmpPath)
	w.WriteHeader(http.StatusNoContent)
}

func (h *ChunkedUploadHandler) finalizeUpload(r *http.Request, session *uploadSession) (map[string]interface{}, error) {
	f, err := os.Open(session.TmpPath)
	if err != nil {
		return nil, fmt.Errorf("open temp file: %w", err)
	}
	defer f.Close()

	// Compute SHA-256
	hasher := sha256.New()
	tee := io.TeeReader(f, hasher)

	workspaceID, _ := uuid.Parse(session.WorkspaceID)
	userID, _ := uuid.Parse(session.UserID)
	assetID := uuid.New()
	ext := filepath.Ext(session.Filename)
	if ext == "" {
		parts := strings.Split(session.ContentType, "/")
		if len(parts) == 2 {
			ext = "." + parts[1]
		}
	}
	storageKey := fmt.Sprintf("%s/%s/original%s", workspaceID.String(), assetID.String(), ext)

	// Upload to storage
	if err := h.store.Put(r.Context(), storageKey, tee, session.TotalSize, session.ContentType); err != nil {
		return nil, fmt.Errorf("store: %w", err)
	}

	hash := hex.EncodeToString(hasher.Sum(nil))

	// F-003 (audit 2026-04-10): Enforce M16 Tier D final-byte assertion.
	// Previously the manifest was accepted at session-create and then never
	// verified against the actual bytes — the helpers existed but had no
	// production callsite, which is how "upload screening" became trust-the-
	// client in the live path. Now: if the session carries a manifest AND the
	// validation service is wired, verify the hash against the temp file and
	// run the cheap header/trailer spot-check. On any mismatch, roll back the
	// stored bytes and return a sentinel error that the caller maps to 422.
	if err := h.verifyManifestAtFinalize(r.Context(), session); err != nil {
		_ = h.store.Delete(r.Context(), storageKey)
		return nil, err
	}

	// Create asset record
	asset := &repository.Asset{
		ID:            assetID,
		WorkspaceID:   workspaceID,
		Filename:      session.Filename,
		ContentType:   session.ContentType,
		SizeBytes:     session.TotalSize,
		StorageKey:    storageKey,
		StorageDriver: "r2",
		Status:        "processing",
		UploadedBy:    &userID,
		ExifData:      map[string]interface{}{},
		ThumbnailURLs: map[string]string{},
	}
	// F-004 (audit 2026-04-10): persist M16 Tier D scan metadata on the asset
	// row so the moderation dashboard and audit trail can reason about the
	// upload's scan verdict. Schema columns live in migration 053. Only
	// populated when a manifest was attached AND verified (above) — otherwise
	// the fields stay nil and the moderation UI treats the asset as unscanned
	// legacy data.
	applyScanMetadata(asset, session.Manifest)
	if err := h.assetRepo.Create(r.Context(), asset); err != nil {
		return nil, fmt.Errorf("create asset: %w", err)
	}

	return map[string]interface{}{
		"asset":       asset,
		"upload_id":   session.ID,
		"sha256":      hash,
		"complete":    true,
		"storage_key": storageKey,
	}, nil
}

// verifyManifestAtFinalize runs the Tier D final-byte assertion. Returns nil
// when there is no manifest or no validator wired (legacy behavior), else
// delegates to validationSvc.VerifyAgainstBytes and also runs the cheap
// structural spot-check. Extracted as a method so it can be unit-tested
// without spinning up the full finalize path (F-003).
func (h *ChunkedUploadHandler) verifyManifestAtFinalize(ctx context.Context, session *uploadSession) error {
	if session == nil || session.Manifest == nil || h.validationSvc == nil {
		return nil
	}
	if err := h.validationSvc.VerifyAgainstBytes(ctx, session.Manifest.SHA256, session.TmpPath); err != nil {
		return fmt.Errorf("verify manifest hash: %w", err)
	}
	// Extra belt-and-suspenders: the file header/trailer must also look like
	// the declared format. This catches bytes that happen to hash-match but
	// are otherwise corrupt.
	if err := service.VerifyHeaderTrailer(session.TmpPath, session.Manifest.DetectedFormat); err != nil {
		return fmt.Errorf("verify header/trailer: %w", err)
	}
	return nil
}

// applyScanMetadata copies verified scan manifest fields onto the asset row.
// Extracted so the per-field mapping is unit-testable and so finalizeUpload
// stays readable. Nil manifest = no-op (legacy uploads).
func applyScanMetadata(asset *repository.Asset, manifest *service.UploadScanManifest) {
	if asset == nil || manifest == nil {
		return
	}
	// A verified manifest means the client's decision was "pass" — the
	// "block" case is rejected at session-create, not finalize. Anything we
	// persist here has cleared Tier D.
	status := "passed"
	engine := string(manifest.Engine)
	policy := manifest.PolicyVersion
	risk := manifest.RiskScore
	manifestHash := manifest.SHA256

	asset.UploadScanStatus = &status
	asset.UploadScanEngine = &engine
	asset.UploadScanPolicyVersion = &policy
	asset.UploadScanRiskScore = &risk
	asset.UploadScanManifestHash = &manifestHash

	if len(manifest.Findings) > 0 {
		findings := make([]map[string]interface{}, 0, len(manifest.Findings))
		for _, f := range manifest.Findings {
			entry := map[string]interface{}{
				"category": f.Category,
				"severity": f.Severity,
				"message":  f.Message,
			}
			if f.Offset != nil {
				entry["offset"] = *f.Offset
			}
			findings = append(findings, entry)
		}
		asset.UploadScanFindings = findings
	}
}
