package service

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"

	"github.com/disintegration/imaging"
	"golang.org/x/image/webp"
)

// GAL-FR-060 — Cover auto-compress/resize for delivery optimization.
//
// The cover system must produce three WebP-friendly variants for the CDN
// delivery path:
//
//   - hero:   1920px wide (full-bleed header)
//   - card:   1280px wide (gallery list card)
//   - thumb:   640px wide (gallery picker)
//
// The variants preserve the original aspect ratio. Because the rest of the
// codebase uses cwebp for WebP encoding (see the processing pipeline), we
// keep the in-process encoder at JPEG quality 85 here and let the pipeline
// convert to WebP. This keeps the service free of CGO and testable without
// shelling out to cwebp.

// CoverVariantSpec describes a single cover variant target.
type CoverVariantSpec struct {
	Name      string // "hero", "card", "thumb"
	MaxWidth  int
	JPEGQuality int
}

// DefaultCoverVariantSpecs returns the canonical variant set.
func DefaultCoverVariantSpecs() []CoverVariantSpec {
	return []CoverVariantSpec{
		{Name: "hero", MaxWidth: 1920, JPEGQuality: 85},
		{Name: "card", MaxWidth: 1280, JPEGQuality: 82},
		{Name: "thumb", MaxWidth: 640, JPEGQuality: 80},
	}
}

// CoverVariant is the encoded output for one spec.
type CoverVariant struct {
	Name   string
	Width  int
	Height int
	Bytes  []byte
}

// GenerateCoverVariants decodes the supplied image and returns resized +
// recompressed variants. The input reader is consumed once. If the source is
// already smaller than a variant's MaxWidth, the variant is produced at the
// source width (no upscaling).
func GenerateCoverVariants(contentType string, src io.Reader, specs []CoverVariantSpec) ([]CoverVariant, error) {
	if len(specs) == 0 {
		specs = DefaultCoverVariantSpecs()
	}

	img, err := decodeCoverImage(contentType, src)
	if err != nil {
		return nil, err
	}

	variants := make([]CoverVariant, 0, len(specs))
	for _, spec := range specs {
		v, err := renderVariant(img, spec)
		if err != nil {
			return nil, fmt.Errorf("render variant %s: %w", spec.Name, err)
		}
		variants = append(variants, v)
	}
	return variants, nil
}

func decodeCoverImage(contentType string, src io.Reader) (image.Image, error) {
	// Normalize content type.
	ct := normalizeContentType(contentType)
	switch ct {
	case "image/jpeg", "image/jpg":
		return jpeg.Decode(src)
	case "image/png":
		return png.Decode(src)
	case "image/webp":
		return webp.Decode(src)
	}
	return nil, fmt.Errorf("unsupported source content type %q", contentType)
}

func normalizeContentType(ct string) string {
	// Light normalization: lower-case + strip params. The cover_validation
	// layer does the strict whitelist check; this is just for decoder dispatch.
	out := ""
	for _, c := range ct {
		if c == ';' {
			break
		}
		if c >= 'A' && c <= 'Z' {
			c = c + 32
		}
		out += string(c)
	}
	// Trim spaces.
	for len(out) > 0 && out[0] == ' ' {
		out = out[1:]
	}
	for len(out) > 0 && out[len(out)-1] == ' ' {
		out = out[:len(out)-1]
	}
	return out
}

func renderVariant(src image.Image, spec CoverVariantSpec) (CoverVariant, error) {
	if spec.MaxWidth <= 0 {
		return CoverVariant{}, errors.New("variant max width must be > 0")
	}

	srcBounds := src.Bounds()
	srcWidth := srcBounds.Dx()
	srcHeight := srcBounds.Dy()
	if srcWidth == 0 || srcHeight == 0 {
		return CoverVariant{}, errors.New("source image has zero dimensions")
	}

	targetWidth := spec.MaxWidth
	if srcWidth < targetWidth {
		targetWidth = srcWidth // no upscaling
	}
	// Preserve aspect ratio.
	targetHeight := int(float64(targetWidth) * float64(srcHeight) / float64(srcWidth))
	if targetHeight < 1 {
		targetHeight = 1
	}

	resized := imaging.Resize(src, targetWidth, targetHeight, imaging.Lanczos)

	var buf bytes.Buffer
	quality := spec.JPEGQuality
	if quality <= 0 || quality > 100 {
		quality = 85
	}
	if err := jpeg.Encode(&buf, resized, &jpeg.Options{Quality: quality}); err != nil {
		return CoverVariant{}, fmt.Errorf("encode jpeg: %w", err)
	}

	return CoverVariant{
		Name:   spec.Name,
		Width:  targetWidth,
		Height: targetHeight,
		Bytes:  buf.Bytes(),
	}, nil
}
