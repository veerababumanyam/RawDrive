package service

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/download"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// assetSource is the narrow read surface DownloadService needs from the asset
// repository. Defining it locally lets the ZIP-streaming paths be unit-tested
// with in-memory fakes while production wires the concrete *repository.AssetRepo
// (via assetRepoAdapter) without changing the public constructor signature.
type assetSource interface {
	// GetByID returns a single asset (nil, nil when not found).
	GetByID(ctx context.Context, id uuid.UUID) (*repository.Asset, error)
	// GetByIDs bulk-fetches assets by ID in a single query (F-030: kills the
	// per-asset N+1 in the download loop). Missing/soft-deleted IDs are simply
	// absent from the returned slice; order is not guaranteed.
	GetByIDs(ctx context.Context, ids []uuid.UUID) ([]*repository.Asset, error)
}

// assetRepoAdapter wraps the concrete *repository.AssetRepo and adds the bulk
// GetByIDs lookup the download path needs. The bulk query lives here (using the
// repo's exported Pool) rather than in the service body so the service stays
// free of raw SQL and remains testable against the assetSource seam.
type assetRepoAdapter struct {
	repo *repository.AssetRepo
}

func (a assetRepoAdapter) GetByID(ctx context.Context, id uuid.UUID) (*repository.Asset, error) {
	return a.repo.GetByID(ctx, id)
}

func (a assetRepoAdapter) GetByIDs(ctx context.Context, ids []uuid.UUID) ([]*repository.Asset, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	pool := a.repo.Pool()
	if pool == nil {
		// No pool available (defensive) — caller falls back to per-ID lookups.
		return nil, nil
	}
	return bulkGetAssetsFromPool(ctx, pool, ids)
}

// bulkGetAssetsFromPool fetches all live assets whose IDs are in the set with a
// single `id = ANY($1)` query, mirroring AssetRepo.GetByID's column list.
func bulkGetAssetsFromPool(ctx context.Context, pool *pgxpool.Pool, ids []uuid.UUID) ([]*repository.Asset, error) {
	rows, err := pool.Query(ctx,
		`SELECT id, workspace_id, filename, content_type, size_bytes, storage_key,
		 storage_driver, width, height, blurhash, exif_data, thumbnail_urls, uploaded_by,
		 status, created_at, updated_at, deleted_at
		 FROM assets WHERE id = ANY($1) AND deleted_at IS NULL`, ids,
	)
	if err != nil {
		return nil, fmt.Errorf("download zip: bulk get assets: %w", err)
	}
	defer rows.Close()

	var assets []*repository.Asset
	for rows.Next() {
		a := &repository.Asset{}
		if err := rows.Scan(&a.ID, &a.WorkspaceID, &a.Filename, &a.ContentType, &a.SizeBytes,
			&a.StorageKey, &a.StorageDriver, &a.Width, &a.Height, &a.Blurhash, &a.ExifData,
			&a.ThumbnailURLs, &a.UploadedBy, &a.Status, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("download zip: bulk get assets scan: %w", err)
		}
		assets = append(assets, a)
	}
	if err := rows.Err(); err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("download zip: bulk get assets rows: %w", err)
	}
	return assets, nil
}

// DownloadService handles single and batch asset downloads.
type DownloadService struct {
	assets           assetSource
	galleryAssetRepo *repository.GalleryAssetRepo
	store            storage.Provider
	downloadRepo     *repository.DownloadRepo
}

// NewDownloadService creates a new DownloadService.
func NewDownloadService(ar *repository.AssetRepo, gar *repository.GalleryAssetRepo, store storage.Provider) *DownloadService {
	return &DownloadService{assets: assetRepoAdapter{repo: ar}, galleryAssetRepo: gar, store: store}
}

// WithDownloadRepo sets the download repo for job tracking.
func (s *DownloadService) WithDownloadRepo(dr *repository.DownloadRepo) *DownloadService {
	s.downloadRepo = dr
	return s
}

// GetOriginal returns a reader for the original asset file.
func (s *DownloadService) GetOriginal(ctx context.Context, assetID uuid.UUID) (io.ReadCloser, string, error) {
	asset, err := s.assets.GetByID(ctx, assetID)
	if err != nil || asset == nil {
		return nil, "", fmt.Errorf("download: asset not found")
	}

	reader, err := s.store.Get(ctx, asset.StorageKey)
	if err != nil {
		return nil, "", fmt.Errorf("download: get from storage: %w", err)
	}

	return reader, asset.Filename, nil
}

