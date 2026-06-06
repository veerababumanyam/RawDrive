package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"io"
	"math"
	"os"
	"os/exec"

	xdraw "golang.org/x/image/draw"

	"github.com/rawdrive/backend/internal/imageops"
)

// AvatarCropPosition is the persisted crop contract used by the profile UI.
// X/Y are normalized offsets in the -1..1 range, Zoom starts at 1.
type AvatarCropPosition struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Zoom   float64 `json:"zoom"`
	Aspect float64 `json:"aspect"`
}

// RenderAvatarCropWebP decodes, crops, resizes, and WebP-encodes an avatar.
// It mirrors the existing derivative stack by shelling out to cwebp, avoiding a
// new image dependency while still producing WebP output for in-app display.
func RenderAvatarCropWebP(ctx context.Context, src io.Reader, pos AvatarCropPosition, size int) ([]byte, error) {
	if size <= 0 {
		size = 640
	}
	img, err := imageops.Decode(src, true)
	if err != nil {
		return nil, fmt.Errorf("decode avatar: %w", err)
	}
	cropped, err := cropSquare(img, normalizeAvatarCrop(pos))
	if err != nil {
		return nil, err
	}
	resized := imageops.Resize(cropped, size, size, true)
	return encodeWebPWithCwebp(ctx, resized)
}

func normalizeAvatarCrop(pos AvatarCropPosition) AvatarCropPosition {
	if pos.Zoom < 1 {
		pos.Zoom = 1
	}
	if pos.Zoom > 4 {
		pos.Zoom = 4
	}
	if pos.X < -1 {
		pos.X = -1
	}
	if pos.X > 1 {
		pos.X = 1
	}
	if pos.Y < -1 {
		pos.Y = -1
	}
	if pos.Y > 1 {
		pos.Y = 1
	}
	if pos.Aspect <= 0 {
		pos.Aspect = 1
	}
	return pos
}

func cropSquare(src image.Image, pos AvatarCropPosition) (image.Image, error) {
	b := src.Bounds()
	sw := b.Dx()
	sh := b.Dy()
	if sw <= 0 || sh <= 0 {
		return nil, errors.New("avatar source has zero dimensions")
	}

	base := math.Min(float64(sw), float64(sh))
	cropSize := int(math.Round(base / pos.Zoom))
	if cropSize < 1 {
		cropSize = 1
	}
	if cropSize > sw {
		cropSize = sw
	}
	if cropSize > sh {
		cropSize = sh
	}

	maxX := sw - cropSize
	maxY := sh - cropSize
	centerX := float64(maxX)/2 + pos.X*float64(maxX)/2
	centerY := float64(maxY)/2 + pos.Y*float64(maxY)/2
	x0 := clampInt(int(math.Round(centerX)), 0, maxX)
	y0 := clampInt(int(math.Round(centerY)), 0, maxY)

	dst := image.NewNRGBA(image.Rect(0, 0, cropSize, cropSize))
	xdraw.Draw(
		dst,
		dst.Bounds(),
		src,
		image.Point{X: b.Min.X + x0, Y: b.Min.Y + y0},
		xdraw.Src,
	)
	return dst, nil
}

func clampInt(v, minValue, maxValue int) int {
	if v < minValue {
		return minValue
	}
	if v > maxValue {
		return maxValue
	}
	return v
}

func encodeWebPWithCwebp(ctx context.Context, img image.Image) ([]byte, error) {
	cwebp, err := exec.LookPath("cwebp")
	if err != nil {
		return nil, fmt.Errorf("cwebp is required for profile avatar WebP crops: %w", err)
	}

	tmpIn, err := os.CreateTemp("", "rawdrive-profile-avatar-*.png")
	if err != nil {
		return nil, fmt.Errorf("avatar temp in: %w", err)
	}
	defer os.Remove(tmpIn.Name())
	if err := imageops.EncodePNG(tmpIn, img); err != nil {
		tmpIn.Close()
		return nil, fmt.Errorf("avatar png encode: %w", err)
	}
	if err := tmpIn.Close(); err != nil {
		return nil, fmt.Errorf("avatar temp close: %w", err)
	}

	tmpOut := tmpIn.Name() + ".webp"
	defer os.Remove(tmpOut)

	cmd := exec.CommandContext(ctx, cwebp, "-q", "86", "-m", "4", tmpIn.Name(), "-o", tmpOut)
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("cwebp avatar crop: %w: %s", err, bytes.TrimSpace(out))
	}

	data, err := os.ReadFile(tmpOut)
	if err != nil {
		return nil, fmt.Errorf("read avatar webp: %w", err)
	}
	return data, nil
}
