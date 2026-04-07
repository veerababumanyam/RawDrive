package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// AssetService handles asset business logic.
type AssetService struct {
	assetRepo *repository.AssetRepo
	storage   storage.Provider
}

// NewAssetService creates a new AssetService.
func NewAssetService(assetRepo *repository.AssetRepo, store storage.Provider) *AssetService {
	return &AssetService{assetRepo: assetRepo, storage: store}
}

// AssetWithURL is an asset with a presigned download URL.
type AssetWithURL struct {
	*repository.Asset
	DownloadURL string `json:"download_url"`
}

// GetByID retrieves an asset with a presigned URL.
func (s *AssetService) GetByID(ctx context.Context, id uuid.UUID) (*AssetWithURL, error) {
	asset, err := s.assetRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if asset == nil {
		return nil, nil
	}

	url, err := s.storage.PresignURL(ctx, asset.StorageKey, storage.PresignOptions{
		ExpiresInSeconds: 3600,
	})
	if err != nil {
		return nil, fmt.Errorf("asset service: presign: %w", err)
	}

	return &AssetWithURL{Asset: asset, DownloadURL: url}, nil
}

// List retrieves assets matching the filter.
func (s *AssetService) List(ctx context.Context, f repository.AssetFilter) ([]repository.Asset, error) {
	return s.assetRepo.List(ctx, f)
}

// SoftDelete marks an asset as deleted and removes from storage.
func (s *AssetService) SoftDelete(ctx context.Context, id uuid.UUID) error {
	asset, err := s.assetRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if asset == nil {
		return fmt.Errorf("asset not found")
	}

	if err := s.assetRepo.SoftDelete(ctx, id); err != nil {
		return err
	}

	// Async storage cleanup would happen via worker; for now just mark deleted
	return nil
}
