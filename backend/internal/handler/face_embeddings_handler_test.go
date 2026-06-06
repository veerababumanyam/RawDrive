package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"mime/multipart"
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
	asset           *repository.Asset
	err             error
	galleryOK       bool
	galleryCheck    bool
	galleryCheckErr error
}

func (f *fakeAssetResolver) GetByIDAndWorkspace(_ context.Context, _, _ uuid.UUID) (*repository.Asset, error) {
	return f.asset, f.err
}

func (f *fakeAssetResolver) AssetBelongsToGallery(_ context.Context, _, _, _ uuid.UUID) (bool, error) {
	f.galleryCheck = true
	return f.galleryOK, f.galleryCheckErr
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
	recEnabled     bool
	recErr         error
	galleryEnabled bool
	galleryErr     error
	clustered      []*ai.FaceCluster
	clusterErr     error
}

func (f *fakeIndexer) IsFaceRecognitionEnabled(_ context.Context, _ uuid.UUID) (bool, error) {
	return f.recEnabled, f.recErr
}

func (f *fakeIndexer) IsGalleryFaceDetectionEnabled(_ context.Context, _ uuid.UUID) (bool, error) {
	return f.galleryEnabled, f.galleryErr
}

func (f *fakeIndexer) ClusterFaces(_ context.Context, faces []*ai.FaceCluster, _ uuid.UUID) error {
	f.clustered = append(f.clustered, faces...)
	return f.clusterErr
}

type imageIndexCall struct {
	assetID   uuid.UUID
	workspace uuid.UUID
	galleryID *uuid.UUID
	imageLen  int
	filename  string
	source    string
}

type fakeImageIndexer struct {
	calls  []imageIndexCall
	stored int
	err    error
}

