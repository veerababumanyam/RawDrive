package service

import (
	"archive/zip"
	"context"
	"fmt"
	"io"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// DownloadService handles single and batch asset downloads.
type DownloadService struct {
	assetRepo      *repository.AssetRepo
	galleryAssetRepo *repository.GalleryAssetRepo
	store          storage.Provider
}

// NewDownloadService creates a new DownloadService.
func NewDownloadService(ar *repository.AssetRepo, gar *repository.GalleryAssetRepo, store storage.Provider) *DownloadService {
	return &DownloadService{assetRepo: ar, galleryAssetRepo: gar, store: store}
}

// GetOriginal returns a reader for the original asset file.
func (s *DownloadService) GetOriginal(ctx context.Context, assetID uuid.UUID) (io.ReadCloser, string, error) {
	asset, err := s.assetRepo.GetByID(ctx, assetID)
	if err != nil || asset == nil {
		return nil, "", fmt.Errorf("download: asset not found")
	}

	reader, err := s.store.Get(ctx, asset.StorageKey)
	if err != nil {
		return nil, "", fmt.Errorf("download: get from storage: %w", err)
	}

	return reader, asset.Filename, nil
}

// WriteZIP streams a ZIP file containing all assets in a gallery to the writer.
func (s *DownloadService) WriteZIP(ctx context.Context, galleryID uuid.UUID, w io.Writer) error {
	galleryAssets, err := s.galleryAssetRepo.ListByGallery(ctx, galleryID)
	if err != nil {
		return fmt.Errorf("download zip: list assets: %w", err)
	}

	zw := zip.NewWriter(w)
	defer zw.Close()

	seen := make(map[string]int) // track duplicate filenames
	for _, ga := range galleryAssets {
		asset, err := s.assetRepo.GetByID(ctx, ga.AssetID)
		if err != nil || asset == nil {
			continue // skip missing assets
		}

		reader, err := s.store.Get(ctx, asset.StorageKey)
		if err != nil {
			continue // skip unreadable assets
		}

		// Deduplicate filenames
		filename := asset.Filename
		if count, exists := seen[filename]; exists {
			seen[filename] = count + 1
			ext := ""
			base := filename
			for i := len(filename) - 1; i >= 0; i-- {
				if filename[i] == '.' {
					ext = filename[i:]
					base = filename[:i]
					break
				}
			}
			filename = fmt.Sprintf("%s_%d%s", base, count+1, ext)
		} else {
			seen[filename] = 1
		}

		entry, err := zw.Create(filename)
		if err != nil {
			reader.Close()
			continue
		}

		_, err = io.Copy(entry, reader)
		reader.Close()
		if err != nil {
			return fmt.Errorf("download zip: copy %s: %w", filename, err)
		}
	}

	return nil
}

// WriteSelectedZIP streams a ZIP containing only selected asset IDs.
func (s *DownloadService) WriteSelectedZIP(ctx context.Context, assetIDs []uuid.UUID, w io.Writer) error {
	zw := zip.NewWriter(w)
	defer zw.Close()

	seen := make(map[string]int)
	for _, id := range assetIDs {
		asset, err := s.assetRepo.GetByID(ctx, id)
		if err != nil || asset == nil {
			continue
		}

		reader, err := s.store.Get(ctx, asset.StorageKey)
		if err != nil {
			continue
		}

		filename := asset.Filename
		if count, exists := seen[filename]; exists {
			seen[filename] = count + 1
			ext := ""
			base := filename
			for i := len(filename) - 1; i >= 0; i-- {
				if filename[i] == '.' {
					ext = filename[i:]
					base = filename[:i]
					break
				}
			}
			filename = fmt.Sprintf("%s_%d%s", base, count+1, ext)
		} else {
			seen[filename] = 1
		}

		entry, err := zw.Create(filename)
		if err != nil {
			reader.Close()
			continue
		}

		_, err = io.Copy(entry, reader)
		reader.Close()
		if err != nil {
			continue
		}
	}

	return nil
}
