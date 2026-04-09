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
type ThemeConfig struct {
	ID          string `json:"id"`          // theme identifier
	Variant     string `json:"variant"`     // "light", "dark", "auto"
	AccentColor string `json:"accent_color"` // hex or token reference
}

// CoverConfig holds cover photo settings.
type CoverConfig struct {
	AssetID    *uuid.UUID  `json:"asset_id,omitempty"`
	StyleID    string      `json:"style_id"`    // cover layout style (1 of 30)
	FocalPoint FocalPoint  `json:"focal_point"`
}

// FocalPoint represents the cover crop focal point (0-100 range).
type FocalPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// TypographyConfig holds font pairing.
type TypographyConfig struct {
	PairingID   string `json:"pairing_id"`
	HeadingFont string `json:"heading_font"`
	BodyFont    string `json:"body_font"`
}

// GridConfig holds gallery grid layout settings.
type GridConfig struct {
	Layout   string `json:"layout"`   // "masonry", "grid", "justified", "carousel"
	Columns  int    `json:"columns"`  // 1-6
	Gap      int    `json:"gap"`      // px
	ShowInfo bool   `json:"show_info"` // show photo metadata below thumbnails
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
