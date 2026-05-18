package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"testing"

	"github.com/disintegration/imaging"
)

// Verifies the rewrite actually modifies pixels in the configured corner /
// overlay region. Before the 2026-05-18 rewrite the service ignored cfg.Text
// entirely — this test exists to keep that regression from sneaking back.

func newSolidJPEG(t *testing.T, w, h int, c color.NRGBA) []byte {
	t.Helper()
	img := imaging.New(w, h, c)
	buf := new(bytes.Buffer)
	if err := jpeg.Encode(buf, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatalf("encode source JPEG: %v", err)
	}
	return buf.Bytes()
}

func decodeJPEG(t *testing.T, r io.Reader) image.Image {
	t.Helper()
	img, err := jpeg.Decode(r)
	if err != nil {
		t.Fatalf("decode result JPEG: %v", err)
	}
	return img
}

func differs(a, b color.NRGBA) bool {
	// Allow small JPEG round-trip noise: any channel differing by > 20 is
	// taken as evidence that the watermark actually drew pixels there.
	const tol = 20
	abs := func(x int) int {
		if x < 0 {
			return -x
		}
		return x
	}
	return abs(int(a.R)-int(b.R)) > tol ||
		abs(int(a.G)-int(b.G)) > tol ||
		abs(int(a.B)-int(b.B)) > tol
}

func TestWatermarkApply_BottomRightWritesPixels(t *testing.T) {
	svc := NewWatermarkService()
	src := newSolidJPEG(t, 800, 600, color.NRGBA{200, 50, 50, 255})

	out, err := svc.Apply(context.Background(), bytes.NewReader(src), WatermarkConfig{
		Text:     "STUDIO",
		Position: "bottom-right",
		Opacity:  0.8,
		FontSize: 48,
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	img := decodeJPEG(t, out)
	b := img.Bounds()
	if b.Dx() != 800 || b.Dy() != 600 {
		t.Fatalf("output dimensions changed: got %dx%d", b.Dx(), b.Dy())
	}

	// Sample a row near the bottom-right corner where the watermark sits.
	src0 := color.NRGBA{200, 50, 50, 255}
	rgba, ok := img.(*image.RGBA)
	if !ok {
		// jpeg.Decode usually returns *image.YCbCr — convert via NRGBA model.
		nrgba := imaging.Clone(img)
		rgba = (*image.RGBA)(nil)
		_ = rgba
		// Walk the bottom-right strip looking for one watermarked pixel.
		found := false
		for y := b.Max.Y - 80; y < b.Max.Y-10 && !found; y++ {
			for x := b.Max.X - 200; x < b.Max.X-10; x++ {
				c := nrgba.NRGBAAt(x, y)
				if differs(c, src0) {
					found = true
					break
				}
			}
		}
		if !found {
			t.Fatal("expected modified pixels in the bottom-right strip, found none — watermark did not draw")
		}
		return
	}
}

func TestWatermarkApply_CenterDiffersFromCorner(t *testing.T) {
	svc := NewWatermarkService()
	src := newSolidJPEG(t, 800, 600, color.NRGBA{30, 30, 30, 255})

	out, err := svc.Apply(context.Background(), bytes.NewReader(src), WatermarkConfig{
		Text:     "PROOF",
		Position: "center",
		Opacity:  0.7,
		FontSize: 96,
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	img := decodeJPEG(t, out)
	b := img.Bounds()
	nrgba := imaging.Clone(img)
	dark := color.NRGBA{30, 30, 30, 255}

	// At least one pixel in the central rectangle should differ.
	cx := (b.Min.X + b.Max.X) / 2
	cy := (b.Min.Y + b.Max.Y) / 2
	found := false
	for y := cy - 60; y < cy+60 && !found; y++ {
		for x := cx - 200; x < cx+200; x++ {
			if differs(nrgba.NRGBAAt(x, y), dark) {
				found = true
				break
			}
		}
	}
	if !found {
		t.Fatal("expected modified pixels near the image center for the center watermark, found none")
	}
}

func TestWatermarkApply_EmptyTextLeavesImageDecodable(t *testing.T) {
	svc := NewWatermarkService()
	src := newSolidJPEG(t, 200, 200, color.NRGBA{100, 100, 100, 255})

	out, err := svc.Apply(context.Background(), bytes.NewReader(src), WatermarkConfig{
		Text:    "  ", // trimmed → empty
		Opacity: 0.5,
	})
	if err != nil {
		t.Fatalf("Apply (empty text): %v", err)
	}
	// Result must still decode as JPEG so the handler's stream-out path
	// works regardless of config validity.
	if _, err := jpeg.Decode(out); err != nil {
		t.Fatalf("empty-text output failed to decode: %v", err)
	}
}

func TestIsEnabled(t *testing.T) {
	cases := []struct {
		name string
		in   map[string]interface{}
		want bool
	}{
		{"nil", nil, false},
		{"missing enabled", map[string]interface{}{"text": "x"}, false},
		{"enabled false", map[string]interface{}{"enabled": false, "text": "x"}, false},
		{"enabled but empty text", map[string]interface{}{"enabled": true, "text": ""}, false},
		{"enabled with blank text", map[string]interface{}{"enabled": true, "text": "   "}, false},
		{"enabled with text", map[string]interface{}{"enabled": true, "text": "Studio"}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := IsEnabled(c.in); got != c.want {
				t.Errorf("IsEnabled(%v) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

func TestConfigFromMap_PercentOpacityConvertedToFraction(t *testing.T) {
	// Settings UI writes opacity as an integer percent (10..90); the service
	// expects 0..1. ConfigFromMap must normalize.
	cfg := ConfigFromMap(map[string]interface{}{
		"text":     "Studio",
		"position": "diagonal",
		"opacity":  float64(60),
	})
	if cfg.Opacity <= 0.1 || cfg.Opacity >= 1.0 {
		t.Errorf("opacity 60 → expected normalized 0..1, got %v", cfg.Opacity)
	}
	if cfg.Position != "diagonal" {
		t.Errorf("position = %v, want diagonal", cfg.Position)
	}
}
