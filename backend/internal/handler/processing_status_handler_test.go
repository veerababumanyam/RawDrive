package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
)

type fakeProcessingAssetRepo struct {
	asset        *repository.Asset
	retryGallery uuid.UUID
	retryWS      uuid.UUID
	retryCount   int64
}

func (f *fakeProcessingAssetRepo) GetByID(context.Context, uuid.UUID) (*repository.Asset, error) {
	return f.asset, nil
}

func (f *fakeProcessingAssetRepo) RetryFailedByGallery(_ context.Context, galleryID, workspaceID uuid.UUID) (int64, error) {
	f.retryGallery = galleryID
	f.retryWS = workspaceID
	return f.retryCount, nil
}

func TestProcessingStatusIncludesProcessingError(t *testing.T) {
	reason := "generate thumbnails: unsupported image format"
	assetID := uuid.New()
	h := NewProcessingStatusHandler(&fakeProcessingAssetRepo{
		asset: &repository.Asset{ID: assetID, Status: "error", ProcessingError: &reason},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/assets/"+assetID.String()+"/processing-status", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", assetID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetStatus(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rr.Code, rr.Body.String())
	}
	var payload struct {
		Data struct {
			ProcessingError string `json:"processing_error"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Data.ProcessingError != reason {
		t.Fatalf("processing_error = %q, want %q", payload.Data.ProcessingError, reason)
	}
}

func TestBulkRetryResetsFailedRowsForWorkspace(t *testing.T) {
	galleryID := uuid.New()
	workspaceID := uuid.New()
	repo := &fakeProcessingAssetRepo{retryCount: 3}
	h := NewProcessingStatusHandler(repo)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/galleries/"+galleryID.String()+"/assets/retry-failed", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("galleryId", galleryID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = middleware.WithWorkspaceID(ctx, workspaceID.String())
	req = req.WithContext(ctx)
	rr := httptest.NewRecorder()

	h.BulkRetry(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rr.Code, rr.Body.String())
	}
	if repo.retryGallery != galleryID || repo.retryWS != workspaceID {
		t.Fatalf("retry called with gallery=%s workspace=%s", repo.retryGallery, repo.retryWS)
	}
	var payload struct {
		Data struct {
			Retried int64 `json:"retried"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Data.Retried != 3 {
		t.Fatalf("retried = %d, want 3", payload.Data.Retried)
	}
}
