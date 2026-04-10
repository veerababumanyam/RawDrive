package service

import (
	"bytes"
	"image"
	"image/jpeg"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDefaultCoverVariantSpecs_ProducesThreeCanonicalSizes(t *testing.T) {
	specs := DefaultCoverVariantSpecs()
	assert.Len(t, specs, 3)

	names := map[string]int{}
	for _, s := range specs {
		names[s.Name] = s.MaxWidth
	}
	assert.Equal(t, 1920, names["hero"])
	assert.Equal(t, 1280, names["card"])
	assert.Equal(t, 640, names["thumb"])
}

func TestGenerateCoverVariants_ProducesThreeResizedJPEGs(t *testing.T) {
	// 3000x2000 source — large enough that all three variants must resize down.
	source := makeJPEG(t, 3000, 2000)

	variants, err := GenerateCoverVariants("image/jpeg", bytes.NewReader(source), nil)
	assert.NoError(t, err)
	assert.Len(t, variants, 3)

	// hero: 1920 wide, aspect preserved => 1280 tall
	assert.Equal(t, "hero", variants[0].Name)
	assert.Equal(t, 1920, variants[0].Width)
	assert.Equal(t, 1280, variants[0].Height)

	// card: 1280 wide, aspect preserved => ~853 tall
	assert.Equal(t, "card", variants[1].Name)
	assert.Equal(t, 1280, variants[1].Width)

	// thumb: 640 wide
	assert.Equal(t, "thumb", variants[2].Name)
	assert.Equal(t, 640, variants[2].Width)

	// Every variant must be smaller than the original (compression actually happened).
	for _, v := range variants {
		assert.True(t, len(v.Bytes) > 0, "variant %s must have bytes", v.Name)
		assert.Less(t, len(v.Bytes), len(source), "variant %s should be smaller than source", v.Name)

		// Decode to confirm JPEG validity.
		decoded, err := jpeg.Decode(bytes.NewReader(v.Bytes))
		assert.NoError(t, err, "variant %s must decode as valid JPEG", v.Name)
		assert.Equal(t, v.Width, decoded.Bounds().Dx())
	}
}

func TestGenerateCoverVariants_DoesNotUpscaleSmallerSources(t *testing.T) {
	// 1000x750 source — smaller than hero/card target widths.
	source := makeJPEG(t, 1000, 750)

	variants, err := GenerateCoverVariants("image/jpeg", bytes.NewReader(source), nil)
	assert.NoError(t, err)

	// hero should stay at 1000 (no upscale).
	hero := variants[0]
	assert.Equal(t, "hero", hero.Name)
	assert.Equal(t, 1000, hero.Width, "hero must not upscale a smaller source")
	assert.Equal(t, 750, hero.Height)

	// thumb should still downscale to 640.
	thumb := variants[2]
	assert.Equal(t, 640, thumb.Width)
}

func TestGenerateCoverVariants_PreservesAspectRatio(t *testing.T) {
	// 2100x700 panoramic (3:1 aspect).
	source := makeJPEG(t, 2100, 700)

	variants, err := GenerateCoverVariants("image/jpeg", bytes.NewReader(source), nil)
	assert.NoError(t, err)

	for _, v := range variants {
		ratio := float64(v.Width) / float64(v.Height)
		assert.InDelta(t, 3.0, ratio, 0.05, "variant %s aspect ratio should be ~3:1", v.Name)
	}
}

func TestGenerateCoverVariants_RejectsUnsupportedContentType(t *testing.T) {
	_, err := GenerateCoverVariants("image/gif", bytes.NewReader([]byte{0}), nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported")
}

func TestGenerateCoverVariants_RejectsCorruptImage(t *testing.T) {
	_, err := GenerateCoverVariants("image/jpeg", bytes.NewReader([]byte("not an image")), nil)
	assert.Error(t, err)
}

func TestGenerateCoverVariants_CustomSpecsAreHonored(t *testing.T) {
	source := makeJPEG(t, 4000, 3000)
	custom := []CoverVariantSpec{
		{Name: "print", MaxWidth: 3840, JPEGQuality: 92},
		{Name: "og", MaxWidth: 1200, JPEGQuality: 85},
	}

	variants, err := GenerateCoverVariants("image/jpeg", bytes.NewReader(source), custom)
	assert.NoError(t, err)
	assert.Len(t, variants, 2)
	assert.Equal(t, "print", variants[0].Name)
	assert.Equal(t, 3840, variants[0].Width)
	assert.Equal(t, "og", variants[1].Name)
	assert.Equal(t, 1200, variants[1].Width)
}

// Sanity check that the imaging library we lean on actually produces a
// different image than the source (defensive against accidental no-op copy).
func TestGenerateCoverVariants_ResizedOutputDiffersFromSource(t *testing.T) {
	source := makeJPEG(t, 3000, 2000)
	variants, err := GenerateCoverVariants("image/jpeg", bytes.NewReader(source), nil)
	assert.NoError(t, err)

	srcImg, _, _ := image.Decode(bytes.NewReader(source))
	assert.Equal(t, 3000, srcImg.Bounds().Dx())

	for _, v := range variants {
		assert.NotEqual(t, srcImg.Bounds().Dx(), v.Width, "variant %s must actually resize", v.Name)
	}
}
