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

func TestCropContainAspectKeepsFullLogoAtZoom1(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 120, 40)) // 3:1 wordmark
	out, err := cropContainAspect(src, LogoCropPosition{Zoom: 1})
	if err != nil {
		t.Fatalf("cropContainAspect: %v", err)
	}
	if b := out.Bounds(); b.Dx() != 120 || b.Dy() != 40 {
		t.Fatalf("zoom=1 must keep the full 120x40 logo, got %dx%d", b.Dx(), b.Dy())
	}
}

func TestCropContainAspectZoomPreservesSourceAspect(t *testing.T) {
	src := image.NewNRGBA(image.Rect(0, 0, 120, 40)) // 3:1
	out, err := cropContainAspect(src, LogoCropPosition{Zoom: 2})
	if err != nil {
		t.Fatalf("cropContainAspect: %v", err)
	}
	// crop window = source / zoom = 60x20 — still 3:1, NOT squared.
	if b := out.Bounds(); b.Dx() != 60 || b.Dy() != 20 {
		t.Fatalf("zoom=2 window should be 60x20 (3:1 preserved), got %dx%d", b.Dx(), b.Dy())
	}
}

func TestFitWithinScalesDownPreservingAspect(t *testing.T) {
	w, h := fitWithin(1200, 400, 640) // 3:1
	if w != 640 || h != 213 {         // round(400 * 640/1200) = 213
		t.Fatalf("expected 640x213 (3:1 preserved), got %dx%d", w, h)
	}
}

func TestFitWithinNeverUpscales(t *testing.T) {
	if w, h := fitWithin(100, 50, 640); w != 100 || h != 50 {
		t.Fatalf("small logos must keep native size, got %dx%d", w, h)
	}
}

func TestRenderLogoCropWebPProducesWebP(t *testing.T) {
	if _, err := exec.LookPath("cwebp"); err != nil {
		t.Skip("cwebp not installed")
	}
	src := image.NewNRGBA(image.Rect(0, 0, 120, 40)) // wide logo
	for y := 0; y < 40; y++ {
		for x := 0; x < 120; x++ {
			src.Set(x, y, color.NRGBA{R: uint8(x), G: uint8(y * 6), B: 90, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, src, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	got, err := RenderLogoCropWebP(context.Background(), bytes.NewReader(buf.Bytes()), LogoCropPosition{Zoom: 1}, 96)
	if err != nil {
		t.Fatalf("RenderLogoCropWebP: %v", err)
	}
	if len(got) < 12 || string(got[:4]) != "RIFF" || string(got[8:12]) != "WEBP" {
		t.Fatalf("expected WEBP bytes, got %q", got[:min(len(got), 12)])
	}
}
