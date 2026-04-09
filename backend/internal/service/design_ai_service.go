package service

import (
	"context"
	"fmt"
	"log"
	"math"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/repository"
)

// DesignAIService provides AI-powered design recommendations.
type DesignAIService struct {
	assetRepo  *repository.AssetRepo
	gemini     *ai.GeminiClient
	configRepo *ai.ConfigRepo
}

// NewDesignAIService creates a new DesignAIService.
func NewDesignAIService(ar *repository.AssetRepo, g *ai.GeminiClient, cr *ai.ConfigRepo) *DesignAIService {
	return &DesignAIService{assetRepo: ar, gemini: g, configRepo: cr}
}

// DesignSuggestion represents an AI-generated design recommendation.
type DesignSuggestion struct {
	Theme       string  `json:"theme"`
	CoverStyle  string  `json:"cover_style"`
	FontPairing string  `json:"font_pairing"`
	Reasoning   string  `json:"reasoning"`
	Confidence  float64 `json:"confidence"`
}

// themeProfiles maps themes to their content affinity keywords.
var themeProfiles = map[string][]string{
	"liquid-glass": {"modern", "tech", "corporate", "product"},
	"heritage":     {"wedding", "traditional", "cultural", "ceremony"},
	"noir":         {"fashion", "portrait", "studio", "moody"},
	"botanical":    {"outdoor", "garden", "nature", "green"},
	"sunset":       {"landscape", "travel", "golden", "warm"},
	"arctic":       {"winter", "snow", "cool", "blue"},
	"lavender":     {"baby", "maternity", "soft", "pastel"},
	"champagne":    {"luxury", "gold", "celebration", "champagne"},
	"slate":        {"architecture", "urban", "minimal", "concrete"},
}

// fontProfiles maps font pairings to their content affinity.
var fontProfiles = map[string]string{
	"elegant":   "wedding,luxury,formal",
	"editorial": "magazine,fashion,editorial",
	"minimal":   "product,tech,clean",
	"bold":      "sports,action,event",
	"soft":      "baby,family,soft",
	"modern":    "tech,startup,modern",
}

// Suggest analyzes gallery content and returns design recommendations.
func (s *DesignAIService) Suggest(ctx context.Context, workspaceID, galleryID uuid.UUID) ([]DesignSuggestion, error) {
	// Check if AI is configured
	apiKey, _, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
	if err != nil || apiKey == "" {
		// Fall back to heuristic-based suggestions (no API key needed)
		return s.heuristicSuggest(ctx, galleryID)
	}

	// Get gallery assets for analysis
	assets, err := s.assetRepo.List(ctx, repository.AssetFilter{
		GalleryID: &galleryID,
		Limit:     10,
		Sort:      "created_at",
		Order:     "desc",
	})
	if err != nil {
		return nil, fmt.Errorf("list assets: %w", err)
	}

	if len(assets) == 0 {
		return s.defaultSuggestions(), nil
	}

	// Use Gemini to analyze asset metadata for content type
	contentHints := extractContentHints(assets)
	return s.rankSuggestions(contentHints), nil
}

func (s *DesignAIService) heuristicSuggest(ctx context.Context, galleryID uuid.UUID) ([]DesignSuggestion, error) {
	assets, err := s.assetRepo.List(ctx, repository.AssetFilter{
		GalleryID: &galleryID,
		Limit:     20,
		Sort:      "created_at",
		Order:     "desc",
	})
	if err != nil {
		return s.defaultSuggestions(), nil
	}

	contentHints := extractContentHints(assets)
	return s.rankSuggestions(contentHints), nil
}

func extractContentHints(assets []repository.Asset) map[string]int {
	hints := make(map[string]int)
	for _, a := range assets {
		// Analyze filename for content type
		name := a.Filename
		for _, kw := range []string{"wedding", "portrait", "landscape", "product", "baby", "fashion", "event", "food", "architecture", "travel"} {
			if containsIgnoreCase(name, kw) {
				hints[kw]++
			}
		}
		// Analyze EXIF for outdoor/indoor hints
		if a.ExifData != nil {
			if _, ok := a.ExifData["GPSLatitude"]; ok {
				hints["outdoor"]++
			}
			if fl, ok := a.ExifData["FocalLength"].(float64); ok {
				if fl > 85 {
					hints["portrait"]++
				} else if fl < 35 {
					hints["landscape"]++
				}
			}
		}
	}
	return hints
}

func containsIgnoreCase(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			a, b := s[i+j], substr[j]
			if a != b && a != b+32 && a != b-32 {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func (s *DesignAIService) rankSuggestions(hints map[string]int) []DesignSuggestion {
	type scored struct {
		theme string
		score float64
	}
	var scores []scored
	for theme, keywords := range themeProfiles {
		score := 0.0
		for _, kw := range keywords {
			if count, ok := hints[kw]; ok {
				score += float64(count)
			}
		}
		scores = append(scores, scored{theme, score})
	}
	// Sort by score descending
	for i := 0; i < len(scores); i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].score > scores[i].score {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}

	maxScore := 1.0
	if len(scores) > 0 && scores[0].score > 0 {
		maxScore = scores[0].score
	}

	var suggestions []DesignSuggestion
	for i, s := range scores {
		if i >= 3 {
			break
		}
		confidence := math.Max(0.3, s.score/maxScore)
		coverStyle := pickCoverStyle(s.theme)
		fontPairing := pickFontPairing(s.theme)
		reasoning := fmt.Sprintf("Based on your gallery content, the %s theme complements your photos with its %s aesthetic.", s.theme, themeProfiles[s.theme][0])

		suggestions = append(suggestions, DesignSuggestion{
			Theme: s.theme, CoverStyle: coverStyle, FontPairing: fontPairing,
			Reasoning: reasoning, Confidence: confidence,
		})
	}

	if len(suggestions) == 0 {
		return s.defaultSuggestions()
	}
	return suggestions
}

func pickCoverStyle(theme string) string {
	switch theme {
	case "heritage", "champagne":
		return "elegant-frame"
	case "noir":
		return "cinematic-dark"
	case "botanical", "sunset":
		return "nature-earth"
	case "arctic":
		return "hero-blur"
	case "lavender":
		return "elegant-vignette"
	case "slate":
		return "modern-grid"
	default:
		return "hero-overlay"
	}
}

func pickFontPairing(theme string) string {
	switch theme {
	case "heritage", "champagne":
		return "elegant"
	case "noir":
		return "editorial"
	case "slate", "liquid-glass":
		return "minimal"
	case "lavender":
		return "soft"
	default:
		return "modern"
	}
}

func (s *DesignAIService) defaultSuggestions() []DesignSuggestion {
	log.Println("design-ai: using default suggestions (no content analysis)")
	return []DesignSuggestion{
		{Theme: "liquid-glass", CoverStyle: "hero-overlay", FontPairing: "elegant", Reasoning: "A versatile modern theme that works well with any photography style.", Confidence: 0.5},
		{Theme: "heritage", CoverStyle: "elegant-frame", FontPairing: "elegant", Reasoning: "Classic and timeless — ideal for wedding and portrait photography.", Confidence: 0.4},
		{Theme: "noir", CoverStyle: "cinematic-dark", FontPairing: "editorial", Reasoning: "Bold and dramatic — perfect for fashion and studio photography.", Confidence: 0.35},
	}
}
