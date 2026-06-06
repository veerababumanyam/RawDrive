package service

import (
	"context"
	"errors"
	"fmt"
	"image"
	"io"
	"math"

	xdraw "golang.org/x/image/draw"

	"github.com/rawdrive/backend/internal/imageops"
)

// LogoCropPosition is the persisted crop contract for the PUBLIC business logo.
// Unlike the avatar (forced 1:1 square), the logo preserves the SOURCE aspect
// ratio (free-aspect, fit-to-contain) so wide wordmarks are never clipped.
// X/Y are normalized offsets in -1..1; Zoom starts at 1 (the whole logo).
type LogoCropPosition struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

// RenderLogoCropWebP decodes, optionally crops (preserving source aspect), fits
// the result inside maxDim x maxDim (never upscaling), and WebP-encodes it.
// Alpha is preserved (PNG -> cwebp) so transparent brand logos stay transparent.
// This is a public brand mark — no encryption, mirroring the avatar pipeline.
func RenderLogoCropWebP(ctx context.Context, src io.Reader, pos LogoCropPosition, maxDim int) ([]byte, error) {
	if maxDim <= 0 {
		maxDim = 640
	}
	img, err := imageops.Decode(src, true)
	if err != nil {
		return nil, fmt.Errorf("decode logo: %w", err)
	}
	cropped, err := cropContainAspect(img, normalizeLogoCrop(pos))
	if err != nil {
		return nil, err
	}
	b := cropped.Bounds()
	tw, th := fitWithin(b.Dx(), b.Dy(), maxDim)
	resized := imageops.Resize(cropped, tw, th, true)
	return encodeWebPWithCwebp(ctx, resized)
}

func normalizeLogoCrop(pos LogoCropPosition) LogoCropPosition {
	if pos.Zoom < 1 {
		pos.Zoom = 1
	}
	if pos.Zoom > 4 {
		pos.Zoom = 4
	}
	pos.X = clampFloat(pos.X, -1, 1)
	pos.Y = clampFloat(pos.Y, -1, 1)
	return pos
}

// cropContainAspect crops a window that PRESERVES the source aspect ratio,
// scaled down by Zoom and offset by X/Y. At Zoom=1, X=Y=0 it returns the whole
// image unchanged (the full logo), which is the fit-to-contain default.
func cropContainAspect(src image.Image, pos LogoCropPosition) (image.Image, error) {
	b := src.Bounds()
	sw := b.Dx()
	sh := b.Dy()
	if sw <= 0 || sh <= 0 {
		return nil, errors.New("logo source has zero dimensions")
	}
	cw := clampInt(int(math.Round(float64(sw)/pos.Zoom)), 1, sw)
	ch := clampInt(int(math.Round(float64(sh)/pos.Zoom)), 1, sh)
	if cw == sw && ch == sh {
		return src, nil
	}
	maxX := sw - cw
	maxY := sh - ch
	x0 := clampInt(int(math.Round(float64(maxX)/2+pos.X*float64(maxX)/2)), 0, maxX)
	y0 := clampInt(int(math.Round(float64(maxY)/2+pos.Y*float64(maxY)/2)), 0, maxY)
	dst := image.NewNRGBA(image.Rect(0, 0, cw, ch))
	xdraw.Draw(dst, dst.Bounds(), src, image.Point{X: b.Min.X + x0, Y: b.Min.Y + y0}, xdraw.Src)
	return dst, nil
}

// fitWithin scales (w,h) down to fit inside max x max, preserving aspect.
// It never upscales — a small logo keeps its native size.
func fitWithin(w, h, max int) (int, int) {
	if w <= 0 || h <= 0 {
		return max, max
	}
	if w <= max && h <= max {
		return w, h
	}
	scale := math.Min(float64(max)/float64(w), float64(max)/float64(h))
	tw := clampInt(int(math.Round(float64(w)*scale)), 1, max)
	th := clampInt(int(math.Round(float64(h)*scale)), 1, max)
	return tw, th
}

func clampFloat(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
