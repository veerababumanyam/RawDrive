package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"

	"github.com/rawdrive/backend/internal/storage"
	"github.com/stretchr/testify/require"
)

func TestGenerateAllDerivativesRequiresCwebp(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	img := image.NewRGBA(image.Rect(0, 0, 20, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 20; x++ {
			img.Set(x, y, color.RGBA{R: 180, G: 90, B: 40, A: 255})
		}
	}

	var src bytes.Buffer
	require.NoError(t, png.Encode(&src, img))

	svc := NewThumbnailService(storage.NewLocalDriver(t.TempDir()))
	_, err := svc.GenerateAllDerivatives(context.Background(), "asset-webp-required", bytes.NewReader(src.Bytes()))
	require.Error(t, err)
	require.Contains(t, strings.ToLower(err.Error()), "cwebp")
}
