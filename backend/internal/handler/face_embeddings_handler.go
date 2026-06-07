package handler

// face_embeddings_handler.go — client-computed face-embedding ingest
// (epic: seamless Find Me on E2EE galleries, slice 1).
//
// On client-side end-to-end-encrypted galleries the server only ever sees
// ciphertext, so the server-side face worker cannot detect faces or build a
// usable face index. Instead, the photographer's browser (which holds the
// plaintext + the gallery key) detects faces + computes 512-d insightface
// buffalo_l embeddings at upload, and POSTs ONLY the embeddings + bounding
// boxes here — no plaintext image, so E2EE is preserved. We store them in the
// existing face_clusters index and run the same server-side clustering so the
// People tab and guest Find Me work on encrypted galleries.
//
// This endpoint is gated behind the client_face_index feature flag (off by
// default) AND the workspace biometric opt-in (face_recognition_enabled) so it
// is inert until deliberately enabled and never stores biometric data for a
// workspace that hasn't consented.

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/face"
)

const (
	// clientFaceSource marks faces ingested from the browser, distinct from the
	// server-detected "insightface" source so DeleteFacesByAssetAndSource can
	// replace client faces idempotently without touching server detections.
	clientFaceSource = "client"
	// faceEmbeddingDim is the insightface buffalo_l dimension; the pgvector
	// column is vector(512) (migration 149), so anything else fails on insert —
	// reject it up front with a clear 400.
	faceEmbeddingDim = 512
	// maxClientFacesPerAsset bounds a single ingest request (DoS / abuse guard).
	maxClientFacesPerAsset = 50
	// maxFaceEmbeddingsBody bounds the request body. 50 faces × 512 JSON floats
	// is well under 1 MB; 4 MB is a generous ceiling.
	maxFaceEmbeddingsBody = 4 << 20
	// maxFaceIndexImageBody caps the downscaled upload frame sent by the E2EE
	// browser path. face-svc itself caps requests at 20 MB; this public API
	// stays tighter because the client sends display-sized WebP, not originals.
	maxFaceIndexImageBody = 10 << 20
)

var errFaceIndexImageTooLarge = http.ErrBodyReadAfterClose

// faceEmbeddingStore is the persistence surface the handler needs.
// Satisfied by *ai.FaceRepo.
type faceEmbeddingStore interface {
	DeleteFacesByAssetAndSource(ctx context.Context, assetID uuid.UUID, source string) error
	StoreFaces(ctx context.Context, faces []*ai.FaceCluster) error
}

// faceClusterIndexer is the clustering + biometric-gate surface the handler
// needs. Satisfied by *ai.FaceService.
type faceClusterIndexer interface {
	IsFaceRecognitionEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, error)
	IsGalleryFaceDetectionEnabled(ctx context.Context, galleryID uuid.UUID) (bool, error)
	ClusterFaces(ctx context.Context, faces []*ai.FaceCluster, workspaceID uuid.UUID) error
}

// faceImageIndexer indexes a short-lived caller-supplied image frame into the
// same face_clusters table. Satisfied by *ai.FaceService.
type faceImageIndexer interface {
	DetectImageAndStoreFaces(ctx context.Context, assetID, workspaceID uuid.UUID, galleryID *uuid.UUID, imageData []byte, filename, source string) (int, error)
}

type assetGalleryMembershipChecker interface {
	AssetBelongsToGallery(ctx context.Context, assetID, galleryID, workspaceID uuid.UUID) (bool, error)
}

// clientFaceIndexGate is the feature-flag surface. Satisfied by
// *featureflag.ClientFaceIndexFlag.
type clientFaceIndexGate interface {
	IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string)
}

// FaceEmbeddingHandler serves POST /api/v1/assets/{id}/face-embeddings.
type FaceEmbeddingHandler struct {
	assets        assetWorkspaceResolver
	membership    assetGalleryMembershipChecker
	store         faceEmbeddingStore
	indexer       faceClusterIndexer
	imageIndexer  faceImageIndexer
	flag          clientFaceIndexGate
	plaintextGate clientFaceIndexGate
}

