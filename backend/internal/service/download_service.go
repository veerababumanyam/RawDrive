package service

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// DownloadService handles single and batch asset downloads.
type DownloadService struct {
	assetRepo        *repository.AssetRepo
	galleryAssetRepo *repository.GalleryAssetRepo
	store            storage.Provider
	downloadRepo     *repository.DownloadRepo
}

// NewDownloadService creates a new DownloadService.
func NewDownloadService(ar *repository.AssetRepo, gar *repository.GalleryAssetRepo, store storage.Provider) *DownloadService {
	return &DownloadService{assetRepo: ar, galleryAssetRepo: gar, store: store}
}

// WithDownloadRepo sets the download repo for job tracking.
func (s *DownloadService) WithDownloadRepo(dr *repository.DownloadRepo) *DownloadService {
	s.downloadRepo = dr
	return s
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

// ── M14: Download Job Tracking ──

// CreateDownloadJob creates a download job record.
func (s *DownloadService) CreateDownloadJob(ctx context.Context, job *repository.DownloadJob) error {
	if s.downloadRepo == nil {
		return nil
	}
	return s.downloadRepo.CreateJob(ctx, job)
}

// GetDownloadJob returns a download job by ID.
func (s *DownloadService) GetDownloadJob(ctx context.Context, id uuid.UUID) (*repository.DownloadJob, error) {
	if s.downloadRepo == nil {
		return nil, fmt.Errorf("download repo not configured")
	}
	return s.downloadRepo.GetJob(ctx, id)
}

// ListDownloadJobs returns download jobs for a gallery.
func (s *DownloadService) ListDownloadJobs(ctx context.Context, galleryID uuid.UUID) ([]repository.DownloadJob, error) {
	if s.downloadRepo == nil {
		return nil, nil
	}
	return s.downloadRepo.ListJobsByGallery(ctx, galleryID)
}

// LogDownloadEvent records a download event for audit.
func (s *DownloadService) LogDownloadEvent(ctx context.Context, event *repository.DownloadEvent) error {
	if s.downloadRepo == nil {
		return nil
	}
	return s.downloadRepo.CreateEvent(ctx, event)
}

// GetDownloadAudit returns download events for a gallery.
func (s *DownloadService) GetDownloadAudit(ctx context.Context, galleryID uuid.UUID, limit int) ([]repository.DownloadEvent, error) {
	if s.downloadRepo == nil {
		return nil, nil
	}
	return s.downloadRepo.ListEventsByGallery(ctx, galleryID, limit)
}

// ProcessJob implements worker.DownloadJobProcessor. It builds a ZIP
// containing the job's asset IDs, uploads it to object storage under
// a downloads/ prefix, and returns the storage key and the total bytes
// written. Progress is reported per-asset through the onProgress
// callback so the worker can update download_jobs.progress.
//
// M14 GAL-FR-150/151/152: background ZIP build with progress tracking.
//
// Implementation note: we buffer the ZIP to a bytes.Buffer before
// calling store.Put because the storage interface requires the size
// up front (S3-style PutObject). For rawdrive's typical gallery size
// (a few hundred photos) this is a few hundred MB at most — acceptable
// for a background worker. If we need to support multi-GB bundles
// later, swap the buffer for a temp file on disk.
func (s *DownloadService) ProcessJob(
	ctx context.Context,
	job *repository.DownloadJob,
	onProgress func(int),
) (string, int64, error) {
	if len(job.AssetIDs) == 0 {
		return "", 0, fmt.Errorf("download job %s: no assets", job.ID)
	}

	var buf bytes.Buffer
	if err := s.writeZipWithProgress(ctx, job.AssetIDs, &buf, onProgress); err != nil {
		return "", 0, fmt.Errorf("download job %s: zip build: %w", job.ID, err)
	}

	size := int64(buf.Len())
	storageKey := fmt.Sprintf("downloads/%s/%s.zip", job.GalleryID, job.ID)
	if err := s.store.Put(ctx, storageKey, &buf, size, "application/zip"); err != nil {
		return "", 0, fmt.Errorf("download job %s: storage put: %w", job.ID, err)
	}
	return storageKey, size, nil
}

// writeZipWithProgress is WriteSelectedZIP with a progress callback.
// Extracted so ProcessJob doesn't duplicate the dedup + copy loop.
func (s *DownloadService) writeZipWithProgress(
	ctx context.Context,
	assetIDs []uuid.UUID,
	w io.Writer,
	onProgress func(int),
) error {
	zw := zip.NewWriter(w)
	defer zw.Close()

	seen := make(map[string]int)
	total := len(assetIDs)
	for i, id := range assetIDs {
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
			for j := len(filename) - 1; j >= 0; j-- {
				if filename[j] == '.' {
					ext = filename[j:]
					base = filename[:j]
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
		if _, err := io.Copy(entry, reader); err != nil {
			reader.Close()
			return err
		}
		reader.Close()

		if onProgress != nil && total > 0 {
			onProgress(((i + 1) * 100) / total)
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
