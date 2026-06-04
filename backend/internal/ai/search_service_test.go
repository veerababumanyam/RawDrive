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

// TestF110_BuildEmbeddingTextFallback verifies the embedding source text is
// composed from caption + tags: when tags are nil (the malformed-JSONB case) the
// caption alone is used, and caption + tags concatenate in order.
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
}

// TestVEC7_IndexAssetSkipsEmptySource is the regression test for VEC-7. When an
// asset has neither a caption nor any tags, the LIVE embedding path
// (SearchService.IndexAsset) must NOT generate an embedding from the generic
// "photograph" literal — that produced near-identical generic vectors that
// clustered as false near-duplicates and polluted semantic search. Instead the
// asset must be SKIPPED (embedding left NULL), exactly matching the already-
// shipped backfill path (deriveEmbeddingInput → skipped_no_text). The shared
// embeddingSourceText seam is what IndexAsset gates on, so it is the unit under
// test (the DB write is integration-covered).
func TestVEC7_IndexAssetSkipsEmptySource(t *testing.T) {
	id := uuid.New()
	caption := func(s string) *string { return &s }

	t.Run("no caption no tags -> skip (no embedding)", func(t *testing.T) {
		if _, ok := embeddingSourceText(id, nil, []byte(`[]`)); ok {
			t.Fatal("VEC-7: empty-source asset must be skipped, not embedded as \"photograph\"")
		}
	})

	t.Run("nil caption nil tags -> skip", func(t *testing.T) {
		if _, ok := embeddingSourceText(id, nil, nil); ok {
			t.Fatal("VEC-7: nil-source asset must be skipped")
		}
	})

	t.Run("whitespace-only caption no tags -> skip", func(t *testing.T) {
		if _, ok := embeddingSourceText(id, caption("   "), []byte(`[]`)); ok {
			t.Fatal("VEC-7: blank-caption-only asset must be skipped")
		}
	})

	t.Run("malformed tags json no caption -> skip", func(t *testing.T) {
		if _, ok := embeddingSourceText(id, nil, []byte(`{not json`)); ok {
			t.Fatal("VEC-7: malformed-tags + no-caption asset must be skipped")
		}
	})

	t.Run("real caption -> embeds", func(t *testing.T) {
		text, ok := embeddingSourceText(id, caption("bride laughing"), []byte(`[]`))
		if !ok {
			t.Fatal("asset with a real caption must be embedded")
		}
		if text == "" || text == "photograph" {
			t.Fatalf("expected caption-derived text, got %q", text)
		}
	})

	t.Run("tags only -> embeds", func(t *testing.T) {
		text, ok := embeddingSourceText(id, nil, []byte(`[{"tag":"sunset"}]`))
		if !ok {
			t.Fatal("asset with tags must be embedded")
		}
		if text == "" || text == "photograph" {
			t.Fatalf("expected tag-derived text, got %q", text)
		}
	})

	t.Run("live seam matches backfill seam exactly", func(t *testing.T) {
		// The live IndexAsset gate and the backfill gate must agree for every
		// input so an asset is never embedded by one path and skipped by the
		// other. embeddingSourceText IS the shared seam deriveEmbeddingInput
		// delegates to.
		cases := []struct {
			cap  *string
			tags []byte
		}{
			{nil, []byte(`[]`)},
			{caption("golden hour"), []byte(`[{"tag":"warm"}]`)},
			{caption("   "), []byte(`[]`)},
			{nil, []byte(`[{"tag":"mandap"}]`)},
		}
		for _, c := range cases {
			lt, lok := embeddingSourceText(id, c.cap, c.tags)
			bt, bok := deriveEmbeddingInput(id, c.cap, c.tags)
			if lok != bok || lt != bt {
				t.Fatalf("live/backfill seam diverged for caption=%v tags=%s: live=(%q,%v) backfill=(%q,%v)",
					c.cap, c.tags, lt, lok, bt, bok)
			}
		}
	})
}