// NewFaceEmbeddingHandler wires the ingest handler.
func NewFaceEmbeddingHandler(assets assetWorkspaceResolver, store faceEmbeddingStore, indexer faceClusterIndexer, flag clientFaceIndexGate) *FaceEmbeddingHandler {
	h := &FaceEmbeddingHandler{assets: assets, store: store, indexer: indexer, flag: flag}
	if membership, ok := assets.(assetGalleryMembershipChecker); ok {
		h.membership = membership
	}
	return h
}

// WithImageIndexer enables server-assisted indexing of an encrypted upload's
// short-lived, downscaled client frame. Without it, /face-index-image fails
// closed with 503 while /face-embeddings continues to work.
func (h *FaceEmbeddingHandler) WithImageIndexer(indexer faceImageIndexer) *FaceEmbeddingHandler {
	h.imageIndexer = indexer
	return h
}

// WithPlaintextFaceIndexGate gates the server-side plaintext face-index path
// (StoreIndexImage / POST /face-index-image). That path accepts a decrypted
// upload frame and runs face-svc server-side, so it defeats the E2EE "server
// never sees plaintext" contract. The path fails CLOSED (404) until a gate is
// wired AND enabled, so the privacy contract holds by default until the
// client-side embedding path (slice 2b) is unblocked. Satisfied by
// *featureflag.ServerPlaintextFaceIndexFlag.
// See docs/decisions/faceid-licensing-and-e2ee-posture.md.
func (h *FaceEmbeddingHandler) WithPlaintextFaceIndexGate(gate clientFaceIndexGate) *FaceEmbeddingHandler {
	h.plaintextGate = gate
	return h
}

type clientFaceInput struct {
	FaceIndex   int            `json:"face_index"`
	BoundingBox ai.BoundingBox `json:"bounding_box"`
	Embedding   []float32      `json:"embedding"`
	DetScore    float64        `json:"det_score"`
}

type storeFaceEmbeddingsRequest struct {
	// GalleryID optionally scopes the faces to a gallery (denormalized on the
	// row; gallery-scoped search also JOINs gallery_assets so this is best-effort).
	GalleryID *string           `json:"gallery_id,omitempty"`
	Faces     []clientFaceInput `json:"faces"`
}

type storeFaceEmbeddingsResponse struct {
	Stored int `json:"stored"`
}