func (f *fakeImageIndexer) DetectImageAndStoreFaces(_ context.Context, assetID, workspaceID uuid.UUID, galleryID *uuid.UUID, imageData []byte, filename, source string) (int, error) {
	f.calls = append(f.calls, imageIndexCall{
		assetID:   assetID,
		workspace: workspaceID,
		galleryID: galleryID,
		imageLen:  len(imageData),
		filename:  filename,
		source:    source,
	})
	return f.stored, f.err
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

func newFaceImageReq(t *testing.T, idParam string, ws uuid.UUID, image []byte, galleryID *uuid.UUID) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	if galleryID != nil {
		if err := mw.WriteField("gallery_id", galleryID.String()); err != nil {
			t.Fatalf("write gallery_id: %v", err)
		}
	}
	part, err := mw.CreateFormFile("image", "face-index.webp")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(image); err != nil {
		t.Fatalf("write image: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/assets/"+idParam+"/face-index-image", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
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
		&fakeIndexer{recEnabled: true, galleryEnabled: true},
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

func TestFaceEmbeddings_StaleGalleryID_404(t *testing.T) {
	ws := uuid.New()
	assetID := uuid.New()
	galleryID := uuid.New()
	assets := &fakeAssetResolver{asset: &repository.Asset{ID: assetID, WorkspaceID: ws}, galleryOK: false}
	store, indexer, flag := &fakeFaceStore{}, &fakeIndexer{recEnabled: true, galleryEnabled: true}, fakeFlag{enabled: true}
	h := NewFaceEmbeddingHandler(assets, store, indexer, flag)

	galleryIDString := galleryID.String()
	body := faceReqBody(t, []clientFaceInput{{Embedding: emb512()}}, &galleryIDString)
	rec := httptest.NewRecorder()
	h.StoreEmbeddings(rec, newFaceEmbReq(assetID.String(), ws, body))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("stale gallery id should 404, got %d", rec.Code)
	}
	if !assets.galleryCheck {
		t.Fatal("gallery membership should be checked")
	}
	if len(store.stored) != 0 {
		t.Error("must not store with a stale gallery id")
	}
}

func TestFaceEmbeddings_GalleryOptOutClearsClientFacesAndSkipsStore(t *testing.T) {
	ws := uuid.New()
	assetID := uuid.New()
	galleryID := uuid.New()
	assets := &fakeAssetResolver{asset: &repository.Asset{ID: assetID, WorkspaceID: ws}, galleryOK: true}
	store := &fakeFaceStore{}
	indexer := &fakeIndexer{recEnabled: true, galleryEnabled: false}
	h := NewFaceEmbeddingHandler(assets, store, indexer, fakeFlag{enabled: true})

	galleryIDString := galleryID.String()
	body := faceReqBody(t, []clientFaceInput{{Embedding: emb512()}}, &galleryIDString)
	rec := httptest.NewRecorder()
	h.StoreEmbeddings(rec, newFaceEmbReq(assetID.String(), ws, body))

	if rec.Code != http.StatusOK {
		t.Fatalf("gallery opt-out should be a clean skip, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !assets.galleryCheck {
		t.Fatal("gallery membership should be checked")
	}
	if len(store.deletes) != 1 || store.deletes[0].source != "client" || store.deletes[0].asset != assetID {
		t.Fatalf("want prior client faces cleared, got %+v", store.deletes)
	}
	if len(store.stored) != 0 {
		t.Fatal("must not store faces when gallery Find Me is disabled")
	}
	if len(indexer.clustered) != 0 {
		t.Fatal("must not cluster faces when gallery Find Me is disabled")
	}
	var out storeFaceEmbeddingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Stored != 0 {
		t.Fatalf("stored = %d, want 0", out.Stored)
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

func TestFaceIndexImage_HappyPath_IndexesClientSource(t *testing.T) {
	ws := uuid.New()
	assetID := uuid.New()
	galleryID := uuid.New()
	assets := &fakeAssetResolver{asset: &repository.Asset{ID: assetID, WorkspaceID: ws, ContentType: "image/jpeg"}, galleryOK: true}
	indexer := &fakeIndexer{recEnabled: true, galleryEnabled: true}
	imageIndexer := &fakeImageIndexer{stored: 2}
	h := NewFaceEmbeddingHandler(assets, &fakeFaceStore{}, indexer, fakeFlag{enabled: false}).
		WithImageIndexer(imageIndexer)

	rec := httptest.NewRecorder()
	h.StoreIndexImage(rec, newFaceImageReq(t, assetID.String(), ws, []byte("WEBP"), &galleryID))

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if len(imageIndexer.calls) != 1 {
		t.Fatalf("want one image-index call, got %d", len(imageIndexer.calls))
	}
	call := imageIndexer.calls[0]
	if call.assetID != assetID || call.workspace != ws || call.imageLen != 4 || call.source != "client" {
		t.Fatalf("unexpected call: %+v", call)
	}
	if call.galleryID == nil || *call.galleryID != galleryID {
		t.Fatalf("gallery_id not forwarded: %+v", call.galleryID)
	}
	if !assets.galleryCheck {
		t.Fatal("gallery membership must be checked when gallery_id is supplied")
	}
	var out storeFaceEmbeddingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Stored != 2 {
		t.Fatalf("stored = %d, want 2", out.Stored)
	}
}

func TestFaceIndexImage_DoesNotRequireClientFaceFlag(t *testing.T) {
	ws := uuid.New()
	assetID := uuid.New()
	assets := &fakeAssetResolver{asset: &repository.Asset{ID: assetID, WorkspaceID: ws, ContentType: "image/jpeg"}}
	imageIndexer := &fakeImageIndexer{}
	h := NewFaceEmbeddingHandler(assets, &fakeFaceStore{}, &fakeIndexer{recEnabled: true}, fakeFlag{enabled: false}).
		WithImageIndexer(imageIndexer)

	rec := httptest.NewRecorder()
	h.StoreIndexImage(rec, newFaceImageReq(t, assetID.String(), ws, []byte("WEBP"), nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("server-assisted image indexing should not be blocked by client_face_index flag, got %d", rec.Code)
	}
}

func TestFaceIndexImage_BiometricOptInDisabled_403(t *testing.T) {
	ws := uuid.New()
	assetID := uuid.New()
	assets := &fakeAssetResolver{asset: &repository.Asset{ID: assetID, WorkspaceID: ws, ContentType: "image/jpeg"}}
	imageIndexer := &fakeImageIndexer{}
	h := NewFaceEmbeddingHandler(assets, &fakeFaceStore{}, &fakeIndexer{recEnabled: false}, fakeFlag{enabled: false}).
		WithImageIndexer(imageIndexer)

	rec := httptest.NewRecorder()
	h.StoreIndexImage(rec, newFaceImageReq(t, assetID.String(), ws, []byte("WEBP"), nil))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("face recognition disabled should 403, got %d", rec.Code)
	}
	if len(imageIndexer.calls) != 0 {
		t.Fatal("must not index when biometric opt-in is off")
	}
}

func TestFaceIndexImage_CrossTenantAsset_404(t *testing.T) {
	assets := &fakeAssetResolver{asset: nil}
	imageIndexer := &fakeImageIndexer{}
	h := NewFaceEmbeddingHandler(assets, &fakeFaceStore{}, &fakeIndexer{recEnabled: true}, fakeFlag{enabled: false}).
		WithImageIndexer(imageIndexer)

	rec := httptest.NewRecorder()
	h.StoreIndexImage(rec, newFaceImageReq(t, uuid.NewString(), uuid.New(), []byte("WEBP"), nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant asset should 404, got %d", rec.Code)
	}
	if len(imageIndexer.calls) != 0 {
		t.Fatal("must not index a foreign asset")
	}
}

func TestFaceIndexImage_StaleGalleryID_404(t *testing.T) {
	ws := uuid.New()
	assetID := uuid.New()
	galleryID := uuid.New()
	assets := &fakeAssetResolver{asset: &repository.Asset{ID: assetID, WorkspaceID: ws, ContentType: "image/jpeg"}, galleryOK: false}
	imageIndexer := &fakeImageIndexer{}
	h := NewFaceEmbeddingHandler(assets, &fakeFaceStore{}, &fakeIndexer{recEnabled: true}, fakeFlag{enabled: false}).
		WithImageIndexer(imageIndexer)

	rec := httptest.NewRecorder()
	h.StoreIndexImage(rec, newFaceImageReq(t, assetID.String(), ws, []byte("WEBP"), &galleryID))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("stale gallery id should 404, got %d", rec.Code)
	}
	if !assets.galleryCheck {
		t.Fatal("gallery membership should be checked")
	}
	if len(imageIndexer.calls) != 0 {
		t.Fatal("must not index with a stale gallery id")
	}
}

func TestFaceIndexImage_GalleryOptOutClearsClientFacesAndSkipsIndex(t *testing.T) {
	ws := uuid.New()
	assetID := uuid.New()
	galleryID := uuid.New()
	assets := &fakeAssetResolver{asset: &repository.Asset{ID: assetID, WorkspaceID: ws, ContentType: "image/jpeg"}, galleryOK: true}
	store := &fakeFaceStore{}
	indexer := &fakeIndexer{recEnabled: true, galleryEnabled: false}
	imageIndexer := &fakeImageIndexer{stored: 2}
	h := NewFaceEmbeddingHandler(assets, store, indexer, fakeFlag{enabled: false}).
		WithImageIndexer(imageIndexer)

	rec := httptest.NewRecorder()
	h.StoreIndexImage(rec, newFaceImageReq(t, assetID.String(), ws, []byte("WEBP"), &galleryID))

	if rec.Code != http.StatusOK {
		t.Fatalf("gallery opt-out should be a clean skip, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !assets.galleryCheck {
		t.Fatal("gallery membership should be checked")
	}
	if len(store.deletes) != 1 || store.deletes[0].source != "client" || store.deletes[0].asset != assetID {
		t.Fatalf("want prior client faces cleared, got %+v", store.deletes)
	}
	if len(imageIndexer.calls) != 0 {
		t.Fatal("must not call image indexer when gallery Find Me is disabled")
	}
	var out storeFaceEmbeddingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Stored != 0 {
		t.Fatalf("stored = %d, want 0", out.Stored)
	}
}

func TestFaceIndexImage_EmptyImage_400(t *testing.T) {
	ws := uuid.New()
	assetID := uuid.New()
	assets := &fakeAssetResolver{asset: &repository.Asset{ID: assetID, WorkspaceID: ws, ContentType: "image/jpeg"}}
	imageIndexer := &fakeImageIndexer{}
	h := NewFaceEmbeddingHandler(assets, &fakeFaceStore{}, &fakeIndexer{recEnabled: true}, fakeFlag{enabled: false}).
		WithImageIndexer(imageIndexer)

	rec := httptest.NewRecorder()
	h.StoreIndexImage(rec, newFaceImageReq(t, assetID.String(), ws, nil, nil))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty image should 400, got %d", rec.Code)
	}
	if len(imageIndexer.calls) != 0 {
		t.Fatal("must not index an empty image")
	}
}
