package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strings"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/repository"
)

// DesignReasoner is the narrow interface the DesignAIService needs from a
// language model. Extracted so tests can swap in a fake without touching the
// Gemini HTTP layer.
type DesignReasoner interface {
	GenerateText(ctx context.Context, apiKey, prompt string) (string, int, int, error)
}

// Compile-time assertion that the real Gemini client satisfies the interface.
var _ DesignReasoner = (*ai.GeminiClient)(nil)

// DesignAIService provides AI-powered design recommendations.
type DesignAIService struct {
	assetRepo  *repository.AssetRepo
	gemini     DesignReasoner
	configRepo *ai.ConfigRepo
}

// NewDesignAIService creates a new DesignAIService.
func NewDesignAIService(ar *repository.AssetRepo, g DesignReasoner, cr *ai.ConfigRepo) *DesignAIService {
	return &DesignAIService{assetRepo: ar, gemini: g, configRepo: cr}
}

// DesignSuggestion represents an AI-generated design recommendation.
type DesignSuggestion struct {
	Theme       string  `json:"theme"`
	CoverStyle  string  `json:"coverStyle"`
	FontPairing string  `json:"fontPairing"`
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

// validThemeList is the set of theme IDs we will accept in a model response.
var validThemeList = []string{
	"liquid-glass", "heritage", "noir", "botanical", "sunset",
	"arctic", "lavender", "champagne", "slate",
}

// validFontPairings is the set of font pairing IDs we accept.
var validFontPairings = []string{"elegant", "editorial", "minimal", "bold", "soft", "modern"}

// validCoverStyleList mirrors the 30 cover styles exposed in the frontend.
var validCoverStyleList = []string{
	"classic-full", "classic-split", "classic-minimal",
	"hero-overlay", "hero-gradient", "hero-blur",
	"editorial-left", "editorial-right", "editorial-center",
	"magazine-cover", "magazine-spread", "magazine-minimal",
	"cinematic-wide", "cinematic-dark", "cinematic-grain",
	"elegant-border", "elegant-frame", "elegant-vignette",
	"modern-grid", "modern-asymmetric", "modern-overlap",
	"vintage-polaroid", "vintage-film", "vintage-sepia",
	"bold-typography", "bold-color-block", "bold-geometric",
	"nature-earth", "nature-botanical", "nature-panoramic",
}

// Suggest analyzes gallery content and returns design recommendations. When
// an API key is configured for the workspace, the actual Gemini model is
// called (GAL-FR-078). When the key is absent or the Gemini call fails, the
// deterministic heuristic ranker is used so the endpoint never hard-fails.
func (s *DesignAIService) Suggest(ctx context.Context, workspaceID, galleryID uuid.UUID) ([]DesignSuggestion, error) {
	apiKey := ""
	if s.configRepo != nil {
		key, _, err := s.configRepo.GetDecryptedKey(ctx, workspaceID)
		if err == nil {
			apiKey = key
		}
	}

	assets, err := s.assetRepo.List(ctx, repository.AssetFilter{
		GalleryID: &galleryID,
		Limit:     20,
		Sort:      "created_at",
		Order:     "desc",
	})
	if err != nil {
		return nil, fmt.Errorf("list assets: %w", err)
	}
	if len(assets) == 0 {
		return s.defaultSuggestions(), nil
	}

	contentHints := extractContentHints(assets)

	// Real Gemini path: only when key is configured AND a reasoner is wired.
	if apiKey != "" && s.gemini != nil {
		if suggestions, err := s.geminiSuggest(ctx, apiKey, assets, contentHints); err == nil {
			return suggestions, nil
		} else {
			log.Printf("design-ai: gemini call failed, falling back to heuristic: %v", err)
		}
	}

	// Deterministic heuristic fallback.
	return s.rankSuggestions(contentHints), nil
}

// geminiSuggest builds a prompt from gallery metadata, calls the model, and
// parses a structured JSON response. The prompt constrains the model to the
// whitelisted theme / cover style / font pairing IDs so results are safe to
// pass straight to the frontend.
func (s *DesignAIService) geminiSuggest(ctx context.Context, apiKey string, assets []repository.Asset, hints map[string]int) ([]DesignSuggestion, error) {
	prompt := buildDesignPrompt(assets, hints)

	raw, _, _, err := s.gemini.GenerateText(ctx, apiKey, prompt)
	if err != nil {
		return nil, fmt.Errorf("gemini generate: %w", err)
	}

	var payload struct {
		Suggestions []DesignSuggestion `json:"suggestions"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, fmt.Errorf("unmarshal gemini response: %w", err)
	}

	validated := make([]DesignSuggestion, 0, len(payload.Suggestions))
	for _, sug := range payload.Suggestions {
		if !contains(validThemeList, sug.Theme) {
			continue
		}
		if !contains(validCoverStyleList, sug.CoverStyle) {
			sug.CoverStyle = pickCoverStyle(sug.Theme)
		}
		if !contains(validFontPairings, sug.FontPairing) {
			sug.FontPairing = pickFontPairing(sug.Theme)
		}
		if strings.TrimSpace(sug.Reasoning) == "" {
			continue // reasoning is the whole point of FR-078
		}
		if sug.Confidence < 0 || sug.Confidence > 1 {
			sug.Confidence = math.Max(0.3, math.Min(1.0, sug.Confidence))
		}
		validated = append(validated, sug)
		if len(validated) == 3 {
			break
		}
	}

	if len(validated) == 0 {
		return nil, fmt.Errorf("gemini returned no valid suggestions")
	}
	return validated, nil
}

// buildDesignPrompt assembles a deterministic prompt from gallery metadata.
func buildDesignPrompt(assets []repository.Asset, hints map[string]int) string {
	var sb strings.Builder
	sb.WriteString("You are a photography gallery design expert. Given the metadata below, pick the three best matching themes and explain why in one sentence each.\n\n")
	sb.WriteString(fmt.Sprintf("Gallery contains %d photos. Recent filenames:\n", len(assets)))
	maxList := 10
	if len(assets) < maxList {
		maxList = len(assets)
	}
	for i := 0; i < maxList; i++ {
		sb.WriteString("  - ")
		sb.WriteString(assets[i].Filename)
		sb.WriteString("\n")
	}
	if len(hints) > 0 {
		sb.WriteString("\nDetected content hints: ")
		first := true
		for k, v := range hints {
			if !first {
				sb.WriteString(", ")
			}
			first = false
			sb.WriteString(fmt.Sprintf("%s=%d", k, v))
		}
		sb.WriteString("\n")
	}
	sb.WriteString("\nRespond with ONLY valid JSON (no markdown, no code fences) in this exact shape:\n")
	sb.WriteString(`{"suggestions":[{"theme":"<id>","cover_style":"<id>","font_pairing":"<id>","reasoning":"<one sentence>","confidence":<0.0-1.0>}]}` + "\n\n")
	sb.WriteString("Valid theme IDs: " + strings.Join(validThemeList, ", ") + "\n")
	sb.WriteString("Valid cover_style IDs: " + strings.Join(validCoverStyleList, ", ") + "\n")
	sb.WriteString("Valid font_pairing IDs: " + strings.Join(validFontPairings, ", ") + "\n")
	sb.WriteString("Return exactly 3 suggestions ordered best to worst.\n")
	return sb.String()
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func extractContentHints(assets []repository.Asset) map[string]int {
	hints := make(map[string]int)
	for _, a := range assets {
		name := a.Filename
		for _, kw := range []string{"wedding", "portrait", "landscape", "product", "baby", "fashion", "event", "food", "architecture", "travel"} {
			if containsIgnoreCase(name, kw) {
				hints[kw]++
			}
		}
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
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
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
	for i, sc := range scores {
		if i >= 3 {
			break
		}
		confidence := math.Max(0.3, sc.score/maxScore)
		coverStyle := pickCoverStyle(sc.theme)
		fontPairing := pickFontPairing(sc.theme)
		reasoning := fmt.Sprintf("Heuristic match: %s keywords dominate your filenames, which suits the %s aesthetic.", themeProfiles[sc.theme][0], sc.theme)

		suggestions = append(suggestions, DesignSuggestion{
			Theme: sc.theme, CoverStyle: coverStyle, FontPairing: fontPairing,
			Reasoning: reasoning, Confidence: confidence,
		})
	}

	if len(suggestions) == 0 {
		return (*DesignAIService)(nil).defaultSuggestions()
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
