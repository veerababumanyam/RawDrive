package service

import (
	"errors"
	"fmt"
	"image"
	"io"
	"strings"

	// Registered image decoders — the standard library only supports JPEG/PNG/GIF
	// natively; the x/image WebP decoder registers itself via a side-effect import.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

// GAL-FR-059 — Cover photo validation.
const (
	CoverMaxBytes       = 15 * 1024 * 1024
	CoverMinWidthPx     = 800
	CoverMinHeightPx    = 600
	CoverMaxDimensionPx = 10000
)

// AllowedCoverContentTypes is the whitelist of MIME types for cover uploads.
var AllowedCoverContentTypes = map[string]bool{
	"image/jpeg": true,
	"image/jpg":  true, // non-standard but common from iOS
	"image/png":  true,
	"image/webp": true,
}

// CoverValidationResult captures the decoded image dimensions so callers can
// persist them alongside the cover record without re-decoding.
type CoverValidationResult struct {
	ContentType string
	SizeBytes   int64
	Width       int
	Height      int
}

// ValidateCoverMetadata performs the cheap checks (content type, size) that
// don't require decoding the image body.
func ValidateCoverMetadata(contentType string, sizeBytes int64) error {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if idx := strings.Index(ct, ";"); idx > 0 {
		ct = strings.TrimSpace(ct[:idx])
	}
	if !AllowedCoverContentTypes[ct] {
		return fmt.Errorf("unsupported cover content type %q — must be image/jpeg, image/png, or image/webp", contentType)
	}
	if sizeBytes <= 0 {
		return errors.New("cover file is empty")
	}
	if sizeBytes > CoverMaxBytes {
		return fmt.Errorf("cover file is %d bytes — maximum allowed is %d bytes (15 MB)", sizeBytes, CoverMaxBytes)
	}
	return nil
}

// ValidateCoverImage runs the full validation pipeline: metadata + image
// decode + dimension checks. The reader is consumed.
func ValidateCoverImage(contentType string, sizeBytes int64, r io.Reader) (*CoverValidationResult, error) {
	if err := ValidateCoverMetadata(contentType, sizeBytes); err != nil {
		return nil, err
	}

	cfg, format, err := image.DecodeConfig(r)
	if err != nil {
		return nil, fmt.Errorf("cover image decode failed: %w", err)
	}

	if !formatMatchesContentType(format, contentType) {
		return nil, fmt.Errorf("cover content type %q does not match decoded image format %q", contentType, format)
	}

	if cfg.Width < CoverMinWidthPx || cfg.Height < CoverMinHeightPx {
		return nil, fmt.Errorf("cover image is %dx%d — minimum size is %dx%d", cfg.Width, cfg.Height, CoverMinWidthPx, CoverMinHeightPx)
	}
	if cfg.Width > CoverMaxDimensionPx || cfg.Height > CoverMaxDimensionPx {
		return nil, fmt.Errorf("cover image is %dx%d — maximum dimension is %dpx per side", cfg.Width, cfg.Height, CoverMaxDimensionPx)
	}

	return &CoverValidationResult{
		ContentType: contentType,
		SizeBytes:   sizeBytes,
		Width:       cfg.Width,
		Height:      cfg.Height,
	}, nil
}

func formatMatchesContentType(format, contentType string) bool {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if idx := strings.Index(ct, ";"); idx > 0 {
		ct = strings.TrimSpace(ct[:idx])
	}
	switch format {
	case "jpeg":
		return ct == "image/jpeg" || ct == "image/jpg"
	case "png":
		return ct == "image/png"
	case "webp":
		return ct == "image/webp"
	}
	return false
}
