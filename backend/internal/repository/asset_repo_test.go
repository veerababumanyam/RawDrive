package repository

import (
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
	assert.Equal(t, int64(52428800), a.SizeBytes)
	assert.Equal(t, "ready", a.Status)
	assert.Equal(t, "local", a.StorageDriver)
	assert.Equal(t, 6000, *a.Width)
	assert.Equal(t, &blurhash, a.Blurhash)
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
