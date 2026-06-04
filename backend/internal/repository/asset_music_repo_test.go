package repository

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Music library, repository layer (Gallery Enhancements June 2026, Option A —
// the workspace music library reuses the existing assets table, no schema
// change). These tests cover the two new repo methods that back the
// workspace-scoped music endpoints:
//
//   - AssetRepo.ListAudioByWorkspace : lists non-deleted audio/* assets for a
//     workspace, newest first (the GET /api/v1/music lister).
//   - AssetRepo.AssetFilter.ExcludeContentTypePrefix : excludes a content-type
//     prefix from the generic List so the dashboard photo grid never shows
//     library tracks (a pure-builder SQL-shape test, plus a DB round-trip).
//   - GalleryRepo.ClearMusicAsset : nulls galleries.music_asset_id for every
//     gallery in a workspace that pointed at a deleted track (the
//     DELETE /api/v1/music/{id} cascade).
//
// DB-backed tests reuse the package-level pool harness (getRetryTestPool /
// newRetryWorkspace from asset_repo_retry_test.go). When no DB is reachable
// they SKIP, matching the graceful-skip convention used across the repo tests.

// seedAudioAsset inserts an audio asset directly (no gallery membership) and
// returns its id. Mirrors seedRetryAsset but with a caller-chosen content_type
// so the audio/non-audio split can be exercised.
func seedAudioAsset(t *testing.T, ctx context.Context, repo *AssetRepo, workspaceID uuid.UUID, contentType, filename string) uuid.UUID {
	t.Helper()
	assetID := uuid.New()
	_, err := repo.Pool().Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
		   status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, 3145728, $5, 'active', NOW(), NOW())`,
		assetID, workspaceID, filename, contentType,
		"ws/"+workspaceID.String()+"/"+uuid.NewString())
	require.NoError(t, err)
	return assetID
}

// ──────────────────────── Pure builder: ExcludeContentTypePrefix ────────────────────────

// TestBuildAssetListQuery_ExcludesContentTypePrefix proves that when the filter
// carries ExcludeContentTypePrefix, the generated SQL appends a parameterized
// `content_type NOT LIKE $N` clause binding "<prefix>%". This is what keeps
// audio/* library tracks out of the dashboard photo grid. It is a DB-free proxy
// for the runtime behaviour (same style as the keyset builder tests).
func TestBuildAssetListQuery_ExcludesContentTypePrefix(t *testing.T) {
	q, args := buildAssetListQuery(AssetFilter{
		WorkspaceID:              uuid.New(),
		ExcludeContentTypePrefix: "audio/",
		Limit:                    50,
	})
	assert.Contains(t, q, "content_type NOT LIKE",
		"the exclude filter must emit a NOT LIKE clause to keep audio out of the photo grid")
	assert.Contains(t, args, "audio/%",
		"the prefix must be bound as a parameterized LIKE pattern, not interpolated")
}

// TestBuildAssetListQuery_NoExcludeWhenUnset proves the default path is
// unchanged: with ExcludeContentTypePrefix empty, no NOT LIKE clause is emitted
// (so existing callers — album smart filters, design-AI sampling — are
// unaffected, and audio is INCLUDED when not explicitly excluded).
func TestBuildAssetListQuery_NoExcludeWhenUnset(t *testing.T) {
	q, args := buildAssetListQuery(AssetFilter{
		WorkspaceID: uuid.New(),
		Limit:       50,
	})
	assert.NotContains(t, q, "NOT LIKE",
		"no exclude clause must be emitted when ExcludeContentTypePrefix is unset")
	assert.NotContains(t, args, "audio/%")
}

// ──────────────────────── DB-backed: ListAudioByWorkspace ────────────────────────

func TestListAudioByWorkspace_ReturnsOnlyWorkspaceAudioNewestFirst(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Music ListAudio")
	otherWs := newRetryWorkspace(t, ctx, repo, "Music ListAudio Other")

	// Two audio tracks in our workspace (mp3 inserted before wav, so wav is newest).
	mp3 := seedAudioAsset(t, ctx, repo, ws, "audio/mpeg", "sangeet.mp3")
	wav := seedAudioAsset(t, ctx, repo, ws, "audio/wav", "ceremony.wav")
	// A photo in our workspace — must NOT appear in the music list.
	_ = seedAudioAsset(t, ctx, repo, ws, "image/jpeg", "wedding.jpg")
	// An audio track in a different workspace — cross-tenant, must NOT appear.
	_ = seedAudioAsset(t, ctx, repo, otherWs, "audio/mpeg", "foreign.mp3")

	tracks, err := repo.ListAudioByWorkspace(ctx, ws)
	require.NoError(t, err)
	require.Len(t, tracks, 2, "only the two audio assets in this workspace must be listed")

	ids := []uuid.UUID{tracks[0].ID, tracks[1].ID}
	assert.Contains(t, ids, mp3)
	assert.Contains(t, ids, wav)
	for _, tr := range tracks {
		assert.True(t, len(tr.ContentType) >= 6 && tr.ContentType[:6] == "audio/",
			"every listed track must be audio/*, got %q", tr.ContentType)
	}
	// Newest-first ordering: wav (inserted last) must precede mp3.
	assert.Equal(t, wav, tracks[0].ID, "ListAudioByWorkspace must order newest-first")
}

func TestListAudioByWorkspace_ExcludesSoftDeleted(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Music ListAudio Deleted")

	live := seedAudioAsset(t, ctx, repo, ws, "audio/mpeg", "live.mp3")
	gone := seedAudioAsset(t, ctx, repo, ws, "audio/mpeg", "gone.mp3")
	require.NoError(t, repo.SoftDelete(ctx, gone))

	tracks, err := repo.ListAudioByWorkspace(ctx, ws)
	require.NoError(t, err)
	require.Len(t, tracks, 1, "a soft-deleted audio asset must be excluded")
	assert.Equal(t, live, tracks[0].ID)
}

func TestListAudioByWorkspace_EmptyWhenNone(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Music ListAudio Empty")

	tracks, err := repo.ListAudioByWorkspace(ctx, ws)
	require.NoError(t, err)
	assert.NotNil(t, tracks, "result must be a non-nil empty slice, never nil")
	assert.Len(t, tracks, 0)
}

// TestList_ExcludeContentTypePrefix_FiltersAudioInDB is the DB round-trip
// counterpart to the pure-builder test: with ExcludeContentTypePrefix="audio/"
// the photo grid lister returns the image but not the audio track; without it,
// both come back.
func TestList_ExcludeContentTypePrefix_FiltersAudioInDB(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, repo, "Music ListExclude")

	photo := seedAudioAsset(t, ctx, repo, ws, "image/jpeg", "wedding.jpg")
	track := seedAudioAsset(t, ctx, repo, ws, "audio/mpeg", "sangeet.mp3")

	excluded, err := repo.List(ctx, AssetFilter{WorkspaceID: ws, ExcludeContentTypePrefix: "audio/", Limit: 100})
	require.NoError(t, err)
	excludedIDs := map[uuid.UUID]bool{}
	for _, a := range excluded {
		excludedIDs[a.ID] = true
	}
	assert.True(t, excludedIDs[photo], "the photo must still be listed")
	assert.False(t, excludedIDs[track], "the audio track must be excluded from the photo grid")

	included, err := repo.List(ctx, AssetFilter{WorkspaceID: ws, Limit: 100})
	require.NoError(t, err)
	includedIDs := map[uuid.UUID]bool{}
	for _, a := range included {
		includedIDs[a.ID] = true
	}
	assert.True(t, includedIDs[photo], "photo still listed without the exclude filter")
	assert.True(t, includedIDs[track], "audio is included when the exclude filter is unset")
}

// ──────────────────────── DB-backed: GalleryRepo.ClearMusicAsset ────────────────────────

func TestClearMusicAsset_NullsReferencingGalleriesInWorkspaceOnly(t *testing.T) {
	pool := getRetryTestPool(t)
	assetRepo := NewAssetRepo(pool)
	galleryRepo := NewGalleryRepo(pool)
	ctx := context.Background()
	ws := newRetryWorkspace(t, ctx, assetRepo, "Music ClearMusic")
	otherWs := newRetryWorkspace(t, ctx, assetRepo, "Music ClearMusic Other")

	track := seedAudioAsset(t, ctx, assetRepo, ws, "audio/mpeg", "sangeet.mp3")
	// A second, real audio asset so a non-referencing gallery has a valid FK
	// target (galleries.music_asset_id has an FK to assets.id).
	otherTrack := seedAudioAsset(t, ctx, assetRepo, ws, "audio/wav", "ceremony.wav")

	// Two galleries in our workspace point at the track; one points elsewhere.
	g1 := seedMusicGallery(t, ctx, pool, ws, &track)
	g2 := seedMusicGallery(t, ctx, pool, ws, &track)
	g3 := seedMusicGallery(t, ctx, pool, ws, &otherTrack)
	// A gallery in a DIFFERENT workspace that references the same asset id — the
	// workspace_id-scoped clause must leave it alone (cross-tenant safe). The id
	// is a real asset (FK-valid), just owned by another tenant's gallery.
	foreign := seedMusicGallery(t, ctx, pool, otherWs, &track)

	require.NoError(t, galleryRepo.ClearMusicAsset(ctx, ws, track))

	assert.Nil(t, galleryMusicAssetID(t, ctx, pool, g1), "g1 referencing the track must be nulled")
	assert.Nil(t, galleryMusicAssetID(t, ctx, pool, g2), "g2 referencing the track must be nulled")
	if got := galleryMusicAssetID(t, ctx, pool, g3); assert.NotNil(t, got) {
		assert.Equal(t, otherTrack, *got, "a gallery pointing at a different track must be untouched")
	}
	if got := galleryMusicAssetID(t, ctx, pool, foreign); assert.NotNil(t, got) {
		assert.Equal(t, track, *got, "a gallery in another workspace must NOT be cleared (cross-tenant safe)")
	}
}

// seedMusicGallery inserts a minimal gallery row with a music_asset_id and
// returns its id, cleaning it up after the test.
func seedMusicGallery(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID, musicAssetID *uuid.UUID) uuid.UUID {
	t.Helper()
	id := uuid.New()
	slug := "music-gallery-" + uuid.NewString()
	_, err := pool.Exec(ctx,
		`INSERT INTO galleries (id, workspace_id, title, slug, music_asset_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
		id, workspaceID, "Music Gallery", slug, musicAssetID)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM galleries WHERE id = $1`, id)
	})
	return id
}

// galleryMusicAssetID reads back the (possibly NULL) music_asset_id of a gallery.
func galleryMusicAssetID(t *testing.T, ctx context.Context, pool *pgxpool.Pool, galleryID uuid.UUID) *uuid.UUID {
	t.Helper()
	var got *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT music_asset_id FROM galleries WHERE id = $1`, galleryID).Scan(&got))
	return got
}
