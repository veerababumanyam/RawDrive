package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

var ErrAssetNotFound = errors.New("asset not found")

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

// SoftDelete permanently deletes an asset. The name is retained for call-site
// stability, but the behaviour is now a hard delete: the asset row, dependents,
// storage deletion jobs, and workspace quota decrement are committed in one DB
// transaction. B2 object deletes are attempted immediately after commit and
// retried by the storage deletion worker if a provider call fails.
func (s *AssetService) SoftDelete(ctx context.Context, id uuid.UUID) error {
	asset, err := s.assetRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if asset == nil {
		return ErrAssetNotFound
	}
	return s.purge(ctx, asset)
}

// SoftDeleteForWorkspace permanently deletes an asset only when it belongs to the
// request workspace. See SoftDelete for the hard-delete semantics.
func (s *AssetService) SoftDeleteForWorkspace(ctx context.Context, id, workspaceID uuid.UUID) error {
	asset, err := s.assetRepo.GetByIDAndWorkspace(ctx, id, workspaceID)
	if err != nil {
		return err
	}
	if asset == nil {
		return ErrAssetNotFound
	}
	return s.purge(ctx, asset)
}

// SoftDeleteManyForWorkspace deletes every active workspace-owned asset it can
// resolve from ids and returns the number actually deleted. Missing, already
// deleted, and cross-workspace ids are ignored, matching the bulk endpoints'
// tenant-safe "drop unknown ids" contract.
func (s *AssetService) SoftDeleteManyForWorkspace(ctx context.Context, ids []uuid.UUID, workspaceID uuid.UUID) (int64, error) {
	seen := make(map[uuid.UUID]struct{}, len(ids))
	var affected int64
	for _, id := range ids {
		if id == uuid.Nil {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		if err := s.SoftDeleteForWorkspace(ctx, id, workspaceID); err != nil {
			if errors.Is(err, ErrAssetNotFound) {
				continue
			}
			return affected, err
		}
		affected++
	}
	return affected, nil
}

// purge permanently removes an asset and immediately returns its bytes to the
// workspace quota pool. Object keys are captured before the row disappears, then
// B2 cleanup is attempted best-effort after the DB commit and retried by a worker
// from storage_deletion_jobs.
func (s *AssetService) purge(ctx context.Context, asset *repository.Asset) error {
	if asset == nil {
		return ErrAssetNotFound
	}

	// Capture derivative bytes and object keys before rows are deleted.
	derivativeBytes := int64(0)
	if s.derivativeRepo != nil {
		total, err := s.derivativeRepo.TotalSizeByAsset(ctx, asset.ID)
		if err != nil {
			return fmt.Errorf("asset delete: derivative size lookup: %w", err)
		}
		derivativeBytes = total
	}
	storageKeys, err := s.assetStorageKeys(ctx, asset)
	if err != nil {
		return err
	}

	jobs, err := s.assetRepo.HardDeleteWithStorageAccounting(
		ctx,
		asset.ID,
		asset.WorkspaceID,
		asset.SizeBytes,
		derivativeBytes,
		storageKeys,
	)
	if err != nil {
		return fmt.Errorf("asset delete: hard delete/accounting: %w", err)
	}
	if s.storageSvc != nil {
		s.storageSvc.InvalidateAnalytics(asset.WorkspaceID)
	}
	s.processStorageDeletionJobs(ctx, jobs)
	return nil
}

func (s *AssetService) assetStorageKeys(ctx context.Context, asset *repository.Asset) ([]string, error) {
	if asset == nil {
		return nil, nil
	}
	keys := make([]string, 0, 1+len(asset.ThumbnailURLs))
	if asset.StorageKey != "" {
		keys = append(keys, asset.StorageKey)
	}
	if s.derivativeRepo != nil {
		derivatives, err := s.derivativeRepo.ListByAsset(ctx, asset.ID)
		if err != nil {
			return nil, fmt.Errorf("asset delete: derivative key lookup: %w", err)
		}
		for _, derivative := range derivatives {
			keys = append(keys, derivative.StorageKey)
		}
	}
	for _, key := range asset.ThumbnailURLs {
		keys = append(keys, key)
	}
	return normalizeStorageKeys(keys), nil
}

func normalizeStorageKeys(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	keys := make([]string, 0, len(values))
	for _, value := range values {
		key := normalizeStorageKey(value)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	return keys
}

func normalizeStorageKey(value string) string {
	key := strings.TrimSpace(value)
	if key == "" {
		return ""
	}
	if strings.HasPrefix(key, "/storage/") {
		return strings.TrimPrefix(key, "/storage/")
	}
	parsed, err := url.Parse(key)
	if err == nil && parsed.Scheme != "" {
		if strings.HasPrefix(parsed.Path, "/storage/") {
			return strings.TrimPrefix(parsed.Path, "/storage/")
		}
		return ""
	}
	return key
}

func (s *AssetService) processStorageDeletionJobs(ctx context.Context, jobs []repository.StorageDeletionJob) {
	if s.storage == nil || len(jobs) == 0 {
		return
	}
	for _, job := range jobs {
		if err := s.storage.Delete(ctx, job.StorageKey); err != nil {
			log.Printf("asset delete: storage delete failed for %q: %v", job.StorageKey, err)
			if markErr := s.assetRepo.MarkStorageDeletionJobFailed(ctx, job.ID, err.Error(), time.Now().Add(time.Minute)); markErr != nil {
				log.Printf("asset delete: mark storage delete job failed %s: %v", job.ID, markErr)
			}
			continue
		}
		if err := s.assetRepo.MarkStorageDeletionJobDeleted(ctx, job.ID); err != nil {
			log.Printf("asset delete: mark storage delete job deleted %s: %v", job.ID, err)
		}
	}
}
