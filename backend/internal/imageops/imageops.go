// Package imageops provides the small set of image transforms RawDrive needs
// (decode + EXIF auto-orient, resize, fit, fill, rotate, clone, encode), built
// on the maintained golang.org/x/image/draw + standard library.
//
// It replaces github.com/disintegration/imaging (archived/unmaintained;
// CVE-2023-36308 DoS in its decoder). The public surface mirrors the imaging
// functions the services used so the migration is mechanical.
//
// Resampling kernel mapping vs imaging:
//   - imaging.Lanczos → draw.CatmullRom  (high-quality bicubic-family; the best
//     maintained kernel x/image offers — visually very close to Lanczos for
//     down-scaling, which is all RawDrive does)
//   - imaging.Box     → draw.ApproxBiLinear (fast, used only for the 4×4 / 20px
//     "tiny" placeholders where kernel choice is immaterial)
package imageops

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"math"

	// Register decoders so Decode handles the formats RawDrive ingests.
	_ "image/gif"

	_ "golang.org/x/image/webp"

	"github.com/rwcarlsen/goexif/exif"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/math/f64"
)

// Decode reads an image. When autoOrient is true the EXIF Orientation tag is
// applied so portrait photos shot on phones render upright (matches
// imaging.Decode(r, imaging.AutoOrientation(true))).
func Decode(r io.Reader, autoOrient bool) (image.Image, error) {
	if !autoOrient {
		img, _, err := image.Decode(r)
		return img, err
	}
	// EXIF and pixels live in the same stream; buffer so we can read both.
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	return applyOrientation(img, exifOrientation(bytes.NewReader(data))), nil
}

func exifOrientation(r io.Reader) int {
	x, err := exif.Decode(r)
	if err != nil {
		return 1
	}
	tag, err := x.Get(exif.Orientation)
	if err != nil {
		return 1
	}
	o, err := tag.Int(0)
	if err != nil || o < 1 || o > 8 {
		return 1
	}
	return o
}

// applyOrientation maps the 8 EXIF orientation values to pixel transforms.
func applyOrientation(img image.Image, o int) image.Image {
	switch o {
	case 1:
		return img
	case 2:
		return flipH(img)
	case 3:
		return rotate180(img)
	case 4:
		return flipV(img)
	case 5:
		return flipH(rotate90(img))
	case 6:
		return rotate90(img)
	case 7:
		return flipH(rotate270(img))
	case 8:
		return rotate270(img)
	default:
		return img
	}
}

// New returns a w×h image filled with c (mirrors imaging.New).
func New(w, h int, c color.Color) *image.NRGBA {
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	xdraw.Draw(dst, dst.Bounds(), image.NewUniform(c), image.Point{}, xdraw.Src)
	return dst
}

// Clone copies any image into a fresh *image.NRGBA (mirrors imaging.Clone).
func Clone(img image.Image) *image.NRGBA {
	b := img.Bounds()
	dst := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	xdraw.Draw(dst, dst.Bounds(), img, b.Min, xdraw.Src)
	return dst
}

// Resize scales img to w×h. If w or h is 0 it is derived from the other to
// preserve aspect ratio (mirrors imaging.Resize). highQuality selects the
// CatmullRom kernel; false uses the fast ApproxBiLinear (imaging.Box analogue).
func Resize(img image.Image, w, h int, highQuality bool) image.Image {
	b := img.Bounds()
	sw, sh := b.Dx(), b.Dy()
	if sw == 0 || sh == 0 {
		return img
	}
	if w == 0 && h == 0 {
		return img
	}
	if w == 0 {
		w = int(math.Round(float64(h) * float64(sw) / float64(sh)))
	}
	if h == 0 {
		h = int(math.Round(float64(w) * float64(sh) / float64(sw)))
	}
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	kernel(highQuality).Scale(dst, dst.Bounds(), img, b, xdraw.Over, nil)
	return dst
}

