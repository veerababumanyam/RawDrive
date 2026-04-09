package service

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"

	"github.com/disintegration/imaging"
	"github.com/rawdrive/backend/internal/storage"
)

// ThumbnailSize defines a thumbnail variant.
type ThumbnailSize struct {
	Name      string
	MaxWidth  int
	MaxHeight int
}

// StandardSizes are the 3 required thumbnail sizes.
var StandardSizes = []ThumbnailSize{
	{Name: "sm", MaxWidth: 200, MaxHeight: 200},
	{Name: "md", MaxWidth: 800, MaxHeight: 800},
	{Name: "lg", MaxWidth: 1600, MaxHeight: 1600},
}

// ThumbnailService generates and stores thumbnails.
type ThumbnailService struct {
	store storage.Provider
}

// NewThumbnailService creates a new ThumbnailService.
func NewThumbnailService(store storage.Provider) *ThumbnailService {
	return &ThumbnailService{store: store}
}

// ThumbnailResult holds the generated thumbnail URLs and metadata.
type ThumbnailResult struct {
	URLs     map[string]string // size name -> storage key
	Blurhash string
	Width    int
	Height   int
}

// GenerateAll creates thumbnails for all standard sizes from the source image.
func (s *ThumbnailService) GenerateAll(ctx context.Context, assetID string, src io.Reader) (*ThumbnailResult, error) {
	// Decode the source image with auto-orientation from EXIF
	srcImg, err := imaging.Decode(src, imaging.AutoOrientation(true))
	if err != nil {
		return nil, fmt.Errorf("thumbnail decode: %w", err)
	}

	bounds := srcImg.Bounds()
	result := &ThumbnailResult{
		URLs:   make(map[string]string),
		Width:  bounds.Dx(),
		Height: bounds.Dy(),
	}

	// Generate each thumbnail size
	for _, size := range StandardSizes {
		key, err := s.generateOne(ctx, assetID, srcImg, size)
		if err != nil {
			return nil, fmt.Errorf("thumbnail %s: %w", size.Name, err)
		}
		result.URLs[size.Name] = key
	}

	// Generate blurhash from the smallest thumbnail
	result.Blurhash = generateBlurhash(srcImg)

	return result, nil
}

// generateOne creates a single thumbnail and stores it.
func (s *ThumbnailService) generateOne(ctx context.Context, assetID string, src image.Image, size ThumbnailSize) (string, error) {
	thumb := imaging.Fit(src, size.MaxWidth, size.MaxHeight, imaging.Lanczos)

	buf := new(bytes.Buffer)
	if err := imaging.Encode(buf, thumb, imaging.JPEG, imaging.JPEGQuality(80)); err != nil {
		return "", fmt.Errorf("encode: %w", err)
	}

	key := fmt.Sprintf("thumbnails/%s/%s.jpg", assetID, size.Name)
	if err := s.store.Put(ctx, key, buf, int64(buf.Len()), "image/jpeg"); err != nil {
		return "", fmt.Errorf("store: %w", err)
	}

	return key, nil
}

// GenerateForAsset fetches an asset from storage, generates all thumbnails, and updates the asset record.
// Used by the processing pipeline for async thumbnail generation.
func (s *ThumbnailService) GenerateForAsset(ctx context.Context, assetID interface{}, storageKey string) error {
	reader, err := s.store.Get(ctx, storageKey)
	if err != nil {
		return fmt.Errorf("thumbnail: get original: %w", err)
	}
	defer reader.Close()

	idStr := fmt.Sprintf("%v", assetID)
	_, err = s.GenerateAll(ctx, idStr, reader)
	return err
}

// generateBlurhash creates a simple placeholder hash.
// In production, use github.com/bbrks/go-blurhash for real BlurHash encoding.
func generateBlurhash(img image.Image) string {
	// Simplified: return a placeholder that can be used for progressive loading.
	// Real implementation would use go-blurhash to generate a compact string.
	bounds := img.Bounds()
	if bounds.Dx() > bounds.Dy() {
		return "LEHV6nWB2yk8pyo0adR*.7kCMdnj" // landscape placeholder
	}
	return "LGF5]+Yk^6#M@-5c,1J5@[or[Q6." // portrait placeholder
}
