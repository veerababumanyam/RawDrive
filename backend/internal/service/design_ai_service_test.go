package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/stretchr/testify/assert"
)

// fakeReasoner records the last prompt passed to GenerateText and returns a
// preset response. This lets us assert that GAL-FR-078 actually invokes the
// LLM rather than falling silently back to the template reasoner.
type fakeReasoner struct {
	lastPrompt string
	response   string
	err        error
	callCount  int
}

func (f *fakeReasoner) GenerateText(_ context.Context, _, prompt string) (string, int, int, error) {
	f.callCount++
	f.lastPrompt = prompt
	if f.err != nil {
		return "", 0, 0, f.err
	}
	return f.response, 100, 200, nil
}

func TestBuildDesignPrompt_IncludesGalleryMetadata(t *testing.T) {
	assets := []repository.Asset{
		{Filename: "Wedding_01.jpg"},
		{Filename: "Wedding_02.jpg"},
		{Filename: "Bride_portrait.jpg"},
	}
	hints := map[string]int{"wedding": 2, "portrait": 1}

	prompt := buildDesignPrompt(assets, hints)

	assert.Contains(t, prompt, "Wedding_01.jpg")
	assert.Contains(t, prompt, "Bride_portrait.jpg")
	assert.Contains(t, prompt, "wedding=2")
	assert.Contains(t, prompt, "portrait=1")
	assert.Contains(t, prompt, "liquid-glass")
	assert.Contains(t, prompt, "elegant-frame")
	assert.Contains(t, prompt, "valid JSON")
}

func TestBuildDesignPrompt_HandlesEmptyHints(t *testing.T) {
	prompt := buildDesignPrompt([]repository.Asset{{Filename: "IMG_0001.jpg"}}, map[string]int{})
	assert.Contains(t, prompt, "IMG_0001.jpg")
	assert.NotContains(t, prompt, "Detected content hints:")
}

func TestGeminiSuggest_ValidatesModelOutput(t *testing.T) {
	fake := &fakeReasoner{
		response: `{"suggestions":[
			{"theme":"heritage","cover_style":"elegant-frame","font_pairing":"elegant","reasoning":"The wedding photos call for a classic frame.","confidence":0.9},
			{"theme":"noir","cover_style":"cinematic-dark","font_pairing":"editorial","reasoning":"Dramatic lighting suits a dark cinematic look.","confidence":0.7},
			{"theme":"INVALID_THEME","cover_style":"elegant-frame","font_pairing":"elegant","reasoning":"should be dropped","confidence":0.4}
		]}`,
	}
	svc := &DesignAIService{gemini: fake}

	suggestions, err := svc.geminiSuggest(context.Background(), "test-key",
		[]repository.Asset{{Filename: "wedding_01.jpg"}},
		map[string]int{"wedding": 1})

	assert.NoError(t, err)
	assert.Equal(t, 1, fake.callCount, "Gemini must be called exactly once")
	assert.Contains(t, fake.lastPrompt, "wedding_01.jpg", "prompt must contain gallery metadata")
	assert.Len(t, suggestions, 2, "invalid theme must be filtered out")
	assert.Equal(t, "heritage", suggestions[0].Theme)
	assert.NotEmpty(t, suggestions[0].Reasoning)
}

func TestGeminiSuggest_RejectsEmptyReasoning(t *testing.T) {
	fake := &fakeReasoner{
		response: `{"suggestions":[
			{"theme":"heritage","cover_style":"elegant-frame","font_pairing":"elegant","reasoning":"","confidence":0.9}
		]}`,
	}
	svc := &DesignAIService{gemini: fake}

	_, err := svc.geminiSuggest(context.Background(), "test-key",
		[]repository.Asset{{Filename: "x.jpg"}}, map[string]int{})

	assert.Error(t, err, "empty reasoning must be rejected — FR-078 requires visible reasoning")
}

func TestGeminiSuggest_SubstitutesInvalidCoverStyle(t *testing.T) {
	fake := &fakeReasoner{
		response: `{"suggestions":[
			{"theme":"heritage","cover_style":"FAKE-STYLE","font_pairing":"elegant","reasoning":"Good for weddings.","confidence":0.9}
		]}`,
	}
	svc := &DesignAIService{gemini: fake}

	suggestions, err := svc.geminiSuggest(context.Background(), "test-key",
		[]repository.Asset{{Filename: "x.jpg"}}, map[string]int{})

	assert.NoError(t, err)
	assert.Len(t, suggestions, 1)
	assert.Equal(t, "elegant-frame", suggestions[0].CoverStyle)
}

func TestGeminiSuggest_PropagatesGenerateError(t *testing.T) {
	fake := &fakeReasoner{err: errors.New("quota exhausted")}
	svc := &DesignAIService{gemini: fake}

	_, err := svc.geminiSuggest(context.Background(), "test-key",
		[]repository.Asset{{Filename: "x.jpg"}}, map[string]int{})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "gemini generate")
}

func TestGeminiSuggest_RejectsInvalidJSON(t *testing.T) {
	fake := &fakeReasoner{response: `not-json`}
	svc := &DesignAIService{gemini: fake}

	_, err := svc.geminiSuggest(context.Background(), "test-key",
		[]repository.Asset{{Filename: "x.jpg"}}, map[string]int{})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unmarshal")
}

func TestRankSuggestions_ReturnsHeuristicReasoning(t *testing.T) {
	svc := &DesignAIService{}
	suggestions := svc.rankSuggestions(map[string]int{"wedding": 3})

	assert.NotEmpty(t, suggestions)
	for _, s := range suggestions {
		assert.NotEmpty(t, s.Reasoning, "heuristic reasoning must never be empty")
		assert.True(t, strings.HasPrefix(s.Reasoning, "Heuristic"), "heuristic path must label itself")
	}
}

func TestDefaultSuggestions_AlwaysReturnsThree(t *testing.T) {
	var svc *DesignAIService
	suggestions := svc.defaultSuggestions()
	assert.Len(t, suggestions, 3)
	for _, s := range suggestions {
		assert.NotEmpty(t, s.Reasoning)
		assert.NotEmpty(t, s.Theme)
	}
}
