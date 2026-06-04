package handler

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

// TestAlbumListAssets_EnrichUsesSingleBulkQuery is the Q-2b regression for the
// owner gallery preview's album branch. ?include_assets=true on
// GET /api/v1/albums/{id}/assets must hydrate the whole album page with ONE bulk
// asset query (reusing the same batch seam the gallery list uses for PERF-23 and
// the public path uses for F-029), embedding each asset on its album-asset row in
// the album's position order. Assets missing from the bulk result (e.g.
// soft-deleted between the membership read and the asset read) embed as nil, which
// the client renders as a pending tile. Before this fix the preview looped
// getAsset() per asset client-side for the album path — an N+1 that scaled with
// album size.
func TestAlbumListAssets_EnrichUsesSingleBulkQuery(t *testing.T) {
	a1, a2, a3 := uuid.New(), uuid.New(), uuid.New()
	batch := &countingAssetBatchSource{store: map[uuid.UUID]*repository.Asset{
		a1: newAsset(a1, "a.jpg"),
		a3: newAsset(a3, "c.jpg"),
		// a2 intentionally absent — simulates an asset soft-deleted between reads.
	}}
	h := (&AlbumHandler{}).WithAssetBatchSource(batch)

	// Album membership rows in position order (note positions are not 0..n
	// dense — the helper must preserve the membership slice order it is given).
	members := []repository.AlbumAsset{
		{AssetID: a1, Position: 0},
		{AssetID: a2, Position: 1},
		{AssetID: a3, Position: 2},
	}

	out, err := h.enrichAlbumAssets(context.Background(), members)
	require.NoError(t, err)

	// Exactly one bulk query for all three ids — never one GetByID per asset.
	require.Equal(t, 1, batch.calls, "include_assets must issue a single bulk query")
	require.Equal(t, 3, batch.totalIDs)

	// Order follows the album membership (position) order, not GetByIDs order.
	require.Len(t, out, 3)

	require.Equal(t, a1, out[0].AssetID)
	require.NotNil(t, out[0].Asset)
	require.Equal(t, "a.jpg", out[0].Asset.Filename)

	require.Equal(t, a2, out[1].AssetID)
	require.Nil(t, out[1].Asset, "an asset missing from the bulk result embeds as nil")

	require.Equal(t, a3, out[2].AssetID)
	require.NotNil(t, out[2].Asset)
	require.Equal(t, "c.jpg", out[2].Asset.Filename)
}

// TestAlbumListAssets_EnrichWithoutBatchSourceDegrades verifies that when no
// batch source (and no pool) is wired, enrichment degrades to nil-embedded rows
// rather than panicking — the client then falls back to its own hydration.
func TestAlbumListAssets_EnrichWithoutBatchSourceDegrades(t *testing.T) {
	a1 := uuid.New()
	h := &AlbumHandler{} // no batch source, no pool

	out, err := h.enrichAlbumAssets(context.Background(), []repository.AlbumAsset{{AssetID: a1, Position: 0}})
	require.NoError(t, err)
	require.Len(t, out, 1)
	require.Equal(t, a1, out[0].AssetID)
	require.Nil(t, out[0].Asset)
}
