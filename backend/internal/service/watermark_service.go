package service

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	_ "image/png"
	"io"

	"github.com/disintegration/imaging"
)

// WatermarkConfig controls watermark appearance.
type WatermarkConfig struct {
	Text     string  `json:"text"`
	Position string  `json:"position"` // "center", "bottom-right", "bottom-left", "tiled"
	Opacity  float64 `json:"opacity"`  // 0.0-1.0
	FontSize int     `json:"font_size"`
}

// DefaultWatermarkConfig returns a sensible default config.
func DefaultWatermarkConfig() WatermarkConfig {
	return WatermarkConfig{
		Text:     "PROOF",
		Position: "center",
		Opacity:  0.3,
		FontSize: 48,
	}
}

// WatermarkService applies watermarks to images.
type WatermarkService struct{}

// NewWatermarkService creates a new WatermarkService.
func NewWatermarkService() *WatermarkService {
	return &WatermarkService{}
}

// Apply overlays a watermark on the source image and returns the watermarked image.
func (s *WatermarkService) Apply(ctx context.Context, src io.Reader, cfg WatermarkConfig) (io.Reader, error) {
	srcImg, err := imaging.Decode(src)
	if err != nil {
		return nil, fmt.Errorf("watermark: decode source: %w", err)
	}

	// Create watermark overlay
	bounds := srcImg.Bounds()
	overlay := image.NewRGBA(bounds)

	// Apply semi-transparent gray overlay for the watermark area
	opacity := uint8(cfg.Opacity * 255)
	watermarkColor := color.NRGBA{R: 200, G: 200, B: 200, A: opacity}

	switch cfg.Position {
	case "center":
		// Draw a centered stripe
		stripeH := bounds.Dy() / 6
		stripeY := (bounds.Dy() - stripeH) / 2
		for y := stripeY; y < stripeY+stripeH; y++ {
			for x := 0; x < bounds.Dx(); x++ {
				overlay.Set(x, y, watermarkColor)
			}
		}
	case "tiled":
		// Draw a diagonal grid pattern
		for y := 0; y < bounds.Dy(); y += 100 {
			for x := 0; x < bounds.Dx(); x += 200 {
				for dy := 0; dy < 20; dy++ {
					for dx := 0; dx < 100; dx++ {
						if y+dy < bounds.Dy() && x+dx < bounds.Dx() {
							overlay.Set(x+dx, y+dy, watermarkColor)
						}
					}
				}
			}
		}
	default:
		// Bottom-right corner
		cornerW := bounds.Dx() / 4
		cornerH := bounds.Dy() / 8
		startX := bounds.Dx() - cornerW
		startY := bounds.Dy() - cornerH
		for y := startY; y < bounds.Dy(); y++ {
			for x := startX; x < bounds.Dx(); x++ {
				overlay.Set(x, y, watermarkColor)
			}
		}
	}

	// Composite: original + overlay
	result := image.NewRGBA(bounds)
	draw.Draw(result, bounds, srcImg, bounds.Min, draw.Src)
	draw.Draw(result, bounds, overlay, bounds.Min, draw.Over)

	buf := new(bytes.Buffer)
	if err := imaging.Encode(buf, result, imaging.JPEG, imaging.JPEGQuality(85)); err != nil {
		return nil, fmt.Errorf("watermark: encode result: %w", err)
	}

	return buf, nil
}
