package ai

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

// TestSelectEmbeddingBackfillSQL pins the selection query for item 13c Part B:
// it must target only assets with a NULL embedding that are not soft-deleted,
// be deterministically ordered for resumability, and respect the batch limit.
func TestSelectEmbeddingBackfillSQL(t *testing.T) {
	sql := selectEmbeddingBackfillSQL()
	for _, want := range []string{
		"embedding IS NULL",
		"deleted_at IS NULL",
		"ORDER BY",
		"LIMIT $1",
	} {
		if !strings.Contains(sql, want) {
			t.Errorf("selection SQL missing %q\nSQL: %s", want, sql)
		}
	}
	// Must not accidentally re-embed rows that already have a vector.
	if strings.Contains(sql, "embedding IS NOT NULL") {
		t.Errorf("selection SQL must not target non-NULL embeddings\nSQL: %s", sql)
	}

	// The keyset-paginated form keeps the same predicate/ordering and adds the
	// (created_at, id) cursor so pages stitch together gap-free in both live
	// and dry-run modes.
	after := selectEmbeddingBackfillSQLAfter()
	for _, want := range []string{
		"embedding IS NULL",
		"deleted_at IS NULL",
		"(created_at, id) > ($2, $3)",
		"ORDER BY",
		"LIMIT $1",
	} {
		if !strings.Contains(after, want) {
			t.Errorf("keyset SQL missing %q\nSQL: %s", want, after)
		}
	}
}

// TestDeriveEmbeddingInput proves the backfill derives the embedding input text
// from the SAME source as the live path (ai_caption + ai_tags via
// buildEmbeddingText) and SKIPS assets that have no real text source instead of
// embedding the generic "photograph" fallback.
func TestDeriveEmbeddingInput(t *testing.T) {
	id := uuid.New()
	caption := func(s string) *string { return &s }

	t.Run("caption only", func(t *testing.T) {
		text, ok := deriveEmbeddingInput(id, caption("a bride laughing"), []byte(`[]`))
		if !ok {
			t.Fatal("expected eligible asset (has caption)")
		}
		if !strings.Contains(text, "a bride laughing") {
			t.Errorf("text %q missing caption", text)
		}
	})

	t.Run("tags only", func(t *testing.T) {
		text, ok := deriveEmbeddingInput(id, nil, []byte(`[{"tag":"sunset","category":"scene","confidence":0.9}]`))
		if !ok {
			t.Fatal("expected eligible asset (has tags)")
		}
		if !strings.Contains(text, "sunset") {
			t.Errorf("text %q missing tag", text)
		}
	})

	t.Run("caption and tags", func(t *testing.T) {
		text, ok := deriveEmbeddingInput(id, caption("golden hour"), []byte(`[{"tag":"warm"}]`))
		if !ok {
			t.Fatal("expected eligible asset")
		}
		// Must match the live buildEmbeddingText composition exactly.
		want := buildEmbeddingText(caption("golden hour"), []AITag{{Tag: "warm"}})
		if text != want {
			t.Errorf("derived text = %q, want %q (must match live buildEmbeddingText)", text, want)
		}
	})

	t.Run("no caption no tags -> skip", func(t *testing.T) {
		if _, ok := deriveEmbeddingInput(id, nil, []byte(`[]`)); ok {
			t.Error("asset with no caption and no tags must be skipped (skipped_no_text)")
		}
	})

	t.Run("nil caption nil tags -> skip", func(t *testing.T) {
		if _, ok := deriveEmbeddingInput(id, nil, nil); ok {
			t.Error("asset with nil caption and nil tags must be skipped")
		}
	})

	t.Run("whitespace caption no tags -> skip", func(t *testing.T) {
		if _, ok := deriveEmbeddingInput(id, caption("   "), []byte(`[]`)); ok {
			t.Error("asset whose only source is a blank caption must be skipped")
		}
	})

	t.Run("malformed tags json no caption -> skip", func(t *testing.T) {
		// decodeAITags degrades malformed JSONB to nil; with no caption that
		// leaves no text source, so the asset is skipped (not embedded as
		// the generic fallback).
		if _, ok := deriveEmbeddingInput(id, nil, []byte(`{not json`)); ok {
			t.Error("asset with malformed tags and no caption must be skipped")
		}
	})
}
