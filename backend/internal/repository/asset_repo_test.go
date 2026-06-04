package repository

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// ──────────────────────── Constructor ────────────────────────

func TestNewAssetRepo(t *testing.T) {
	repo := NewAssetRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

// ──────────────────────── Asset Model ────────────────────────

func TestAsset_Defaults(t *testing.T) {
	a := Asset{}
	assert.Equal(t, uuid.Nil, a.ID)
	assert.Empty(t, a.Filename)
	assert.Empty(t, a.ContentType)
	assert.Equal(t, int64(0), a.SizeBytes)
	assert.Empty(t, a.Status)
}

func TestAsset_AllFieldsSet(t *testing.T) {
	wsID := uuid.New()
	userID := uuid.New()
	now := time.Now()
	width := 6000
	height := 4000
	blurhash := "LEHV6nWB2yk8pyo0adR*.7kCMdnj"

	a := Asset{
		ID:            uuid.New(),
		WorkspaceID:   wsID,
		Filename:      "wedding_001.cr2",
		ContentType:   "image/x-canon-cr2",
		SizeBytes:     52428800, // 50MB
		StorageKey:    "ws/abc/assets/wedding_001.cr2",
		StorageDriver: "local",
		Width:         &width,
		Height:        &height,
		Blurhash:      &blurhash,
		ExifData:      map[string]interface{}{"camera": "Canon EOS R5"},
		ThumbnailURLs: map[string]string{"small": "/thumb/200.webp"},
		UploadedBy:    &userID,
		Status:        "ready",
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	assert.NotEqual(t, uuid.Nil, a.ID)
	assert.Equal(t, wsID, a.WorkspaceID)
	assert.Equal(t, "wedding_001.cr2", a.Filename)
	assert.Equal(t, "image/x-canon-cr2", a.ContentType)
	assert.Equal(t, int64(52428800), a.SizeBytes)
	assert.Equal(t, "ws/abc/assets/wedding_001.cr2", a.StorageKey)
	assert.Equal(t, "ready", a.Status)
	assert.Equal(t, "local", a.StorageDriver)
	assert.Equal(t, 6000, *a.Width)
	assert.Equal(t, 4000, *a.Height)
	assert.Equal(t, &blurhash, a.Blurhash)
	assert.Equal(t, map[string]interface{}{"camera": "Canon EOS R5"}, a.ExifData)
	assert.Equal(t, map[string]string{"small": "/thumb/200.webp"}, a.ThumbnailURLs)
	assert.Equal(t, &userID, a.UploadedBy)
	assert.Equal(t, now, a.CreatedAt)
	assert.Equal(t, now, a.UpdatedAt)
}

func TestAssetRepoJSONBHelpersMarshalMapsForPgCasts(t *testing.T) {
	sourceMetadata := map[string]interface{}{
		"original_filename":     "ChatGPT Image May 14, 2026.png",
		"original_content_type": "image/png",
		"image_width":           853,
		"image_height":          1844,
		"derivative_variants":   []interface{}{"thumb_sm_webp", "display_webp"},
	}

	raw := jsonMapString(sourceMetadata)
	var decoded map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatalf("jsonMapString produced invalid JSON: %v", err)
	}
	assert.Equal(t, "image/png", decoded["original_content_type"])
	assert.Equal(t, float64(853), decoded["image_width"])

	thumbs := jsonStringMap(map[string]string{"display_webp": "derivatives/display.webp"})
	var thumbDecoded map[string]string
	if err := json.Unmarshal([]byte(thumbs), &thumbDecoded); err != nil {
		t.Fatalf("jsonStringMap produced invalid JSON: %v", err)
	}
	assert.Equal(t, "derivatives/display.webp", thumbDecoded["display_webp"])
}

func TestAssetRepoNullableJSON(t *testing.T) {
	assert.Nil(t, nullableJSON(nil))

	raw := nullableJSON([]map[string]interface{}{
		{"category": "container", "severity": "info", "message": "ok"},
	})
	s, ok := raw.(string)
	if !ok {
		t.Fatalf("nullableJSON should return a string for non-nil JSON values, got %T", raw)
	}
	var decoded []map[string]interface{}
	if err := json.Unmarshal([]byte(s), &decoded); err != nil {
		t.Fatalf("nullableJSON produced invalid JSON: %v", err)
	}
	assert.Equal(t, "container", decoded[0]["category"])
}

// ──────────────────────── AssetFilter ────────────────────────

func TestAssetFilter_Defaults(t *testing.T) {
	var f AssetFilter
	assert.Equal(t, uuid.Nil, f.WorkspaceID)
	assert.Empty(t, f.ContentType)
	assert.Empty(t, f.Status)
	assert.Equal(t, 0, f.Limit)
}

func TestAssetFilter_AllFieldsSet(t *testing.T) {
	wsID := uuid.New()
	f := AssetFilter{
		WorkspaceID: wsID,
		ContentType: "image",
		Status:      "ready",
		Limit:       25,
		Offset:      0,
	}
	assert.Equal(t, wsID, f.WorkspaceID)
	assert.Equal(t, "image", f.ContentType)
	assert.Equal(t, "ready", f.Status)
	assert.Equal(t, 25, f.Limit)
	assert.Equal(t, 0, f.Offset)
}

// ──────────────────────── Q-4: keyset pagination query shape ────────────────────────
//
// These guard the SQL buildAssetListQuery emits. They are DB-free proxies for
// the runtime behaviour: a deep page must NOT use OFFSET (which re-scans every
// skipped row, O(offset)) but instead seek past the cursor via
// `(created_at, id) < ($ts, $id)` over idx_assets_workspace_created — flat
// latency regardless of page depth. Each test fails against the pre-fix
// OFFSET-only builder and passes against the keyset builder.

// TestBuildAssetListQuery_NoCursorUsesOffset documents the legacy path: with no
// cursor, List keeps LIMIT/OFFSET so existing callers (album smart filters,
// design-AI sampling) are unaffected.
func TestBuildAssetListQuery_NoCursorUsesOffset(t *testing.T) {
	q, args := buildAssetListQuery(AssetFilter{
		WorkspaceID: uuid.New(),
		Limit:       50,
		Offset:      500,
	})
	assert.Contains(t, q, "OFFSET", "no-cursor path must keep LIMIT/OFFSET for backward compatibility")
	assert.Contains(t, q, "ORDER BY created_at DESC")
	// offset value is bound as the last positional arg
	assert.Equal(t, 500, args[len(args)-1], "offset must be parameterized, not interpolated")
}

// TestBuildAssetListQuery_CursorUsesKeyset is the crux of Q-4: a cursor turns
// the query into a keyset seek with NO OFFSET, ordered by the composite
// (created_at, id) so the result set is total-ordered and stable.
func TestBuildAssetListQuery_CursorUsesKeyset(t *testing.T) {
	cur := &AssetCursor{CreatedAt: time.Now().UTC().Truncate(time.Microsecond), ID: uuid.New()}
	q, args := buildAssetListQuery(AssetFilter{
		WorkspaceID: uuid.New(),
		Limit:       50,
		Offset:      9999, // must be IGNORED on the keyset path
		Cursor:      cur,
	})

	// The seek predicate over the composite index — this is what makes deep
	// pages O(1) instead of O(offset).
	assert.Contains(t, q, "(created_at, id) <",
		"keyset path must seek past the cursor via the (created_at, id) tuple")
	// Stable total order matching idx_assets_workspace_created + PK tiebreak.
	assert.Contains(t, q, "ORDER BY created_at DESC, id DESC")
	// Regression guard: the OFFSET re-scan must be GONE on the keyset path.
	assert.NotContains(t, q, "OFFSET",
		"keyset path must NOT emit OFFSET — that is the O(offset) deep-page re-scan Q-4 fixes")

	// The cursor tuple is bound as positional args (not interpolated), and the
	// stale Offset=9999 never reaches the args list.
	assert.Contains(t, args, cur.CreatedAt)
	assert.Contains(t, args, cur.ID)
	assert.NotContains(t, args, 9999, "Offset must be ignored when a cursor is supplied")
}

// TestBuildAssetListQuery_CursorIgnoredForAltSort proves keyset only engages on
// the default created_at ordering; alternate sorts (no composite index) fall
// back to OFFSET so they stay correct rather than silently mis-ordering.
func TestBuildAssetListQuery_CursorIgnoredForAltSort(t *testing.T) {
	cur := &AssetCursor{CreatedAt: time.Now().UTC(), ID: uuid.New()}
	q, _ := buildAssetListQuery(AssetFilter{
		WorkspaceID: uuid.New(),
		Sort:        "filename",
		Cursor:      cur,
	})
	assert.NotContains(t, q, "(created_at, id) <",
		"keyset must not engage for non-created_at sorts (no covering index)")
	assert.Contains(t, q, "OFFSET")
}

// TestAssetCursor_RoundTrip proves the dead Cursor field is now USED end-to-end:
// a cursor encodes to an opaque token and decodes back to the exact
// (created_at, id) tuple, so the API can hand it out and accept it back.
func TestAssetCursor_RoundTrip(t *testing.T) {
	orig := AssetCursor{CreatedAt: time.Now().UTC().Truncate(time.Microsecond), ID: uuid.New()}
	tok := orig.Encode()
	assert.NotEmpty(t, tok)
	assert.NotContains(t, tok, ":", "encoded cursor must be opaque (base64), not raw")

	got, err := DecodeAssetCursor(tok)
	assert.NoError(t, err)
	assert.True(t, orig.CreatedAt.Equal(got.CreatedAt), "created_at must round-trip exactly")
	assert.Equal(t, orig.ID, got.ID)
}

// TestDecodeAssetCursor_FailsClosed proves a tampered/garbage cursor errors out
// (→ 400 at the handler) instead of silently degrading to a full scan.
func TestDecodeAssetCursor_FailsClosed(t *testing.T) {
	for _, bad := range []string{"!!!not-base64!!!", "", "Zm9vYmFy" /* "foobar", no colon */} {
		_, err := DecodeAssetCursor(bad)
		assert.Error(t, err, "malformed cursor %q must error, not silently scan", bad)
	}
}

// ──────────────────────── Bulk query shape (F-071 / F-072) ────────────────────────
//
// These guard the SQL the bulk methods issue. The methods build no SQL at
// runtime — they pass these package-level constants straight to pgx — so
// asserting on the constants is a faithful, DB-free proxy for the round-trip
// behaviour the audit flagged. Each test fails against the pre-fix SQL and
// passes against the fixed SQL.

// TestF071BulkRemoveTagsSinglePass guards F-071: BulkRemoveTags must filter
// EVERY tag in one UPDATE via `!= ALL($1::text[])` instead of looping one
// UPDATE per tag with a scalar `!= $1` predicate.
func TestF071BulkRemoveTagsSinglePass(t *testing.T) {
	q := sqlBulkRemoveTags

	// The whole tag list is bound as a single text[] param and filtered in
	// one pass — this is the crux of collapsing N round-trips to 1.
	assert.Contains(t, q, "!= ALL($1::text[])",
		"BulkRemoveTags must filter all tags in one pass via != ALL($1::text[])")

	// Still workspace-scoped and soft-delete aware (tenant isolation must
	// not regress while optimising).
	assert.Contains(t, q, "workspace_id = $3")
	assert.Contains(t, q, "deleted_at IS NULL")

	// Regression guard: the pre-fix per-tag scalar predicate must be gone.
	assert.False(t, strings.Contains(q, "elem->>'tag' != $1)"),
		"BulkRemoveTags must not use the per-tag scalar predicate (one UPDATE per tag)")
}

// TestF072BulkMoveInsertSingleStatement guards F-072: BulkMoveToGallery must
// insert all moved assets in ONE multi-row INSERT (UNNEST ... WITH ORDINALITY)
// rather than looping tx.Exec per asset.
func TestF072BulkMoveInsertSingleStatement(t *testing.T) {
	q := sqlBulkMoveInsert

	// One round-trip: the asset ids are expanded server-side.
	assert.Contains(t, q, "unnest($2::uuid[])",
		"BulkMoveToGallery must expand asset ids via unnest($2::uuid[]) in one INSERT")
	assert.Contains(t, q, "WITH ORDINALITY",
		"BulkMoveToGallery must derive sort_order from ordinality, not a Go loop index")

	// sort_order stays 0-based, matching the prior loop index `i`.
	assert.Contains(t, q, "(ord - 1)",
		"BulkMoveToGallery must keep sort_order 0-based via (ord - 1)")

	// Idempotent-retry semantics preserved.
	assert.Contains(t, q, "ON CONFLICT DO NOTHING",
		"BulkMoveToGallery must stay idempotent via ON CONFLICT DO NOTHING")

	// Regression guard: the pre-fix per-asset VALUES loop INSERT must be gone.
	assert.False(t, strings.Contains(q, "VALUES ($1, $2, $3, now())"),
		"BulkMoveToGallery must not use the per-asset VALUES loop INSERT")
}
