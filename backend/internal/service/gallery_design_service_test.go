package service

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

// Locks the JSON contract between the design studio (camelCase reducer in
// frontend/src/app/(dashboard)/galleries/[id]/design/page.tsx) and the
// server-side typed struct. Prior to 2026-05-17 the tags were snake_case
// and the studio's PUT payload silently round-tripped to an empty struct
// — saved designs never showed up on the public viewer because of this.
// This test fails closed if anyone re-introduces snake_case keys without
// also migrating the frontend.
func TestGalleryDesignConfig_CamelCaseRoundTrip(t *testing.T) {
	payload := []byte(`{
		"theme": {"id": "liquid-glass", "variant": "dark", "accentColor": "#6366f1"},
		"cover": {
			"styleId": "hero-overlay",
			"focalPoint": {"x": 25, "y": 75},
			"title": "Anaya & Vihaan",
			"subtitle": "Goa, Feb 2026"
		},
		"typography": {
			"pairingId": "elegant",
			"headingFont": "Playfair Display",
			"bodyFont": "Inter",
			"titleSize": 64,
			"subtitleSize": 20
		},
		"grid": {"layout": "grid", "columns": 4, "gap": 12, "showInfo": true},
		"version": 7
	}`)

	var cfg GalleryDesignConfig
	require.NoError(t, json.Unmarshal(payload, &cfg))

	assert.Equal(t, "liquid-glass", cfg.Theme.ID)
	assert.Equal(t, "dark", cfg.Theme.Variant)
	assert.Equal(t, "#6366f1", cfg.Theme.AccentColor)
	assert.Equal(t, "hero-overlay", cfg.Cover.StyleID)
	assert.Equal(t, 25.0, cfg.Cover.FocalPoint.X)
	assert.Equal(t, 75.0, cfg.Cover.FocalPoint.Y)
	assert.Equal(t, "Anaya & Vihaan", cfg.Cover.Title)
	assert.Equal(t, "Goa, Feb 2026", cfg.Cover.Subtitle)
	assert.Equal(t, "elegant", cfg.Typography.PairingID)
	assert.Equal(t, "Playfair Display", cfg.Typography.HeadingFont)
	assert.Equal(t, "Inter", cfg.Typography.BodyFont)
	assert.Equal(t, 64, cfg.Typography.TitleSize)
	assert.Equal(t, 20, cfg.Typography.SubtitleSize)
	assert.Equal(t, "grid", cfg.Grid.Layout)
	assert.Equal(t, 4, cfg.Grid.Columns)
	assert.Equal(t, 12, cfg.Grid.Gap)
	assert.True(t, cfg.Grid.ShowInfo)
	assert.Equal(t, 7, cfg.Version)

	// Round-trip back through JSON — keys we emit must be camelCase too so
	// the GET response is shape-compatible with the studio reducer.
	out, err := json.Marshal(cfg)
	require.NoError(t, err)
	s := string(out)
	for _, key := range []string{
		`"accentColor"`,
		`"styleId"`,
		`"focalPoint"`,
		`"pairingId"`,
		`"headingFont"`,
		`"bodyFont"`,
		`"titleSize"`,
		`"subtitleSize"`,
		`"showInfo"`,
	} {
		assert.Contains(t, s, key, "missing expected camelCase key: %s", key)
	}
}