// resolveAssets bulk-fetches the assets for the given IDs and returns an
// O(1) lookup map keyed by asset ID (F-030). On bulk-fetch failure it returns
// an empty map so callers degrade to skipping assets rather than aborting the
// whole archive — matching the existing "skip missing assets" behaviour.
func (s *DownloadService) resolveAssets(ctx context.Context, ids []uuid.UUID) map[uuid.UUID]*repository.Asset {
	byID := make(map[uuid.UUID]*repository.Asset, len(ids))
	if len(ids) == 0 {
		return byID
	}
	assets, err := s.assets.GetByIDs(ctx, ids)
	if err != nil {
		return byID
	}
	for _, a := range assets {
		if a != nil {
			byID[a.ID] = a
		}
	}
	return byID
}

// WriteZIP streams a ZIP file containing all assets in a gallery to the writer.
// Applies the enterprise default EXIF strip policy (print_safe) so downloads
// never leak GPS/serial metadata, while preserving ICC color profiles for print
// workflows. See backend/internal/download/exif_stripper.go.
func (s *DownloadService) WriteZIP(ctx context.Context, galleryID uuid.UUID, w io.Writer) error {
	return s.WriteZIPWithPolicy(ctx, galleryID, w, download.PolicyPrintSafe)
}

// WriteZIPWithPolicy streams a ZIP file containing all assets with explicit
// EXIF handling. Non-JPEG assets are copied verbatim. JPEGs that fail to strip
// are copied verbatim with a warning logged rather than failing the whole zip.
func (s *DownloadService) WriteZIPWithPolicy(ctx context.Context, galleryID uuid.UUID, w io.Writer, policy download.StripPolicy) error {
	galleryAssets, err := s.galleryAssetRepo.ListByGallery(ctx, galleryID)
	if err != nil {
		return fmt.Errorf("download zip: list assets: %w", err)
	}

	zw := zip.NewWriter(w)
	// F-028: Close() flushes the ZIP central directory; its error must reach the
	// caller. closed guards against double-closing on the early-error paths.
	closed := false
	defer func() {
		if !closed {
			_ = zw.Close()
		}
	}()

	// F-030: bulk-fetch every asset up front (1 query) instead of GetByID per
	// asset (N queries) inside the loop.
	ids := make([]uuid.UUID, 0, len(galleryAssets))
	for _, ga := range galleryAssets {
		ids = append(ids, ga.AssetID)
	}
	byID := s.resolveAssets(ctx, ids)

	seen := make(map[string]int) // track duplicate filenames
	for _, ga := range galleryAssets {
		asset := byID[ga.AssetID]
		if asset == nil {
			continue // skip missing assets
		}

		reader, err := s.store.Get(ctx, asset.StorageKey)
		if err != nil {
			continue // skip unreadable assets
		}

		// Deduplicate filenames
		filename := dedupeFilename(asset.Filename, seen)

		entry, err := zw.Create(filename)
		if err != nil {
			reader.Close()
			continue
		}

		if isJPEGFilename(filename) && policy != download.PolicyPassthrough {
			// Read fully so we can strip metadata — bounded by the typical photo size.
			// For very large uploads the print_safe path still fits in memory because
			// a single JPEG is ~5-30MB at most.
			raw, readErr := io.ReadAll(reader)
			reader.Close()
			if readErr == nil {
				stripped, _, stripErr := download.StripJPEG(raw, policy)
				if stripErr == nil {
					raw = stripped
				}
				// Fall through with raw (stripped or original) — never fail the whole zip.
				if _, err = entry.Write(raw); err != nil {
					return fmt.Errorf("download zip: write %s: %w", filename, err)
				}
				continue
			}
			// Read failed — nothing to write for this asset.
			return fmt.Errorf("download zip: read %s: %w", filename, readErr)
		}

		_, err = io.Copy(entry, reader)
		reader.Close()
		if err != nil {
			return fmt.Errorf("download zip: copy %s: %w", filename, err)
		}
	}

	closed = true
	if err := zw.Close(); err != nil {
		return fmt.Errorf("download zip: finalize archive: %w", err)
	}
	return nil
}

// dedupeFilename returns a collision-free filename, recording the running count
// of each base name in seen. The second occurrence of "a.jpg" becomes "a_1.jpg".
func dedupeFilename(filename string, seen map[string]int) string {
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
		return fmt.Sprintf("%s_%d%s", base, count+1, ext)
	}
	seen[filename] = 1
	return filename
}

