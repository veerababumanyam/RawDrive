package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
)

// ── fakes ────────────────────────────────────────────────────────────────

type fakeAssetResolver struct {
	asset *repository.Asset
	err   error
}

func (f *fakeAssetResolver) GetByIDAndWorkspace(_ context.Context, _, _ uuid.UUID) (*repository.Asset, error) {
	return f.asset, f.err
}

type deleteCall struct {
	asset  uuid.UUID
	source string
}

type fakeFaceStore struct {
	deletes  []deleteCall
	stored   []*ai.FaceCluster
	delErr   error
	storeErr error
}

func (f *fakeFaceStore) DeleteFacesByAssetAndSource(_ context.Context, assetID uuid.UUID, source string) error {
	f.deletes = append(f.deletes, deleteCall{asset: assetID, source: source})
	return f.delErr
}

func (f *fakeFaceStore) StoreFaces(_ context.Context, faces []*ai.FaceCluster) error {
	f.stored = append(f.stored, faces...)
	return f.storeErr
}

type fakeIndexer struct {
	recEnabled bool
	recErr     error
	clustered  []*ai.FaceCluster
	clusterErr error
}

func (f *fakeIndexer) IsFaceRecognitionEnabled(_ context.Context, _ uuid.UUID) (bool, error) {
	return f.recEnabled, f.recErr
}

func (f *fakeIndexer) ClusterFaces(_ context.Context, faces []*ai.FaceCluster, _ uuid.UUID) error {
	f.clustered = append(f.clustered, faces...)
	return f.clusterErr
}

type fakeFlag struct{ enabled bool }

func (f fakeFlag) IsEnabled(_ context.Context, _ uuid.UUID) (bool, string) {
	return f.enabled, "test"
}

// ── helpers ──────────────────────────────────────────────────────────────

func emb512() []float32 { return make([]float32, 512) }

func faceReqBody(t *testing.T, faces []clientFaceInput, galleryID *string) []byte {
	t.Helper()
	b, err := json.Marshal(storeFaceEmbeddingsRequest{GalleryID: galleryID, Faces: faces})
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	return b
}

func newFaceEmbReq(idParam string, ws uuid.UUID, body []byte) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/assets/"+idParam+"/face-embeddings", bytes.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", idParam)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = middleware.WithJWTClaims(ctx, map[string]interface{}{"sub": uuid.NewString(), "workspace_id": ws.String()})
	ctx = middleware.WithWorkspaceID(ctx, ws.String())
	return req.WithContext(ctx)
}

func okDeps() (*fakeAssetResolver, *fakeFaceStore, *fakeIndexer, fakeFlag) {
	return &fakeAssetResolver{asset: &repository.Asset{}},
		&fakeFaceStore{},
		&fakeIndexer{recEnabled: true},
		fakeFlag{enabled: true}
}

// ── tests ────────────────────────────────────────────────────────────────

func TestFaceEmbeddings_HappyPath_StoresAndClusters(t *testing.T) {
	assets, store, indexer, flag := okDeps()
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	ws := uuid.New()
	assetID := uuid.New()
	body := faceReqBody(t, []clientFaceInput{
		{FaceIndex: 0, BoundingBox: ai.BoundingBox{X: 0.1, Y: 0.1, W: 0.2, H: 0.2}, Embedding: emb512(), DetScore: 0.99},
	}, nil)

	rec := httptest.NewRecorder()
	h.StoreEmbeddings(rec, newFaceEmbReq(assetID.String(), ws, body))

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if len(store.stored) != 1 {
		t.Fatalf("want 1 stored face, got %d", len(store.stored))
	}
	if store.stored[0].Source != "client" {
		t.Errorf("want Source=client, got %q", store.stored[0].Source)
	}
	if store.stored[0].AssetID != assetID || store.stored[0].WorkspaceID != ws {
		t.Errorf("face not scoped to asset/workspace: %+v", store.stored[0])
	}
	if len(indexer.clustered) != 1 {
		t.Errorf("ClusterFaces not called on stored faces (got %d)", len(indexer.clustered))
	}
	// idempotent re-POST guard: client faces dropped first, source-scoped.
	if len(store.deletes) != 1 || store.deletes[0].source != "client" || store.deletes[0].asset != assetID {
		t.Errorf("want one source-scoped delete of client faces, got %+v", store.deletes)
	}
}

func TestFaceEmbeddings_FlagOff_404(t *testing.T) {
	assets, store, indexer, _ := okDeps()
	h := NewFaceEmbeddingHandler(assets, store, indexer, fakeFlag{enabled: false})

	rec := httptest.NewRecorder()
	body := faceReqBody(t, []clientFaceInput{{Embedding: emb512()}}, nil)
	h.StoreEmbeddings(rec, newFaceEmbReq(uuid.NewString(), uuid.New(), body))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("flag off should 404, got %d", rec.Code)
	}
	if len(store.stored) != 0 {
		t.Error("must not store when flag off")
	}
}