// Fit scales img DOWN to fit within maxW×maxH, preserving aspect ratio. Images
// already within bounds are returned unchanged — no upscaling (mirrors
// imaging.Fit with the Lanczos filter).
func Fit(img image.Image, maxW, maxH int) image.Image {
	b := img.Bounds()
	sw, sh := b.Dx(), b.Dy()
	if sw == 0 || sh == 0 || maxW <= 0 || maxH <= 0 {
		return img
	}
	if sw <= maxW && sh <= maxH {
		return img
	}
	scale := math.Min(float64(maxW)/float64(sw), float64(maxH)/float64(sh))
	w := int(math.Round(float64(sw) * scale))
	h := int(math.Round(float64(sh) * scale))
	return Resize(img, w, h, true)
}

// Fill scales img to COVER w×h then center-crops to exactly w×h (mirrors
// imaging.Fill with imaging.Center + the Lanczos filter).
func Fill(img image.Image, w, h int) image.Image {
	b := img.Bounds()
	sw, sh := b.Dx(), b.Dy()
	if sw == 0 || sh == 0 || w <= 0 || h <= 0 {
		return img
	}
	scale := math.Max(float64(w)/float64(sw), float64(h)/float64(sh))
	rw := int(math.Round(float64(sw) * scale))
	rh := int(math.Round(float64(sh) * scale))
	resized := Resize(img, rw, rh, true)
	// Center crop.
	rb := resized.Bounds()
	x0 := rb.Min.X + (rb.Dx()-w)/2
	y0 := rb.Min.Y + (rb.Dy()-h)/2
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	xdraw.Draw(dst, dst.Bounds(), resized, image.Point{X: x0, Y: y0}, xdraw.Src)
	return dst
}

// Rotate rotates img counter-clockwise by angleDeg, expanding the canvas to fit
// the whole rotated image and filling the new corners with bg (mirrors
// imaging.Rotate).
func Rotate(img image.Image, angleDeg float64, bg color.Color) image.Image {
	a := angleDeg * math.Pi / 180
	b := img.Bounds()
	sw, sh := float64(b.Dx()), float64(b.Dy())
	cos, sin := math.Cos(a), math.Sin(a)
	nw := int(math.Round(math.Abs(sw*cos) + math.Abs(sh*sin)))
	nh := int(math.Round(math.Abs(sw*sin) + math.Abs(sh*cos)))
	if nw < 1 {
		nw = 1
	}
	if nh < 1 {
		nh = 1
	}
	dst := image.NewNRGBA(image.Rect(0, 0, nw, nh))
	xdraw.Draw(dst, dst.Bounds(), image.NewUniform(bg), image.Point{}, xdraw.Src)

	scx, scy := sw/2, sh/2
	dcx, dcy := float64(nw)/2, float64(nh)/2
	// CCW rotation about the source centre, re-centred in the expanded canvas.
	// s2d maps source → destination coordinates.
	m := f64.Aff3{
		cos, sin, dcx - cos*scx - sin*scy,
		-sin, cos, dcy + sin*scx - cos*scy,
	}
	xdraw.CatmullRom.Transform(dst, m, img, b, xdraw.Over, nil)
	return dst
}

// EncodeJPEG writes img as JPEG at the given quality (1-100).
func EncodeJPEG(w io.Writer, img image.Image, quality int) error {
	if quality <= 0 || quality > 100 {
		quality = 85
	}
	return jpeg.Encode(w, img, &jpeg.Options{Quality: quality})
}

// EncodePNG writes img as PNG.
func EncodePNG(w io.Writer, img image.Image) error {
	return png.Encode(w, img)
}

func kernel(highQuality bool) xdraw.Interpolator {
	if highQuality {
		return xdraw.CatmullRom
	}
	return xdraw.ApproxBiLinear
}

// ── pixel-level orientation helpers ────────────────────────────────────────

func rotate90(src image.Image) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, h, w))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(h-1-y, x, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate270(src image.Image) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, h, w))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(y, w-1-x, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate180(src image.Image) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(w-1-x, h-1-y, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func flipH(src image.Image) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(w-1-x, y, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func flipV(src image.Image) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(x, h-1-y, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}
