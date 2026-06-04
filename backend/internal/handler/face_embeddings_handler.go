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
	"math"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/ai"
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
)

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
	ClusterFaces(ctx context.Context, faces []*ai.FaceCluster, workspaceID uuid.UUID) error
}

// clientFaceIndexGate is the feature-flag surface. Satisfied by
// *featureflag.ClientFaceIndexFlag.
type clientFaceIndexGate interface {
	IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string)
}

// FaceEmbeddingHandler serves POST /api/v1/assets/{id}/face-embeddings.
type FaceEmbeddingHandler struct {
	assets  assetWorkspaceResolver
	store   faceEmbeddingStore
	indexer faceClusterIndexer
	flag    clientFaceIndexGate
}

// NewFaceEmbeddingHandler wires the ingest handler.
func NewFaceEmbeddingHandler(assets assetWorkspaceResolver, store faceEmbeddingStore, indexer faceClusterIndexer, flag clientFaceIndexGate) *FaceEmbeddingHandler {
	return &FaceEmbeddingHandler{assets: assets, store: store, indexer: indexer, flag: flag}
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
