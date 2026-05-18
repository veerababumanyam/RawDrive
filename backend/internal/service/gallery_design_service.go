package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// GalleryDesignConfig holds the full design configuration for a gallery.
type GalleryDesignConfig struct {
	Theme       ThemeConfig       `json:"theme"`
	Cover       CoverConfig       `json:"cover"`
	Typography  TypographyConfig  `json:"typography"`
	Grid        GridConfig        `json:"grid"`
	Template    *TemplateRef      `json:"template,omitempty"`
	CustomCSS   string            `json:"custom_css,omitempty"`
	Version     int               `json:"version"`
}

// ThemeConfig holds theme selection.
//
// JSON tags are camelCase to match the payload the frontend reducer
// dispatches (see frontend/src/app/(dashboard)/galleries/[id]/design/page.tsx —
// `DesignConfig.theme.accentColor`). Before 2026-05-17 the tags were
// snake_case and the entire PUT payload silently round-tripped to an empty
// struct, which is why saved designs never showed up on the public viewer.
type ThemeConfig struct {
	ID          string `json:"id"`          // theme identifier
	Variant     string `json:"variant"`     // "light", "dark", "auto"
	AccentColor string `json:"accentColor"` // hex or token reference
}

// CoverConfig holds cover photo settings.
//
// Title/Subtitle were added 2026-05-17 to round-trip the heading text the
// design studio lets photographers author. Without these fields the typed
// decode of the PUT payload dropped the strings, so the public viewer would
// render the gallery title fallback even when the studio showed a custom
// heading. Tagged with camelCase JSON keys to match what the frontend
// reducer dispatches (see frontend/src/app/(dashboard)/galleries/[id]/cover/page.tsx).
//
// 2026-05-18: Added free-text overlay fields (TitlePosition, SubtitlePosition,
// TextAlign, TextColor, TextShadow, AspectRatio) for the merged Cover &
// Design page. Without these, the Go JSON decoder silently dropped them on
// PUT, so dragged title/subtitle positions appeared to "reset" every time
// the user navigated back to the page — payload was sent, then stripped on
// server-side decode, then re-hydration found nothing to apply. Pointer
// types (*FocalPoint, *string, *bool) so missing fields stay omitted in
// JSON instead of being persisted as zero values that would override
// frontend defaults on legacy galleries.
type CoverConfig struct {
	AssetID          *uuid.UUID  `json:"assetId,omitempty"`
	StyleID          string      `json:"styleId"` // cover layout style (1 of 30)
	FocalPoint       FocalPoint  `json:"focalPoint"`
	Title            string      `json:"title,omitempty"`
	Subtitle         string      `json:"subtitle,omitempty"`
	TitlePosition    *FocalPoint `json:"titlePosition,omitempty"`    // drag-positioned title (0..100 percent)
	SubtitlePosition *FocalPoint `json:"subtitlePosition,omitempty"` // drag-positioned subtitle
	TextAlign        *string     `json:"textAlign,omitempty"`        // "left" | "center" | "right" for overlay text
	TextColor        *string     `json:"textColor,omitempty"`        // hex for legacy shared overlay text color
	TitleColor       *string     `json:"titleColor,omitempty"`       // hex for title overlay (split from textColor 2026-05-18)
	SubtitleColor    *string     `json:"subtitleColor,omitempty"`    // hex for subtitle overlay (split from textColor 2026-05-18)
	TextShadow       *bool       `json:"textShadow,omitempty"`       // toggles a readability shadow
	AspectRatio      *string     `json:"aspectRatio,omitempty"`      // overrides styleId's aspectRatio (e.g. "16/9")
}

// FocalPoint represents the cover crop focal point (0-100 range).
type FocalPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// TypographyConfig holds font pairing.
//
// TitleSize/SubtitleSize were added 2026-05-17 when the studio replaced the
// discrete font-size enum with sliders (16–96px title, 10–40px subtitle).
// Stored as concrete pixels so the public viewer can apply them via inline
// style without translating an enum.
type TypographyConfig struct {
	PairingID    string `json:"pairingId"`
	HeadingFont  string `json:"headingFont"`
	BodyFont     string `json:"bodyFont"`
	TitleSize    int    `json:"titleSize,omitempty"`
	SubtitleSize int    `json:"subtitleSize,omitempty"`
}

// GridConfig holds gallery grid layout settings.
type GridConfig struct {
	Layout   string `json:"layout"`   // "masonry", "grid", "justified", "carousel"
	Columns  int    `json:"columns"`  // 1-6
	Gap      int    `json:"gap"`      // px
	ShowInfo bool   `json:"showInfo"` // show photo metadata below thumbnails
}

// TemplateRef references a saved design template.
type TemplateRef struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

// DefaultDesignConfig returns a sensible default design configuration.
func DefaultDesignConfig() GalleryDesignConfig {
	return GalleryDesignConfig{
		Theme:      ThemeConfig{ID: "liquid-glass", Variant: "light", AccentColor: ""},
		Cover:      CoverConfig{StyleID: "classic-full", FocalPoint: FocalPoint{X: 50, Y: 50}},
		Typography: TypographyConfig{PairingID: "elegant", HeadingFont: "Playfair Display", BodyFont: "Inter"},
		Grid:       GridConfig{Layout: "masonry", Columns: 3, Gap: 8, ShowInfo: false},
		Version:    1,
	}
}

// GalleryDesignService manages gallery design configurations.
type GalleryDesignService struct {
	galleryRepo *repository.GalleryRepo
}

// NewGalleryDesignService creates a new GalleryDesignService.
func NewGalleryDesignService(gr *repository.GalleryRepo) *GalleryDesignService {
	return &GalleryDesignService{galleryRepo: gr}
}

// GetDesignConfig retrieves the design configuration for a gallery.
func (s *GalleryDesignService) GetDesignConfig(ctx context.Context, galleryID uuid.UUID) (*GalleryDesignConfig, error) {
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil || gallery == nil {
		return nil, fmt.Errorf("design: gallery not found")
	}

	// Parse design_config from gallery settings
	designRaw, ok := gallery.Settings["design_config"]
	if !ok {
		def := DefaultDesignConfig()
		return &def, nil
	}

	data, err := json.Marshal(designRaw)
	if err != nil {
		def := DefaultDesignConfig()
		return &def, nil
	}

	var config GalleryDesignConfig
	if err := json.Unmarshal(data, &config); err != nil {
		def := DefaultDesignConfig()
		return &def, nil
	}
	return &config, nil
}

// UpdateDesignConfig persists a design configuration for a gallery.
func (s *GalleryDesignService) UpdateDesignConfig(ctx context.Context, galleryID uuid.UUID, config GalleryDesignConfig) error {
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil || gallery == nil {
		return fmt.Errorf("design: gallery not found")
	}

	config.Version++

	if gallery.Settings == nil {
		gallery.Settings = map[string]interface{}{}
	}
	gallery.Settings["design_config"] = config

	return s.galleryRepo.Update(ctx, gallery)
}
