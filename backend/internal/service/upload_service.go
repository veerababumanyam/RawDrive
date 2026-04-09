package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"path"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// UploadService handles file upload orchestration.
type UploadService struct {
	storage    storage.Provider
	assetRepo  *repository.AssetRepo
	exifSvc    *ExifService
	storageSvc *StorageAccounting
}

// NewUploadService creates a new UploadService.
func NewUploadService(store storage.Provider, assetRepo *repository.AssetRepo, exifSvc *ExifService) *UploadService {
	return &UploadService{storage: store, assetRepo: assetRepo, exifSvc: exifSvc}
}

// WithStorageAccounting attaches the storage accounting service for quota tracking.
func (s *UploadService) WithStorageAccounting(sa *StorageAccounting) *UploadService {
	s.storageSvc = sa
	return s
}

// UploadInput contains the data for creating an upload.
type UploadInput struct {
	WorkspaceID uuid.UUID
	Filename    string
	ContentType string
	SizeBytes   int64
	UploadedBy  uuid.UUID
	Body        io.Reader
}

// UploadResult contains the result of a successful upload.
type UploadResult struct {
	Asset      *repository.Asset
	StorageKey string
	SHA256     string
}

// Upload stores a file and creates an asset record.
func (s *UploadService) Upload(ctx context.Context, input UploadInput) (*UploadResult, error) {
	assetID := uuid.New()
	storageKey := fmt.Sprintf("%s/%s/%s%s",
		input.WorkspaceID.String(),
		assetID.String(),
		"original",
		path.Ext(input.Filename),
	)

	// Hash the content while uploading
	hasher := sha256.New()
	tee := io.TeeReader(input.Body, hasher)

	if err := s.storage.Put(ctx, storageKey, tee, input.SizeBytes, input.ContentType); err != nil {
		return nil, fmt.Errorf("upload: store file: %w", err)
	}

	hash := hex.EncodeToString(hasher.Sum(nil))

	asset := &repository.Asset{
		ID:            assetID,
		WorkspaceID:   input.WorkspaceID,
		Filename:      input.Filename,
		ContentType:   input.ContentType,
		SizeBytes:     input.SizeBytes,
		StorageKey:    storageKey,
		StorageDriver: "r2",
		Status:        "processing",
		UploadedBy:    &input.UploadedBy,
		ExifData:      map[string]interface{}{},
		ThumbnailURLs: map[string]string{},
	}

	if err := s.assetRepo.Create(ctx, asset); err != nil {
		// Attempt cleanup on failure
		_ = s.storage.Delete(ctx, storageKey)
		return nil, fmt.Errorf("upload: create asset: %w", err)
	}

	// Record storage usage for quota tracking (best-effort — don't fail upload)
	if s.storageSvc != nil {
		_ = s.storageSvc.RecordUpload(ctx, input.WorkspaceID, input.SizeBytes, 0)
	}

	return &UploadResult{
		Asset:      asset,
		StorageKey: storageKey,
		SHA256:     hash,
	}, nil
}
