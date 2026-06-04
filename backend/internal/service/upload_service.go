package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/storage"
)

// UploadService handles file upload orchestration.
type UploadService struct {
	storage           storage.Provider
	assetRepo         *repository.AssetRepo
	exifSvc           *ExifService
	storageSvc        *StorageAccounting
	encryptionEnabled bool
	encryptionAlgo    string
	encryptionVersion int
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

func (s *UploadService) WithEncryptionMetadata(enabled bool, algo string, version int) *UploadService {
	s.encryptionEnabled = enabled
	s.encryptionAlgo = algo
	s.encryptionVersion = version
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
	// Purpose optionally segregates an upload into a dedicated per-workspace
	// storage sub-folder. The empty string (the default for every existing
	// caller) preserves the original key layout byte-for-byte. The value is
	// NEVER concatenated into the storage key directly — only the recognised
	// literal "music" selects the music sub-folder (see buildStorageKey). Any
	// other value is treated as "no purpose" so it can never alter the key
	// path (tenant-isolation / path-injection guard).
	Purpose string
}

// musicPurpose is the single recognised Purpose value. It is a hardcoded
// literal selected by strict equality — user-supplied Purpose strings are never
// interpolated into the storage key, so an attacker cannot inject "../" or a
// foreign workspace prefix via this field.
const musicPurpose = "music"

// buildStorageKey computes the object-storage key for an upload. For the music
// purpose it nests the asset under a literal per-workspace "music" sub-folder:
//
//	{workspaceID}/music/{assetID}/original{ext}
//
// For every other (or absent) purpose it returns the original layout unchanged:
//
//	{workspaceID}/{assetID}/original{ext}
//
// The "music" segment is a constant chosen by equality on purpose — the raw
// purpose value is never placed into the key — so the key path can never be
// influenced by client input beyond opting into the one allowlisted sub-folder.
func buildStorageKey(workspaceID, assetID uuid.UUID, filename, purpose string) string {
	keyPrefix := workspaceID.String()
	if purpose == musicPurpose {
		keyPrefix = workspaceID.String() + "/" + musicPurpose
	}
	return fmt.Sprintf("%s/%s/%s%s",
		keyPrefix,
		assetID.String(),
		"original",
		path.Ext(filename),
	)
}

// UploadResult contains the result of a successful upload.
type UploadResult struct {
	Asset      *repository.Asset
	StorageKey string
	SHA256     string
}

// InitialAssetStatus returns the first processing state for a newly persisted
// asset. Raster photo uploads need the derivative worker; non-image uploads
// such as slideshow audio are already usable once stored and must not be fed
// into the image thumbnail pipeline.
func InitialAssetStatus(contentType string) string {
	if strings.HasPrefix(strings.ToLower(contentType), "image/") {
		return "processing"
	}
	return "ready"
}

// Upload stores a file and creates an asset record.
func (s *UploadService) Upload(ctx context.Context, input UploadInput) (*UploadResult, error) {
	reservedStorage := false
	if s.storageSvc != nil {
		if qErr := s.storageSvc.ReserveUpload(ctx, input.WorkspaceID, input.SizeBytes); qErr != nil {
			if errors.Is(qErr, ErrStorageQuotaExceeded) {
				return nil, ErrStorageQuotaExceeded
			}
			return nil, fmt.Errorf("upload: quota reserve: %w", qErr)
		}
		reservedStorage = true
	}
	releaseReservation := func() {
		if reservedStorage && s.storageSvc != nil {
			_ = s.storageSvc.ReleaseUploadReservation(ctx, input.WorkspaceID, input.SizeBytes)
			reservedStorage = false
		}
	}
	if s.storageSvc != nil && !reservedStorage {
		allowed, qErr := s.storageSvc.CheckQuota(ctx, input.WorkspaceID, input.SizeBytes)
		if qErr != nil {
			return nil, fmt.Errorf("upload: quota check: %w", qErr)
		}
		if !allowed {
			return nil, ErrStorageQuotaExceeded
		}
	}

	assetID := uuid.New()
	storageKey := buildStorageKey(input.WorkspaceID, assetID, input.Filename, input.Purpose)

	// Hash the content while uploading
	hasher := sha256.New()
	tee := io.TeeReader(input.Body, hasher)

	if err := s.storage.Put(ctx, storageKey, tee, input.SizeBytes, input.ContentType); err != nil {
		releaseReservation()
		return nil, fmt.Errorf("upload: store file: %w", err)
	}

	hash := hex.EncodeToString(hasher.Sum(nil))

	asset := &repository.Asset{
		ID:                assetID,
		WorkspaceID:       input.WorkspaceID,
		Filename:          input.Filename,
		ContentType:       input.ContentType,
		SizeBytes:         input.SizeBytes,
		StorageKey:        storageKey,
		StorageDriver:     "s3",
		Status:            InitialAssetStatus(input.ContentType),
		UploadedBy:        &input.UploadedBy,
		ExifData:          map[string]interface{}{},
		ThumbnailURLs:     map[string]string{},
		IsEncrypted:       s.encryptionEnabled,
		EncryptionVersion: s.encryptionVersion,
	}
	if s.encryptionAlgo != "" {
		asset.EncryptionAlgo = &s.encryptionAlgo
	}

	if err := s.assetRepo.Create(ctx, asset); err != nil {
		// Attempt cleanup on failure
		_ = s.storage.Delete(ctx, storageKey)
		releaseReservation()
		return nil, fmt.Errorf("upload: create asset: %w", err)
	}

	if reservedStorage && s.storageSvc != nil {
		if err := s.storageSvc.CommitUploadReservation(ctx, input.WorkspaceID, input.SizeBytes, 0); err != nil {
			_ = s.storage.Delete(ctx, storageKey)
			_ = s.assetRepo.SoftDelete(ctx, asset.ID)
			releaseReservation()
			return nil, fmt.Errorf("upload: commit storage reservation: %w", err)
		}
		reservedStorage = false
	}

	return &UploadResult{
		Asset:      asset,
		StorageKey: storageKey,
		SHA256:     hash,
	}, nil
}
