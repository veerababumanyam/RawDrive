package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewGalleryDesignService(t *testing.T) {
	svc := NewGalleryDesignService(nil)
	assert.NotNil(t, svc)
}

func TestDefaultDesignConfig(t *testing.T) {
	cfg := DefaultDesignConfig()
	assert.Equal(t, "liquid-glass", cfg.Theme.ID)
	assert.Equal(t, "light", cfg.Theme.Variant)
	assert.Equal(t, "classic-full", cfg.Cover.StyleID)
	assert.Equal(t, 50.0, cfg.Cover.FocalPoint.X)
	assert.Equal(t, 50.0, cfg.Cover.FocalPoint.Y)
	assert.Equal(t, "elegant", cfg.Typography.PairingID)
	assert.Equal(t, "Playfair Display", cfg.Typography.HeadingFont)
	assert.Equal(t, "Inter", cfg.Typography.BodyFont)
	assert.Equal(t, "masonry", cfg.Grid.Layout)
	assert.Equal(t, 3, cfg.Grid.Columns)
	assert.Equal(t, 8, cfg.Grid.Gap)
	assert.False(t, cfg.Grid.ShowInfo)
	assert.Equal(t, 1, cfg.Version)
}

func TestGalleryDesignConfig_ThemeVariants(t *testing.T) {
	variants := []string{"light", "dark", "auto"}
	for _, v := range variants {
		cfg := ThemeConfig{ID: "liquid-glass", Variant: v}
		assert.NotEmpty(t, cfg.Variant)
	}
}

func TestGalleryDesignConfig_GridLayouts(t *testing.T) {
	layouts := []string{"masonry", "grid", "justified", "carousel"}
	for _, l := range layouts {
		cfg := GridConfig{Layout: l, Columns: 3, Gap: 8}
		assert.NotEmpty(t, cfg.Layout)
	}
}

func TestFocalPoint_Range(t *testing.T) {
	fp := FocalPoint{X: 0, Y: 100}
	assert.True(t, fp.X >= 0 && fp.X <= 100)
	assert.True(t, fp.Y >= 0 && fp.Y <= 100)
}
