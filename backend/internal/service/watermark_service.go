package service

// Watermark baking — burns the gallery's configured text watermark into a
// JPEG copy of the source image and returns the encoded stream. This is the
// download path counterpart to the CSS overlay used in the public viewer
// (frontend/src/components/gallery/public-gallery-grid.tsx).
//
// 2026-05-18: rewritten from a gray-stripe stub that ignored cfg.Text. The
// previous implementation drew translucent gray rectangles regardless of
// which text the photographer configured — clients downloading "watermarked"
// proofs received plain gray boxes with no studio name visible. This version
// uses golang.org/x/image/font/basicfont for true text rendering, scales the
// 7×13 base glyphs up via imaging.Resize, and composites at four positions
// matching the settings UI (center / bottom-right / bottom-left / diagonal).

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
	"strings"

	"github.com/disintegration/imaging"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// WatermarkConfig controls watermark appearance.
type WatermarkConfig struct {
	Text     string  `json:"text"`
	Position string  `json:"position"` // "center", "bottom-right", "bottom-left", "diagonal" (tiled rotated grid). "tiled" accepted as alias for "diagonal".
	Opacity  float64 `json:"opacity"`  // 0.0-1.0
	FontSize int     `json:"font_size"`
}

// DefaultWatermarkConfig returns a sensible default config.
func DefaultWatermarkConfig() WatermarkConfig {
	return WatermarkConfig{
		Text:     "PROOF",
		Position: "center",
		Opacity:  0.4,
		FontSize: 48,
	}
}

// WatermarkService applies watermarks to images.
type WatermarkService struct{}

// NewWatermarkService creates a new WatermarkService.
func NewWatermarkService() *WatermarkService {
	return &WatermarkService{}
}

// Apply overlays a watermark on the source image and returns the watermarked image
// as a JPEG stream. Returns an error if the source can't be decoded as an image
// (e.g. RAW / HEIC content — callers must skip baking for those content types).
func (s *WatermarkService) Apply(_ context.Context, src io.Reader, cfg WatermarkConfig) (io.Reader, error) {
	srcImg, err := imaging.Decode(src)
	if err != nil {
		return nil, fmt.Errorf("watermark: decode source: %w", err)
	}

	text := strings.TrimSpace(cfg.Text)
	if text == "" {
		// No text means no overlay — re-encode the source so the caller still
		// gets a JPEG byte stream (consistent return type).
		return encodeJPEG(srcImg)
	}

	opacity := cfg.Opacity
	if opacity <= 0 {
		opacity = 0.4
	}
	if opacity > 1 {
		opacity = 1
	}

	position := cfg.Position
	if position == "" {
		position = "bottom-right"
	}

	srcBounds := srcImg.Bounds()
	srcW, srcH := srcBounds.Dx(), srcBounds.Dy()

	overlay := image.NewNRGBA(srcBounds)

	switch position {
	case "center":
		// Large rotated banner across the middle. Target width ~70% of the
		// shorter side so it stays legible without overflowing.
		target := minInt(srcW, srcH) * 7 / 10
		tile := buildTextTile(text, target, opacity)
		// Rotate -30° to match the CSS overlay's transform.
		rotated := imaging.Rotate(tile, 30, color.NRGBA{0, 0, 0, 0})
		rb := rotated.Bounds()
		offsetX := (srcW - rb.Dx()) / 2
		offsetY := (srcH - rb.Dy()) / 2
		draw.Draw(overlay, rb.Add(image.Point{X: offsetX, Y: offsetY}), rotated, rb.Min, draw.Over)

	case "diagonal", "tiled":
		// Repeating rotated tile. Step is sized so adjacent tiles don't
		// overlap horizontally but cover the whole frame after rotation.
		// Each tile is rendered once then stamped across the canvas.
		target := minInt(srcW, srcH) / 4
		if target < 80 {
			target = 80
		}
		tile := buildTextTile(text, target, opacity)
		rotated := imaging.Rotate(tile, 30, color.NRGBA{0, 0, 0, 0})
		rb := rotated.Bounds()
		// Step ~ 1.4× the rotated bounding box so the pattern feels dense
		// but tiles don't fully overlap.
		stepX := int(float64(rb.Dx()) * 1.4)
		stepY := int(float64(rb.Dy()) * 1.4)
		if stepX < 100 {
			stepX = 100
		}
		if stepY < 100 {
			stepY = 100
		}
		for y := -rb.Dy(); y < srcH; y += stepY {
			// Offset every other row by half a step so the pattern reads
			// as a true diagonal grid, not orderly columns.
			xOffset := 0
			if (y/stepY)%2 != 0 {
				xOffset = stepX / 2
			}
			for x := -rb.Dx() + xOffset; x < srcW; x += stepX {
				draw.Draw(
					overlay,
					rb.Add(image.Point{X: x, Y: y}),
					rotated,
					rb.Min,
					draw.Over,
				)
			}
		}

	case "bottom-left", "bottom-right":
		// Corner mark. Smaller — ~20% of the shorter side, no rotation.
		target := minInt(srcW, srcH) / 5
		if target < 80 {
			target = 80
		}
		tile := buildTextTile(text, target, opacity)
		tb := tile.Bounds()
		pad := 24
		offsetX := srcW - tb.Dx() - pad
		if position == "bottom-left" {
			offsetX = pad
		}
		offsetY := srcH - tb.Dy() - pad
		draw.Draw(overlay, tb.Add(image.Point{X: offsetX, Y: offsetY}), tile, tb.Min, draw.Over)

	default:
		// Unknown position — treat as bottom-right.
		target := minInt(srcW, srcH) / 5
		tile := buildTextTile(text, target, opacity)
		tb := tile.Bounds()
		pad := 24
		draw.Draw(overlay, tb.Add(image.Point{X: srcW - tb.Dx() - pad, Y: srcH - tb.Dy() - pad}), tile, tb.Min, draw.Over)
	}

	result := image.NewRGBA(srcBounds)
	draw.Draw(result, srcBounds, srcImg, srcBounds.Min, draw.Src)
	draw.Draw(result, srcBounds, overlay, srcBounds.Min, draw.Over)

	return encodeJPEG(result)
}