func TestFaceEmbeddings_BiometricOptInDisabled_403(t *testing.T) {
	assets, store, _, flag := okDeps()
	indexer := &fakeIndexer{recEnabled: false}
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	rec := httptest.NewRecorder()
	body := faceReqBody(t, []clientFaceInput{{Embedding: emb512()}}, nil)
	h.StoreEmbeddings(rec, newFaceEmbReq(uuid.NewString(), uuid.New(), body))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("face recognition disabled should 403, got %d", rec.Code)
	}
	if len(store.stored) != 0 {
		t.Error("must not store when biometric opt-in is off")
	}
}

func TestFaceEmbeddings_CrossTenantAsset_404(t *testing.T) {
	// resolver returns nil → asset not owned by caller's workspace.
	assets := &fakeAssetResolver{asset: nil}
	store, indexer, flag := &fakeFaceStore{}, &fakeIndexer{recEnabled: true}, fakeFlag{enabled: true}
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	rec := httptest.NewRecorder()
	body := faceReqBody(t, []clientFaceInput{{Embedding: emb512()}}, nil)
	h.StoreEmbeddings(rec, newFaceEmbReq(uuid.NewString(), uuid.New(), body))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant asset should 404, got %d", rec.Code)
	}
}

func TestFaceEmbeddings_InvalidAssetID_400(t *testing.T) {
	assets, store, indexer, flag := okDeps()
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	rec := httptest.NewRecorder()
	body := faceReqBody(t, []clientFaceInput{{Embedding: emb512()}}, nil)
	h.StoreEmbeddings(rec, newFaceEmbReq("not-a-uuid", uuid.New(), body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid asset id should 400, got %d", rec.Code)
	}
}

func TestFaceEmbeddings_WrongDimension_400(t *testing.T) {
	assets, store, indexer, flag := okDeps()
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	rec := httptest.NewRecorder()
	body := faceReqBody(t, []clientFaceInput{{Embedding: make([]float32, 128)}}, nil)
	h.StoreEmbeddings(rec, newFaceEmbReq(uuid.NewString(), uuid.New(), body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("128-d embedding should 400, got %d", rec.Code)
	}
	if len(store.stored) != 0 {
		t.Error("must not store a wrong-dimension embedding")
	}
}

func TestFaceEmbeddings_EmptyFaces_400(t *testing.T) {
	assets, store, indexer, flag := okDeps()
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	rec := httptest.NewRecorder()
	body := faceReqBody(t, []clientFaceInput{}, nil)
	h.StoreEmbeddings(rec, newFaceEmbReq(uuid.NewString(), uuid.New(), body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty faces should 400, got %d", rec.Code)
	}
}

func TestFaceEmbeddings_TooManyFaces_400(t *testing.T) {
	assets, store, indexer, flag := okDeps()
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	faces := make([]clientFaceInput, 51)
	for i := range faces {
		faces[i] = clientFaceInput{Embedding: emb512()}
	}
	rec := httptest.NewRecorder()
	h.StoreEmbeddings(rec, newFaceEmbReq(uuid.NewString(), uuid.New(), faceReqBody(t, faces, nil)))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("too many faces should 400, got %d", rec.Code)
	}
}

func TestFaceEmbeddings_InvalidGalleryID_400(t *testing.T) {
	assets, store, indexer, flag := okDeps()
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	bad := "not-a-uuid"
	body := faceReqBody(t, []clientFaceInput{{Embedding: emb512()}}, &bad)
	rec := httptest.NewRecorder()
	h.StoreEmbeddings(rec, newFaceEmbReq(uuid.NewString(), uuid.New(), body))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid gallery_id should 400, got %d", rec.Code)
	}
	if len(store.stored) != 0 {
		t.Error("must not store on invalid gallery_id")
	}
}

// JSON itself cannot carry NaN/Inf (the decoder rejects them, so such a body
// 400s at decode), but allFinite32/boxFinite are defense-in-depth guards on the
// values that DO decode — test them directly so the index can never be poisoned
// with non-finite vectors that would break cosine search.
func TestFaceEmbeddings_FiniteGuards(t *testing.T) {
	if !allFinite32([]float32{0, 1, -1, 0.5}) {
		t.Error("allFinite32 should accept finite values")
	}
	if allFinite32([]float32{0, float32(math.Inf(1))}) {
		t.Error("allFinite32 must reject +Inf")
	}
	if allFinite32([]float32{float32(math.NaN())}) {
		t.Error("allFinite32 must reject NaN")
	}
	if !boxFinite(ai.BoundingBox{X: 0.1, Y: 0.1, W: 0.2, H: 0.2}) {
		t.Error("boxFinite should accept a finite box")
	}
	if boxFinite(ai.BoundingBox{X: math.NaN()}) {
		t.Error("boxFinite must reject NaN")
	}
}
