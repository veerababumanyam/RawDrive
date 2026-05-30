package ai

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

// TestF110_DecodeAITagsMalformedJSON is the regression test for F-110:
// the IndexAsset embedding path used to discard the json.Unmarshal error with
// `_ =`, leaving tags nil and silently degrading search with no operator
// visibility. decodeAITags must tolerate malformed JSONB (returning nil so the
// caller falls back to caption-only embedding) while still decoding valid input.
func TestF110_DecodeAITagsMalformedJSON(t *testing.T) {
	assetID := uuid.New()

	t.Run("malformed JSONB returns nil and does not panic", func(t *testing.T) {
		got := decodeAITags(assetID, []byte(`{not valid json`))
		if got != nil {
			t.Fatalf("expected nil tags for malformed JSONB, got %#v", got)
		}
	})

	t.Run("valid JSONB decodes tags", func(t *testing.T) {
		valid, err := json.Marshal([]AITag{
			{Tag: "bride", Category: "people", Confidence: 0.9, Source: "gemini", Status: "pending_review"},
			{Tag: "mandap", Category: "scene", Confidence: 0.8, Source: "gemini", Status: "pending_review"},
		})
		if err != nil {
			t.Fatalf("marshal fixture: %v", err)
		}
		got := decodeAITags(assetID, valid)
		if len(got) != 2 {
			t.Fatalf("expected 2 tags, got %d (%#v)", len(got), got)
		}
		if got[0].Tag != "bride" || got[1].Tag != "mandap" {
			t.Fatalf("unexpected decoded tags: %#v", got)
		}
	})

	t.Run("empty input returns nil", func(t *testing.T) {
		got := decodeAITags(assetID, nil)
		if got != nil {
			t.Fatalf("expected nil tags for nil input, got %#v", got)
		}
	})
}

// TestF110_BuildEmbeddingTextFallback verifies the embedding source text still
// degrades gracefully: when tags are nil (the malformed-JSONB case) the caption
// alone is used, and when neither caption nor tags exist a generic term is used.
func TestF110_BuildEmbeddingTextFallback(t *testing.T) {
	caption := "wedding ceremony"

	t.Run("caption only when tags are nil", func(t *testing.T) {
		got := buildEmbeddingText(&caption, nil)
		if got != "wedding ceremony " {
			t.Fatalf("expected caption-only text, got %q", got)
		}
	})

	t.Run("caption plus tags", func(t *testing.T) {
		tags := []AITag{{Tag: "bride"}, {Tag: "mandap"}}
		got := buildEmbeddingText(&caption, tags)
		if got != "wedding ceremony bride mandap " {
			t.Fatalf("expected caption+tags text, got %q", got)
		}
	})

	t.Run("generic fallback when nothing available", func(t *testing.T) {
		got := buildEmbeddingText(nil, nil)
		if got != "photograph" {
			t.Fatalf("expected generic fallback, got %q", got)
		}
	})
}
