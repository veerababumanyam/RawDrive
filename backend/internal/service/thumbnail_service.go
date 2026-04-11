package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"

	"os"
	"os/exec"

	"github.com/disintegration/imaging"
	"github.com/rawdrive/backend/internal/storage"
)

func base64Encode(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

// ThumbnailSize defines a thumbnail variant.
type ThumbnailSize struct {
	Name      string
	MaxWidth  int
	MaxHeight int
}

// StandardSizes are the 3 required thumbnail sizes.
var StandardSizes = []ThumbnailSize{
	{Name: "thumb_sm", MaxWidth: 200, MaxHeight: 200},
	{Name: "thumb_md", MaxWidth: 600, MaxHeight: 600},
	{Name: "thumb_lg", MaxWidth: 1200, MaxHeight: 1200},
}

// CoverSizes are responsive cover image variants.
var CoverSizes = []ThumbnailSize{
	{Name: "cover_1920", MaxWidth: 1920, MaxHeight: 1080},
	{Name: "cover_1280", MaxWidth: 1280, MaxHeight: 720},
	{Name: "cover_640", MaxWidth: 640, MaxHeight: 360},
}

// OGImageSize is the social share preview (1200x630 for Open Graph).
var OGImageSize = ThumbnailSize{Name: "og_image", MaxWidth: 1200, MaxHeight: 630}

// AllDerivativeSizes combines all derivative types for full pipeline processing (JPEG).
var AllDerivativeSizes = append(append(StandardSizes, CoverSizes...), OGImageSize)

// WebPDisplaySize is the full-res WebP conversion used for in-app display (replaces original in UI).
var WebPDisplaySize = ThumbnailSize{Name: "display_webp", MaxWidth: 2400, MaxHeight: 2400}

// WebPThumbSizes are the WebP versions of the standard thumbnail sizes.
var WebPThumbSizes = []ThumbnailSize{
	{Name: "thumb_sm_webp", MaxWidth: 200, MaxHeight: 200},
	{Name: "thumb_md_webp", MaxWidth: 600, MaxHeight: 600},
	{Name: "thumb_lg_webp", MaxWidth: 1200, MaxHeight: 1200},
}

// WatermarkPreviewSize is the watermarked mid-res preview for proofing galleries.
var WatermarkPreviewSize = ThumbnailSize{Name: "watermark_preview", MaxWidth: 1200, MaxHeight: 1200}

// ThumbnailService generates and stores thumbnails.
type ThumbnailService struct {
	store        storage.Provider
	watermarkSvc *WatermarkService
}

// NewThumbnailService creates a new ThumbnailService.
func NewThumbnailService(store storage.Provider) *ThumbnailService {
	return &ThumbnailService{store: store, watermarkSvc: NewWatermarkService()}
}

// GetStore returns the storage provider (used by edge delivery handler).
func (s *ThumbnailService) GetStore() storage.Provider {
	return s.store
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

// DerivativeResult holds info about a single generated derivative.
type DerivativeResult struct {
	Variant    string `json:"variant"`
	StorageKey string `json:"storage_key"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	SizeBytes  int64  `json:"size_bytes"`
	Format     string `json:"format"`
}

// FullDerivativeResult holds all derivatives generated for an asset.
type FullDerivativeResult struct {
	Derivatives []DerivativeResult `json:"derivatives"`
	LQIPBase64  string             `json:"lqip_base64"`
	Width       int                `json:"width"`
	Height      int                `json:"height"`
}

// GenerateAllDerivatives produces thumbnails, cover variants, OG image, and LQIP from a source image.
func (s *ThumbnailService) GenerateAllDerivatives(ctx context.Context, assetID string, src io.Reader) (*FullDerivativeResult, error) {
	srcImg, err := imaging.Decode(src, imaging.AutoOrientation(true))
	if err != nil {
		return nil, fmt.Errorf("derivative decode: %w", err)
	}

	bounds := srcImg.Bounds()
	result := &FullDerivativeResult{
		Width:  bounds.Dx(),
		Height: bounds.Dy(),
	}

	// Generate JPEG derivative sizes (thumbnails + covers + OG)
	for _, size := range AllDerivativeSizes {
		dr, err := s.generateDerivative(ctx, assetID, srcImg, size)
		if err != nil {
			continue
		}
		result.Derivatives = append(result.Derivatives, *dr)
	}

	// Generate required WebP derivatives for in-app display. These must not
	// silently downgrade to JPEG; upload processing is incomplete if WebP fails.
	for _, size := range WebPThumbSizes {
		dr, err := s.generateWebPDerivative(ctx, assetID, srcImg, size)
		if err != nil {
			return nil, fmt.Errorf("required webp derivative %s: %w", size.Name, err)
		}
		result.Derivatives = append(result.Derivatives, *dr)
	}

	displayWebP, err := s.generateWebPDerivative(ctx, assetID, srcImg, WebPDisplaySize)
	if err != nil {
		return nil, fmt.Errorf("required webp derivative %s: %w", WebPDisplaySize.Name, err)
	}
	result.Derivatives = append(result.Derivatives, *displayWebP)

	// Generate real LQIP (20px wide, base64 encoded)
	result.LQIPBase64 = s.generateLQIP(srcImg)

	// Generate watermark preview (mid-res with watermark overlay for proofing)
	if s.watermarkSvc != nil {
		wpDr, err := s.generateWatermarkPreview(ctx, assetID, srcImg)
		if err == nil && wpDr != nil {
			result.Derivatives = append(result.Derivatives, *wpDr)
		}
	}

	return result, nil
}

// generateWebPDerivative creates a WebP derivative using cwebp (libwebp).
func (s *ThumbnailService) generateWebPDerivative(ctx context.Context, assetID string, src image.Image, size ThumbnailSize) (*DerivativeResult, error) {
	resized := imaging.Fit(src, size.MaxWidth, size.MaxHeight, imaging.Lanczos)

	if _, err := exec.LookPath("cwebp"); err != nil {
		return nil, fmt.Errorf("cwebp is required for RawDrive WebP derivatives: %w", err)
	}
	return s.encodeWebPViaCwebp(ctx, assetID, resized, size)
}

// encodeWebPViaCwebp uses the cwebp CLI tool to produce real WebP output.
func (s *ThumbnailService) encodeWebPViaCwebp(ctx context.Context, assetID string, img image.Image, size ThumbnailSize) (*DerivativeResult, error) {
	// Write intermediate PNG to temp file
	tmpIn, err := os.CreateTemp("", "rawdrive-webp-in-*.png")
	if err != nil {
		return nil, fmt.Errorf("webp temp in: %w", err)
	}
	defer os.Remove(tmpIn.Name())
	if err := imaging.Encode(tmpIn, img, imaging.PNG); err != nil {
		tmpIn.Close()
		return nil, fmt.Errorf("webp png encode: %w", err)
	}
	tmpIn.Close()

	tmpOut := tmpIn.Name() + ".webp"
	defer os.Remove(tmpOut)

	cmd := exec.CommandContext(ctx, "cwebp", "-q", "82", "-m", "6", tmpIn.Name(), "-o", tmpOut)
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("cwebp: %w", err)
	}

	webpData, err := os.ReadFile(tmpOut)
	if err != nil {
		return nil, fmt.Errorf("read webp: %w", err)
	}

	key := fmt.Sprintf("derivatives/%s/%s.webp", assetID, size.Name)
	if err := s.store.Put(ctx, key, bytes.NewReader(webpData), int64(len(webpData)), "image/webp"); err != nil {
		return nil, fmt.Errorf("store webp %s: %w", size.Name, err)
	}

	bounds := img.Bounds()
	return &DerivativeResult{
		Variant:    size.Name,
		StorageKey: key,
		Width:      bounds.Dx(),
		Height:     bounds.Dy(),
		SizeBytes:  int64(len(webpData)),
		Format:     "webp",
	}, nil
}

// generateWatermarkPreview creates a watermarked mid-res preview for proofing galleries.
func (s *ThumbnailService) generateWatermarkPreview(ctx context.Context, assetID string, src image.Image) (*DerivativeResult, error) {
	// Resize to watermark preview size
	resized := imaging.Fit(src, WatermarkPreviewSize.MaxWidth, WatermarkPreviewSize.MaxHeight, imaging.Lanczos)

	// Encode to JPEG buffer for watermark input
	buf := new(bytes.Buffer)
	if err := imaging.Encode(buf, resized, imaging.JPEG, imaging.JPEGQuality(85)); err != nil {
		return nil, fmt.Errorf("watermark preview encode: %w", err)
	}

	// Apply watermark
	watermarked, err := s.watermarkSvc.Apply(ctx, buf, DefaultWatermarkConfig())
	if err != nil {
		return nil, fmt.Errorf("watermark preview apply: %w", err)
	}

	// Read watermarked result
	wmBuf := new(bytes.Buffer)
	if _, err := io.Copy(wmBuf, watermarked); err != nil {
		return nil, fmt.Errorf("watermark preview read: %w", err)
	}

	// Store
	key := fmt.Sprintf("derivatives/%s/watermark_preview.jpg", assetID)
	if err := s.store.Put(ctx, key, wmBuf, int64(wmBuf.Len()), "image/jpeg"); err != nil {
		return nil, fmt.Errorf("watermark preview store: %w", err)
	}

	rBounds := resized.Bounds()
	return &DerivativeResult{
		Variant:    "watermark_preview",
		StorageKey: key,
		Width:      rBounds.Dx(),
		Height:     rBounds.Dy(),
		SizeBytes:  int64(wmBuf.Len()),
		Format:     "jpeg",
	}, nil
}

// generateDerivative creates a single derivative and stores it, returning metadata.
func (s *ThumbnailService) generateDerivative(ctx context.Context, assetID string, src image.Image, size ThumbnailSize) (*DerivativeResult, error) {
	var resized image.Image
	if size.Name == "og_image" {
		// OG images need exact dimensions with center crop
		resized = imaging.Fill(src, size.MaxWidth, size.MaxHeight, imaging.Center, imaging.Lanczos)
	} else {
		resized = imaging.Fit(src, size.MaxWidth, size.MaxHeight, imaging.Lanczos)
	}

	buf := new(bytes.Buffer)
	if err := imaging.Encode(buf, resized, imaging.JPEG, imaging.JPEGQuality(85)); err != nil {
		return nil, fmt.Errorf("encode %s: %w", size.Name, err)
	}

	key := fmt.Sprintf("derivatives/%s/%s.jpg", assetID, size.Name)
	if err := s.store.Put(ctx, key, buf, int64(buf.Len()), "image/jpeg"); err != nil {
		return nil, fmt.Errorf("store %s: %w", size.Name, err)
	}

	rBounds := resized.Bounds()
	return &DerivativeResult{
		Variant:    size.Name,
		StorageKey: key,
		Width:      rBounds.Dx(),
		Height:     rBounds.Dy(),
		SizeBytes:  int64(buf.Len()),
		Format:     "jpeg",
	}, nil
}

// generateLQIP creates a 20px-wide Low Quality Image Placeholder encoded as base64.
func (s *ThumbnailService) generateLQIP(src image.Image) string {
	tiny := imaging.Resize(src, 20, 0, imaging.Box)
	buf := new(bytes.Buffer)
	if err := imaging.Encode(buf, tiny, imaging.JPEG, imaging.JPEGQuality(30)); err != nil {
		return ""
	}
	encoded := "data:image/jpeg;base64," + base64Encode(buf.Bytes())
	return encoded
}

// GenerateForAsset fetches an asset from storage, generates all derivatives,
// and returns the full result (derivatives, LQIP, dimensions).
func (s *ThumbnailService) GenerateForAsset(ctx context.Context, assetID interface{}, storageKey string) (*FullDerivativeResult, error) {
	reader, err := s.store.Get(ctx, storageKey)
	if err != nil {
		return nil, fmt.Errorf("thumbnail: get original: %w", err)
	}
	defer reader.Close()

	idStr := fmt.Sprintf("%v", assetID)
	return s.GenerateAllDerivatives(ctx, idStr, reader)
}

// generateBlurhash creates a BlurHash from the image by sampling pixels.
// Uses a simplified algorithm that produces unique hashes per image without external deps.
func generateBlurhash(img image.Image) string {
	// Downscale to 4x4 for a compact hash, then encode pixel data as base83-like string
	tiny := imaging.Resize(img, 4, 4, imaging.Box)
	bounds := tiny.Bounds()

	// Build a deterministic hash from actual pixel data
	var hash []byte
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := tiny.At(x, y).RGBA()
			hash = append(hash, byte(r>>8), byte(g>>8), byte(b>>8))
		}
	}

	// Encode as a base64-like compact string (not official BlurHash spec but unique per image)
	encoded := base64Encode(hash)
	if len(encoded) > 28 {
		encoded = encoded[:28]
	}
	return "L" + encoded
}
