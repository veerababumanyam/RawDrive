package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/repository"
)

// These tests pin the F-1 dimension guard on POST /public/galleries/{slug}/face-match.
//
// The face_clusters embedding column is vector(512) (migration 149). A client
// that posts a wrong-dimension vector — e.g. a face-api.js 128-d descriptor or a
// 512-bin pixel histogram — otherwise flows straight into FindSimilarFacesInGallery
// and fails as an opaque 500 (dimension mismatch) or, worse, returns colour-similar
// garbage. The guard rejects any non-512 embedding with a clear 400 before the
// pgvector query. The endpoint is retained for the Phase-B client-side buffalo_l
// parity path, which posts genuine 512-d embeddings.

// faceMatchRequestWithBody builds a POST request to the face-match endpoint with a
// JSON body and the chi {slug} route param populated, so FaceMatch can be exercised
// handler-direct without a router or a database.
func faceMatchRequestWithBody(t *testing.T, body faceMatchRequest) *http.Request {
	t.Helper()
	buf, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal face-match body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/public/galleries/wedding/face-match", bytes.NewReader(buf))
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("slug", "wedding")
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))
}

// faceIDEnabledGallery is a published, public gallery with the per-gallery FaceID
// opt-in switched on, so FaceMatch reaches the embedding path (and the dim guard).
func faceIDEnabledGallery() *repository.Gallery {
	g := publishedPublicGallery()
	g.Settings = map[string]interface{}{"faceid_enabled": true}
	return g
}

// newFaceMatchHandler wires the handler against a faceid-enabled public gallery
// with an intentionally-nil faceRepo, so a request that clears the dim guard ends
// at a deterministic 503 (faceid_service_unavailable) rather than touching a DB.
func newFaceMatchHandler() *PublicGalleryHandler {
	return NewPublicGalleryHandler(&fakePublicGalleryResolver{gallery: faceIDEnabledGallery()}, nil, nil)
}

// embeddingOfDim returns an embedding of length n (constant non-zero values).
func embeddingOfDim(n int) []float32 {
	v := make([]float32, n)
	for i := range v {
		v[i] = 0.1
	}
	return v
}

// TestFaceMatch_RejectsNon512Embedding is the F-1 regression: any client embedding
// whose dimension is not 512 must be rejected with a clear 400 embedding_dim_invalid
// BEFORE it reaches the vector(512) pgvector query.
func TestFaceMatch_RejectsNon512Embedding(t *testing.T) {
	for _, dim := range []int{1, 64, 128, 256, 511, 513, 1024} {
		t.Run(fmt.Sprintf("dim_%d", dim), func(t *testing.T) {
			h := newFaceMatchHandler()
			rec := httptest.NewRecorder()
			h.FaceMatch(rec, faceMatchRequestWithBody(t, faceMatchRequest{
				Embedding:    embeddingOfDim(dim),
				ConsentGiven: true,
			}))
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("dim=%d: want 400, got %d body=%s", dim, rec.Code, rec.Body.String())
			}
			if !strings.Contains(rec.Body.String(), "embedding_dim_invalid") {
				t.Fatalf("dim=%d: want embedding_dim_invalid, got body=%s", dim, rec.Body.String())
			}
		})
	}
}

// TestFaceMatch_EmptyEmbedding_ReturnsEmbeddingRequired preserves the existing
// zero-length behavior, which keeps its own clearer message ahead of the dim guard.
func TestFaceMatch_EmptyEmbedding_ReturnsEmbeddingRequired(t *testing.T) {
	h := newFaceMatchHandler()
	rec := httptest.NewRecorder()
	h.FaceMatch(rec, faceMatchRequestWithBody(t, faceMatchRequest{
		Embedding:    nil,
		ConsentGiven: true,
	}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty embedding: want 400, got %d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "embedding required") {
		t.Fatalf("empty embedding: want \"embedding required\", got body=%s", rec.Body.String())
	}
}

// TestFaceMatch_Valid512Embedding_PassesDimGuard proves a correct 512-d embedding
// is NOT rejected by the dimension guard — it passes through to the match path
// (here failing only on the intentionally-unwired faceRepo with 503).
func TestFaceMatch_Valid512Embedding_PassesDimGuard(t *testing.T) {
	h := newFaceMatchHandler()
	rec := httptest.NewRecorder()
	h.FaceMatch(rec, faceMatchRequestWithBody(t, faceMatchRequest{
		Embedding:    embeddingOfDim(512),
		ConsentGiven: true,
	}))
	if strings.Contains(rec.Body.String(), "embedding_dim_invalid") {
		t.Fatalf("valid 512-d embedding must pass the dim guard, got body=%s", rec.Body.String())
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("512-d embedding should clear the guard and reach the unwired faceRepo (503); got %d body=%s", rec.Code, rec.Body.String())
	}
}
