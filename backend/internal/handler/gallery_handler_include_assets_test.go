package handler

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

// TestGalleryListAssets_EnrichUsesSingleBulkQuery is the PERF-23 regression for
// the dashboard gallery list. ?include_assets=true must hydrate a whole gallery
// page with ONE bulk asset query (reusing the same batch seam the public path
// uses for F-029), embedding each asset on its junction row in the gallery's
// sort order. Assets missing from the bulk result (e.g. soft-deleted between the
// junction read and the asset read) embed as nil, which the client renders as a
// pending tile. Before this fix the dashboard looped getAsset() per asset
// client-side — an N+1 that scaled with gallery size.
func TestGalleryListAssets_EnrichUsesSingleBulkQuery(t *testing.T) {
	a1, a2, a3 := uuid.New(), uuid.New(), uuid.New()
	batch := &countingAssetBatchSource{store: map[uuid.UUID]*repository.Asset{
		a1: newAsset(a1, "a.jpg"),
		a3: newAsset(a3, "c.jpg"),
		// a2 intentionally absent — simulates an asset soft-deleted between reads.
	}}
	h := (&GalleryHandler{}).WithAssetBatchSource(batch)

	junctions := []repository.GalleryAsset{
		{AssetID: a1, SortOrder: 0},
		{AssetID: a2, SortOrder: 1},
		{AssetID: a3, SortOrder: 2},
	}

	out, err := h.enrichGalleryAssets(context.Background(), junctions)
	require.NoError(t, err)

	// Exactly one bulk query for all three ids — never one GetByID per asset.
	require.Equal(t, 1, batch.calls, "include_assets must issue a single bulk query")
	require.Equal(t, 3, batch.totalIDs)

	// Order follows the gallery junction (sort) order, not GetByIDs return order.
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

// TestGalleryListAssets_EnrichWithoutBatchSourceDegrades verifies that when no
// batch source (and no pool) is wired, enrichment degrades to nil-embedded rows
// rather than panicking — the client then falls back to its own hydration.
func TestGalleryListAssets_EnrichWithoutBatchSourceDegrades(t *testing.T) {
	a1 := uuid.New()
	h := &GalleryHandler{} // no batch source, no pool

	out, err := h.enrichGalleryAssets(context.Background(), []repository.GalleryAsset{{AssetID: a1}})
	require.NoError(t, err)
	require.Len(t, out, 1)
	require.Equal(t, a1, out[0].AssetID)
	require.Nil(t, out[0].Asset)
}
