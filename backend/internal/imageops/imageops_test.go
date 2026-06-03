package imageops

import (
	"bytes"
	"image"
	"image/color"
	"testing"
)

func solid(w, h int, c color.Color) image.Image { return New(w, h, c) }

func TestResize_PreservesAspectWhenOneDimZero(t *testing.T) {
	out := Resize(solid(100, 50, color.White), 50, 0, true)
	if got := out.Bounds().Dx(); got != 50 {
		t.Fatalf("width = %d, want 50", got)
	}
	if got := out.Bounds().Dy(); got != 25 {
		t.Fatalf("height = %d, want 25 (aspect-preserved)", got)
	}
}

func TestFit_DoesNotUpscale(t *testing.T) {
	src := solid(100, 80, color.White)
	out := Fit(src, 400, 400)
	if out.Bounds().Dx() != 100 || out.Bounds().Dy() != 80 {
		t.Fatalf("Fit upscaled to %v, want unchanged 100x80", out.Bounds())
	}
}

func TestFit_DownscalesWithinBounds(t *testing.T) {
	out := Fit(solid(200, 100, color.White), 50, 50)
	if out.Bounds().Dx() > 50 || out.Bounds().Dy() > 50 {
		t.Fatalf("Fit result %v exceeds 50x50", out.Bounds())
	}
	// 200x100 → fit 50x50 → 50x25 (width-bound).
	if out.Bounds().Dx() != 50 || out.Bounds().Dy() != 25 {
		t.Fatalf("Fit = %v, want 50x25", out.Bounds())
	}
}

func TestFill_ExactDimensions(t *testing.T) {
	out := Fill(solid(200, 100, color.White), 64, 64)
	if out.Bounds().Dx() != 64 || out.Bounds().Dy() != 64 {
		t.Fatalf("Fill = %v, want exactly 64x64", out.Bounds())
	}
}

func TestRotate_ExpandsCanvas(t *testing.T) {
	out := Rotate(solid(100, 100, color.White), 45, color.NRGBA{})
	// A 100x100 square rotated 45° needs ~141x141 to contain it.
	if out.Bounds().Dx() < 138 || out.Bounds().Dy() < 138 {
		t.Fatalf("Rotate 45° canvas = %v, expected ~141x141", out.Bounds())
	}
}

func TestNewAndClone(t *testing.T) {
	red := color.NRGBA{R: 220, G: 20, B: 20, A: 255}
	src := New(10, 10, red)
	if got := src.NRGBAAt(5, 5); got != red {
		t.Fatalf("New pixel = %v, want %v", got, red)
	}
	cl := Clone(src)
	if got := cl.NRGBAAt(5, 5); got != red {
		t.Fatalf("Clone pixel = %v, want %v", got, red)
	}
}

func TestEncodeDecodeRoundtrip(t *testing.T) {
	var buf bytes.Buffer
	if err := EncodeJPEG(&buf, solid(32, 32, color.White), 90); err != nil {
		t.Fatalf("EncodeJPEG: %v", err)
	}
	img, err := Decode(&buf, false)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if img.Bounds().Dx() != 32 || img.Bounds().Dy() != 32 {
		t.Fatalf("roundtrip dims = %v, want 32x32", img.Bounds())
	}

	var pbuf bytes.Buffer
	if err := EncodePNG(&pbuf, solid(8, 8, color.Black)); err != nil {
		t.Fatalf("EncodePNG: %v", err)
	}
	if _, err := Decode(&pbuf, true); err != nil {
		t.Fatalf("Decode PNG (autoOrient, no EXIF): %v", err)
	}
}