// StoreEmbeddings ingests client-computed face embeddings for one asset.
func (h *FaceEmbeddingHandler) StoreEmbeddings(w http.ResponseWriter, r *http.Request) {
	assetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	// Tenant-ownership guard (IDOR-safe 404). Also yields the caller workspace.
	_, workspaceID, ok := guardAssetWorkspace(w, r, h.assets, assetID)
	if !ok {
		return
	}

	// Feature flag — the ingest path is inert until client_face_index is on.
	// 404 (not 403) so the endpoint's existence isn't disclosed while disabled.
	if enabled, _ := h.flag.IsEnabled(r.Context(), workspaceID); !enabled {
		http.Error(w, `{"error":"feature not available"}`, http.StatusNotFound)
		return
	}

	// Biometric opt-in gate (workspaces.face_recognition_enabled — DPDP/GDPR).
	recEnabled, err := h.indexer.IsFaceRecognitionEnabled(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"face recognition status check failed"}`, http.StatusInternalServerError)
		return
	}
	if !recEnabled {
		http.Error(w, `{"error":"face recognition disabled for this workspace"}`, http.StatusForbidden)
		return
	}

	// Parse + validate the payload.
	r.Body = http.MaxBytesReader(w, r.Body, maxFaceEmbeddingsBody)
	var req storeFaceEmbeddingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if len(req.Faces) == 0 {
		http.Error(w, `{"error":"at least one face is required"}`, http.StatusBadRequest)
		return
	}
	if len(req.Faces) > maxClientFacesPerAsset {
		http.Error(w, `{"error":"too many faces in one request"}`, http.StatusBadRequest)
		return
	}

	var galleryID *uuid.UUID
	if req.GalleryID != nil && *req.GalleryID != "" {
		gid, perr := uuid.Parse(*req.GalleryID)
		if perr != nil {
			http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
			return
		}
		if h.membership != nil {
			ok, merr := h.membership.AssetBelongsToGallery(r.Context(), assetID, gid, workspaceID)
			if merr != nil {
				http.Error(w, `{"error":"gallery membership check failed"}`, http.StatusInternalServerError)
				return
			}
			if !ok {
				http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
				return
			}
		}
		galleryEnabled, gerr := h.indexer.IsGalleryFaceDetectionEnabled(r.Context(), gid)
		if gerr != nil {
			http.Error(w, `{"error":"face detection status check failed"}`, http.StatusInternalServerError)
			return
		}
		if !galleryEnabled {
			if err := h.store.DeleteFacesByAssetAndSource(r.Context(), assetID, clientFaceSource); err != nil {
				http.Error(w, `{"error":"failed to replace existing faces"}`, http.StatusInternalServerError)
				return
			}
			respondJSON(w, http.StatusOK, storeFaceEmbeddingsResponse{Stored: 0})
			return
		}
		galleryID = &gid
	}

	clusters := make([]*ai.FaceCluster, 0, len(req.Faces))
	for i, f := range req.Faces {
		if len(f.Embedding) != faceEmbeddingDim {
			http.Error(w, `{"error":"embedding must have exactly 512 dimensions"}`, http.StatusBadRequest)
			return
		}
		if !allFinite32(f.Embedding) || !boxFinite(f.BoundingBox) {
			http.Error(w, `{"error":"embedding/bounding_box contains non-finite values"}`, http.StatusBadRequest)
			return
		}
		clusters = append(clusters, &ai.FaceCluster{
			WorkspaceID: workspaceID,
			AssetID:     assetID,
			GalleryID:   galleryID,
			// Server-assigned canonical order; ignore any client-supplied index
			// so faces are never duplicated or gapped in the index.
			FaceIndex:   i,
			BoundingBox: f.BoundingBox,
			Embedding:   f.Embedding,
			Confidence:  f.DetScore,
			Source:      clientFaceSource,
		})
	}

	// Idempotent re-POST: drop only this asset's prior CLIENT faces, never the
	// server-detected ones, then re-store + re-cluster.
	if err := h.store.DeleteFacesByAssetAndSource(r.Context(), assetID, clientFaceSource); err != nil {
		http.Error(w, `{"error":"failed to replace existing faces"}`, http.StatusInternalServerError)
		return
	}
	if err := h.store.StoreFaces(r.Context(), clusters); err != nil {
		http.Error(w, `{"error":"failed to store faces"}`, http.StatusInternalServerError)
		return
	}
	if err := h.indexer.ClusterFaces(r.Context(), clusters, workspaceID); err != nil {
		http.Error(w, `{"error":"failed to cluster faces"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, storeFaceEmbeddingsResponse{Stored: len(clusters)})
}