// buildTextTile renders the configured text as a white NRGBA image with a
// dark drop-shadow stroke for legibility on both bright and dark photos. The
// glyph cell starts at basicfont.Face7x13's native 7×13 size; the rendered
// image is upscaled with imaging.Resize so the configured `targetWidth`
// dictates the final pixel size. Opacity is applied to the source ink so the
// composite step (draw.Over) blends naturally.
func buildTextTile(text string, targetWidth int, opacity float64) *image.NRGBA {
	face := basicfont.Face7x13
	textW := font.MeasureString(face, text).Ceil()
	if textW <= 0 {
		textW = len(text) * 7
	}
	ascent := face.Metrics().Ascent.Ceil()
	descent := face.Metrics().Descent.Ceil()
	textH := ascent + descent
	// Padding around the glyph cell so the shadow stroke doesn't get
	// clipped on resize.
	pad := 2

	base := image.NewNRGBA(image.Rect(0, 0, textW+pad*2, textH+pad*2))

	alpha := uint8(255 * opacity)
	if alpha < 32 {
		// Below 32/255 the text disappears against busy photos. Floor at
		// 32 (≈ 12%) so the photographer's chosen opacity still produces a
		// visible mark.
		alpha = 32
	}

	// Drop shadow — 1 px offset in semi-transparent black improves
	// readability on bright photos without needing a full backdrop scrim.
	shadow := &font.Drawer{
		Dst:  base,
		Src:  image.NewUniform(color.NRGBA{0, 0, 0, alpha / 2}),
		Face: face,
		Dot:  fixed.P(pad+1, pad+ascent+1),
	}
	shadow.DrawString(text)

	// Main glyphs — white at the configured opacity.
	ink := &font.Drawer{
		Dst:  base,
		Src:  image.NewUniform(color.NRGBA{255, 255, 255, alpha}),
		Face: face,
		Dot:  fixed.P(pad, pad+ascent),
	}
	ink.DrawString(text)

	if targetWidth <= 0 || targetWidth <= base.Bounds().Dx() {
		return base
	}
	scaled := imaging.Resize(base, targetWidth, 0, imaging.Lanczos)
	// imaging.Resize returns *image.NRGBA, which is what we need.
	return scaled
}

func encodeJPEG(img image.Image) (io.Reader, error) {
	buf := new(bytes.Buffer)
	if err := imaging.Encode(buf, img, imaging.JPEG, imaging.JPEGQuality(85)); err != nil {
		return nil, fmt.Errorf("watermark: encode result: %w", err)
	}
	return buf, nil
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// IsEnabled reports whether the gallery's watermark_config JSONB blob (as
// loaded from Postgres) represents an active, baked-on-download watermark.
// Centralizes the loose-typing checks so handlers don't re-implement them.
func IsEnabled(cfg map[string]interface{}) bool {
	if cfg == nil {
		return false
	}
	v, _ := cfg["enabled"].(bool)
	if !v {
		return false
	}
	text, _ := cfg["text"].(string)
	return strings.TrimSpace(text) != ""
}

// ConfigFromMap converts the JSONB-loaded settings map into the typed
// WatermarkConfig the service consumes. Tolerates float64 opacity (1-100 or
// 0-1), missing fields, and the settings UI's "diagonal" position label.
func ConfigFromMap(cfg map[string]interface{}) WatermarkConfig {
	out := DefaultWatermarkConfig()
	if cfg == nil {
		return out
	}
	if text, ok := cfg["text"].(string); ok {
		out.Text = text
	}
	if pos, ok := cfg["position"].(string); ok && pos != "" {
		out.Position = pos
	}
	if op, ok := cfg["opacity"].(float64); ok {
		// Settings UI stores opacity as 10..90 (integer percent); also accept
		// 0..1 floats so direct API calls keep working.
		if op > 1 {
			out.Opacity = op / 100
		} else if op > 0 {
			out.Opacity = op
		}
	}
	if fs, ok := cfg["font_size"].(float64); ok && fs > 0 {
		out.FontSize = int(fs)
	}
	return out
}
