package service

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// AssetService handles asset business logic.
type AssetService struct {
	assetRepo      *repository.AssetRepo
	derivativeRepo *repository.AssetDerivativeRepo
	storage        storage.Provider
	storageSvc     *StorageAccounting
}

// NewAssetService creates a new AssetService.
func NewAssetService(assetRepo *repository.AssetRepo, store storage.Provider) *AssetService {
	return &AssetService{assetRepo: assetRepo, storage: store}
}

func (s *AssetService) WithStorageAccounting(sa *StorageAccounting) *AssetService {
	s.storageSvc = sa
	return s
}

func (s *AssetService) WithDerivativeRepo(repo *repository.AssetDerivativeRepo) *AssetService {
	s.derivativeRepo = repo
	return s
}

// AssetWithURL is an asset with a presigned download URL.
type AssetWithURL struct {
	*repository.Asset
	DownloadURL string `json:"download_url"`
}

// GetByID retrieves an asset with a stable download URL. The URL is
// rooted at PUBLIC_API_URL/storage/{key} so the browser only ever talks
// to the public api origin and never sees R2/MinIO host details. The
// backend /storage/* proxy re-authenticates on every request (token
// query param OR Authorization header) so the URL is safe to embed
// permanently in API responses. Replaces the previous PresignURL call
// path which leaked the internal storage host and expired after 1h.
func (s *AssetService) GetByID(ctx context.Context, id uuid.UUID) (*AssetWithURL, error) {
	asset, err := s.assetRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return s.withDownloadURL(asset), nil
}

// GetByIDAndWorkspace retrieves an asset with a stable download URL, scoped to
// the caller workspace. Authenticated handlers should use this variant so a
// known asset UUID cannot leak metadata across tenants.
func (s *AssetService) GetByIDAndWorkspace(ctx context.Context, id, workspaceID uuid.UUID) (*AssetWithURL, error) {
	asset, err := s.assetRepo.GetByIDAndWorkspace(ctx, id, workspaceID)
	if err != nil {
		return nil, err
	}
	return s.withDownloadURL(asset), nil
}

func (s *AssetService) withDownloadURL(asset *repository.Asset) *AssetWithURL {
	if asset == nil {
		return nil
	}

	publicBase := os.Getenv("PUBLIC_API_URL")
	if publicBase == "" {
		publicBase = "https://api.rawdrive.in"
	}
	url := fmt.Sprintf("%s/storage/%s", publicBase, asset.StorageKey)

	return &AssetWithURL{Asset: asset, DownloadURL: url}
}

// List retrieves assets matching the filter.
func (s *AssetService) List(ctx context.Context, f repository.AssetFilter) ([]repository.Asset, error) {
	return s.assetRepo.List(ctx, f)
}

// GetStorageReader returns a ReadCloser for the given storage key.
// Used by public download endpoints that need to stream file contents
// from R2 without exposing the storage provider directly.
func (s *AssetService) GetStorageReader(ctx context.Context, key string) (io.ReadCloser, error) {
	return s.storage.Get(ctx, key)
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
	if err := s.recordDelete(ctx, asset); err != nil {
		return err
	}

	// Async storage cleanup would happen via worker; for now just mark deleted
	return nil
}

// SoftDeleteForWorkspace marks an asset as deleted only when it belongs to the
// request workspace.
func (s *AssetService) SoftDeleteForWorkspace(ctx context.Context, id, workspaceID uuid.UUID) error {
	asset, err := s.assetRepo.GetByIDAndWorkspace(ctx, id, workspaceID)
	if err != nil {
		return err
	}
	if asset == nil {
		return fmt.Errorf("asset not found")
	}

	if err := s.assetRepo.SoftDelete(ctx, id); err != nil {
		return err
	}
	if err := s.recordDelete(ctx, asset); err != nil {
		return err
	}
	return nil
}

func (s *AssetService) recordDelete(ctx context.Context, asset *repository.Asset) error {
	if s.storageSvc == nil || asset == nil {
		return nil
	}
	derivativeBytes := int64(0)
	if s.derivativeRepo != nil {
		total, err := s.derivativeRepo.TotalSizeByAsset(ctx, asset.ID)
		if err != nil {
			return fmt.Errorf("asset delete: derivative size lookup: %w", err)
		}
		derivativeBytes = total
	}
	if err := s.storageSvc.RecordDelete(ctx, asset.WorkspaceID, asset.SizeBytes, derivativeBytes); err != nil {
		return fmt.Errorf("asset delete: storage accounting: %w", err)
	}
	return nil
}