// StoreIndexImage ingests a short-lived upload frame for encrypted galleries.
// The browser derives the frame from the plaintext it already has while
// generating encrypted WebP derivatives, then sends it here over the
// authenticated owner API. The backend never persists the image bytes; it runs
// face-svc and stores only embeddings/bounding boxes in face_clusters.
//
// NOTE: this path transiently exposes the DECRYPTED frame to the server, which
// defeats the E2EE "server never sees plaintext" contract. It is therefore
// gated behind WithPlaintextFaceIndexGate (server_face_index_plaintext, OFF by
// default) and fails closed when the gate is absent or disabled, so the
// contract holds until the client-side embedding path (slice 2b) ships. See
// docs/decisions/faceid-licensing-and-e2ee-posture.md.
func (h *FaceEmbeddingHandler) StoreIndexImage(w http.ResponseWriter, r *http.Request) {
	assetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	asset, workspaceID, ok := guardAssetWorkspace(w, r, h.assets, assetID)
	if !ok {
		return
	}

	// Plaintext-frame kill switch (E2EE law). Fail closed: if the gate is not
	// wired, or is disabled for this workspace, refuse the path so the server
	// never reads a decrypted frame. Disclosure-safe 404 (mirrors the
	// client-face-index gate on StoreEmbeddings) so the endpoint's existence
	// isn't revealed while disabled — checked BEFORE any request body is read.
	if h.plaintextGate == nil {
		http.Error(w, `{"error":"feature not available"}`, http.StatusNotFound)
		return
	}
	if enabled, _ := h.plaintextGate.IsEnabled(r.Context(), workspaceID); !enabled {
		http.Error(w, `{"error":"feature not available"}`, http.StatusNotFound)
		return
	}

	if asset == nil || !strings.HasPrefix(strings.ToLower(strings.TrimSpace(asset.ContentType)), "image/") {
		http.Error(w, `{"error":"asset is not an image"}`, http.StatusBadRequest)
		return
	}
	if h.imageIndexer == nil {
		http.Error(w, `{"error":"face_index_unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	recEnabled, err := h.indexer.IsFaceRecognitionEnabled(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"face recognition status check failed"}`, http.StatusInternalServerError)
		return
	}
	if !recEnabled {
		http.Error(w, `{"error":"face recognition disabled for this workspace"}`, http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxFaceIndexImageBody)
	if err := r.ParseMultipartForm(maxFaceIndexImageBody); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			http.Error(w, `{"error":"image file too large"}`, http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, `{"error":"could not parse index image"}`, http.StatusBadRequest)
		return
	}

	var galleryID *uuid.UUID
	if raw := strings.TrimSpace(r.FormValue("gallery_id")); raw != "" {
		gid, perr := uuid.Parse(raw)
		if perr != nil {
			http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
			return
		}
		if h.membership != nil {
			ok, merr := h.membership.AssetBelongsToGallery(r.Context(), assetID, gid, workspaceID)
			if merr != nil {
				http.Error(w, `{"error":"gallery membership check failed"}`, http.StatusInternalServerError)
				return
			}
			if !ok {
				http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
				return
			}
		}
		galleryEnabled, gerr := h.indexer.IsGalleryFaceDetectionEnabled(r.Context(), gid)
		if gerr != nil {
			http.Error(w, `{"error":"face detection status check failed"}`, http.StatusInternalServerError)
			return
		}
		if !galleryEnabled {
			if err := h.store.DeleteFacesByAssetAndSource(r.Context(), assetID, clientFaceSource); err != nil {
				http.Error(w, `{"error":"failed to replace existing faces"}`, http.StatusInternalServerError)
				return
			}
			respondJSON(w, http.StatusOK, storeFaceEmbeddingsResponse{Stored: 0})
			return
		}
		galleryID = &gid
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, `{"error":"image file required (form field 'image')"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	imageData, err := readLimitedMultipartFile(file, maxFaceIndexImageBody)
	if err != nil {
		if err == errFaceIndexImageTooLarge {
			http.Error(w, `{"error":"image file too large"}`, http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, `{"error":"could not read index image"}`, http.StatusBadRequest)
		return
	}
	if len(imageData) == 0 {
		http.Error(w, `{"error":"empty image"}`, http.StatusBadRequest)
		return
	}

	filename := "face-index.webp"
	if header != nil && strings.TrimSpace(header.Filename) != "" {
		filename = header.Filename
	}
	stored, err := h.imageIndexer.DetectImageAndStoreFaces(r.Context(), assetID, workspaceID, galleryID, imageData, filename, clientFaceSource)
	if err != nil {
		log.Printf("face index image: asset=%s workspace=%s gallery=%s failed: %v", assetID, workspaceID, uuidValueForLog(galleryID), err)
		if errors.Is(err, face.ErrServiceUnavailable) {
			http.Error(w, `{"error":"face_index_unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		http.Error(w, `{"error":"failed to index faces"}`, http.StatusBadGateway)
		return
	}

	respondJSON(w, http.StatusOK, storeFaceEmbeddingsResponse{Stored: stored})
}

func uuidValueForLog(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

func readLimitedMultipartFile(file multipart.File, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errFaceIndexImageTooLarge
	}
	return data, nil
}

func allFinite32(v []float32) bool {
	for _, x := range v {
		f := float64(x)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return false
		}
	}
	return true
}

func boxFinite(b ai.BoundingBox) bool {
	for _, x := range []float64{b.X, b.Y, b.W, b.H} {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return false
		}
	}
	return true
}