// isJPEGFilename returns true for filenames the EXIF stripper can process.
//
// F-022: strings.HasSuffix is length-safe, so 4-char names that are not ".jpg"
// (e.g. "test", "a.jp") no longer slice out of range and panic.
func isJPEGFilename(filename string) bool {
	lower := strings.ToLower(filename)
	return strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg")
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

// multipartZipPartSize is the size of each ZIP chunk streamed to object
// storage during a multipart upload. S3/B2 require every part except the
// last to be at least 5 MiB; 8 MiB keeps the part count low for multi-GB
// bundles while bounding the in-flight buffer to a single part.
const multipartZipPartSize = 8 << 20 // 8 MiB

// ProcessJob implements worker.DownloadJobProcessor. It builds a ZIP
// containing the job's asset IDs, uploads it to object storage under
// a downloads/ prefix, and returns the storage key and the total bytes
// written. Progress is reported per-asset through the onProgress
// callback so the worker can update download_jobs.progress.
//
// M14 GAL-FR-150/151/152: background ZIP build with progress tracking.
//
// F-076: the ZIP is streamed directly to object storage via the
// MultipartCapable interface (multipart.go) through an io.Pipe — the
// archive is never materialized on the local filesystem (/tmp), so a
// large or concurrent download can no longer exhaust pod scratch space
// (ENOSPC/OOM). This also keeps RawDrive's "no local disk" hard law
// intact for the download path: B2/S3 is the only place bytes land.
//
// Providers that do not implement MultipartCapable (e.g. unit tests with
// a plain in-memory provider) fall back to the bounded temp-file path so
// behaviour is unchanged where multipart is unavailable.
func (s *DownloadService) ProcessJob(
	ctx context.Context,
	job *repository.DownloadJob,
	onProgress func(int),
) (string, int64, error) {
	if len(job.AssetIDs) == 0 {
		return "", 0, fmt.Errorf("download job %s: no assets", job.ID)
	}

	storageKey := fmt.Sprintf("downloads/%s/%s.zip", job.GalleryID, job.ID)

	if mp, ok := s.store.(storage.MultipartCapable); ok {
		return s.processJobStreaming(ctx, mp, job, storageKey, onProgress)
	}
	return s.processJobTempFile(ctx, job, storageKey, onProgress)
}

// processJobStreaming builds the ZIP into an io.Pipe and uploads it to
// object storage as it is produced, so the full archive is never written
// to local disk. The zip.Writer runs in a goroutine writing to the pipe
// writer; this goroutine drains the pipe reader in fixed-size parts and
// hands each part to UploadPart.
func (s *DownloadService) processJobStreaming(
	ctx context.Context,
	mp storage.MultipartCapable,
	job *repository.DownloadJob,
	storageKey string,
	onProgress func(int),
) (string, int64, error) {
	uploadID, err := mp.CreateMultipartUpload(ctx, storageKey, "application/zip")
	if err != nil {
		return "", 0, fmt.Errorf("download job %s: create multipart: %w", job.ID, err)
	}

	pr, pw := io.Pipe()

	// Producer: write the ZIP into the pipe. Any build error is propagated
	// to the reader side via CloseWithError so the consumer aborts.
	go func() {
		err := s.writeZipWithProgress(ctx, job.AssetIDs, pw, onProgress)
		_ = pw.CloseWithError(err)
	}()

	var (
		parts      []storage.CompletedPart
		total      int64
		partNumber int32 = 1
		buf              = make([]byte, multipartZipPartSize)
	)

	abort := func(cause error) (string, int64, error) {
		_ = pr.CloseWithError(cause)
		_ = mp.AbortMultipartUpload(ctx, storageKey, uploadID)
		return "", 0, cause
	}

	for {
		// Fill a full part before uploading (io.ReadFull coalesces the small
		// writes the zip.Writer emits into one >=part-size chunk).
		n, readErr := io.ReadFull(pr, buf)
		if n > 0 {
			etag, upErr := mp.UploadPart(ctx, storageKey, uploadID, partNumber, bytes.NewReader(buf[:n]), int64(n))
			if upErr != nil {
				return abort(fmt.Errorf("download job %s: upload part %d: %w", job.ID, partNumber, upErr))
			}
			parts = append(parts, storage.CompletedPart{PartNumber: partNumber, ETag: etag})
			partNumber++
			total += int64(n)
		}
		if readErr == io.EOF || readErr == io.ErrUnexpectedEOF {
			break // clean end of stream (last short part already uploaded above)
		}
		if readErr != nil {
			// Propagated zip-build error or pipe failure.
			return abort(fmt.Errorf("download job %s: zip build: %w", job.ID, readErr))
		}
	}

	if len(parts) == 0 {
		// Defensive: an empty ZIP still has a central-directory trailer, so
		// this should not happen, but never complete a zero-part upload.
		return abort(fmt.Errorf("download job %s: empty archive", job.ID))
	}

	if err := mp.CompleteMultipartUpload(ctx, storageKey, uploadID, parts); err != nil {
		_ = mp.AbortMultipartUpload(ctx, storageKey, uploadID)
		return "", 0, fmt.Errorf("download job %s: complete multipart: %w", job.ID, err)
	}
	return storageKey, total, nil
}

// processJobTempFile is the legacy single-PUT path used when the storage
// provider does not support multipart uploads. It buffers the ZIP to an OS
// temp file (cleaned up unconditionally) because store.Put needs the size
// up front. Production never takes this path — the B2/S3 driver is
// MultipartCapable — so this exists only for providers (and tests) without
// multipart support.
func (s *DownloadService) processJobTempFile(
	ctx context.Context,
	job *repository.DownloadJob,
	storageKey string,
	onProgress func(int),
) (string, int64, error) {
	tmp, err := os.CreateTemp("", fmt.Sprintf("rawdrive-dl-%s-*.zip", job.ID))
	if err != nil {
		return "", 0, fmt.Errorf("download job %s: create temp: %w", job.ID, err)
	}
	tmpPath := tmp.Name()
	// Double-cleanup pattern: defer an unconditional Remove so crashes
	// past this point never leak, plus an explicit Close below for
	// the happy path.
	defer func() {
		_ = tmp.Close() // idempotent — safe even if already closed
		_ = os.Remove(tmpPath)
	}()

	if err := s.writeZipWithProgress(ctx, job.AssetIDs, tmp, onProgress); err != nil {
		return "", 0, fmt.Errorf("download job %s: zip build: %w", job.ID, err)
	}

	// Stat the completed file for the exact byte count — writeZipWithProgress
	// closes the zip.Writer before returning so the trailer is already flushed.
	info, err := tmp.Stat()
	if err != nil {
		return "", 0, fmt.Errorf("download job %s: stat temp: %w", job.ID, err)
	}
	size := info.Size()

	// Rewind so store.Put reads from the beginning.
	if _, err := tmp.Seek(0, io.SeekStart); err != nil {
		return "", 0, fmt.Errorf("download job %s: seek temp: %w", job.ID, err)
	}

	if err := s.store.Put(ctx, storageKey, tmp, size, "application/zip"); err != nil {
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
	// F-028: surface the central-directory flush error to the caller.
	closed := false
	defer func() {
		if !closed {
			_ = zw.Close()
		}
	}()

	// F-030: one bulk fetch instead of GetByID per asset in the loop.
	byID := s.resolveAssets(ctx, assetIDs)

	seen := make(map[string]int)
	total := len(assetIDs)
	for i, id := range assetIDs {
		asset := byID[id]
		if asset == nil {
			continue
		}
		reader, err := s.store.Get(ctx, asset.StorageKey)
		if err != nil {
			continue
		}

		filename := dedupeFilename(asset.Filename, seen)

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

	closed = true
	if err := zw.Close(); err != nil {
		return fmt.Errorf("download zip: finalize archive: %w", err)
	}
	return nil
}

// WriteSelectedZIP streams a ZIP containing only selected asset IDs.
func (s *DownloadService) WriteSelectedZIP(ctx context.Context, assetIDs []uuid.UUID, w io.Writer) error {
	zw := zip.NewWriter(w)
	// F-028: surface the central-directory flush error to the caller.
	closed := false
	defer func() {
		if !closed {
			_ = zw.Close()
		}
	}()

	// F-030: one bulk fetch instead of GetByID per asset in the loop.
	byID := s.resolveAssets(ctx, assetIDs)

	seen := make(map[string]int)
	for _, id := range assetIDs {
		asset := byID[id]
		if asset == nil {
			continue
		}

		reader, err := s.store.Get(ctx, asset.StorageKey)
		if err != nil {
			continue
		}

		filename := dedupeFilename(asset.Filename, seen)

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

	closed = true
	if err := zw.Close(); err != nil {
		return fmt.Errorf("download zip: finalize archive: %w", err)
	}
	return nil
}
