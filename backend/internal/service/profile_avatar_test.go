package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"os/exec"
	"testing"
)

func TestRenderAvatarCropWebPProducesWebP(t *testing.T) {
	if _, err := exec.LookPath("cwebp"); err != nil {
		t.Skip("cwebp not installed")
	}
	src := image.NewNRGBA(image.Rect(0, 0, 120, 80))
	for y := 0; y < 80; y++ {
		for x := 0; x < 120; x++ {
			src.Set(x, y, color.NRGBA{R: uint8(x), G: uint8(y), B: 120, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, src, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}

	got, err := RenderAvatarCropWebP(context.Background(), bytes.NewReader(buf.Bytes()), AvatarCropPosition{
		X:    0.4,
		Y:    -0.2,
		Zoom: 1.7,
	}, 96)
	if err != nil {
		t.Fatalf("RenderAvatarCropWebP returned error: %v", err)
	}
	if len(got) < 12 || string(got[:4]) != "RIFF" || string(got[8:12]) != "WEBP" {
		t.Fatalf("expected WEBP bytes, got first bytes %q", got[:min(len(got), 12)])
	}
}
