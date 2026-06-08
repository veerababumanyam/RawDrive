package ai

// Slice 3h (B-D1) regression: the gallery-scoped candidate query that FaceMatch
// calls — FindSimilarFacesInGallery — used to retrieve UNCLUSTERED candidate
// faces (no cluster_label IS NOT NULL filter), while the PhotoSearch path
// (FindSimilarFacesInGalleryScored) only ever returned clustered candidates.
// That behavioral drift meant the two public biometric endpoints in the SAME
// gallery searched DIFFERENT candidate sets for the same selfie.
//
// FindSimilarFacesInGallery now applies the SAME clustered-only filter
// (cluster_label IS NOT NULL) as the Scored variant, so both public endpoints
// share one candidate contract. This DB-backed test stores one clustered and
// one unclustered face of the SAME embedding in one gallery and asserts the
// unclustered candidate is excluded — and that the gallery scope still holds.

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// TestFindSimilarFacesInGallery_ExcludesUnclusteredCandidates pins the
// clustered-only candidate filter on the FaceMatch repo path. With both a
// clustered and an unclustered face matching the query embedding, only the
// clustered one may be returned — mirroring FindSimilarFacesInGalleryScored.
func TestFindSimilarFacesInGallery_ExcludesUnclusteredCandidates(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	repo := NewFaceRepo(pool)

	workspaceID, galleryID := seedFaceIdentityWorkspace(t, ctx, pool)
	embedding := samePersonEmbedding()

	// Clustered candidate — must be retrievable.
	clusteredAsset := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "clustered.jpg")
	clusterLabel := uuid.New()
	seedFaceIdentityFaceWithEmbedding(t, ctx, repo, workspaceID, clusteredAsset, &galleryID, clusterLabel, "Cluster", 0, embedding)

	// Unclustered candidate (cluster_label NULL) — must be excluded.
	unclusteredAsset := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "unclustered.jpg")
	storeUnclusteredFace(t, ctx, repo, workspaceID, unclusteredAsset, &galleryID, embedding, 0)

	matches, err := repo.FindSimilarFacesInGallery(ctx, embedding, galleryID, 0.30, 200)
	require.NoError(t, err)

	for _, m := range matches {
		require.NotNil(t, m.ClusterLabel,
			"FindSimilarFacesInGallery must return only clustered candidates (cluster_label IS NOT NULL)")
		require.NotEqual(t, unclusteredAsset, m.AssetID,
			"the unclustered face must be excluded from FaceMatch candidates")
	}
	require.NotEmpty(t, matches, "the clustered candidate should still be retrievable")
}

// TestFindSimilarFacesInGallery_AndScored_ShareCandidateSet asserts that the
// FaceMatch repo path and the PhotoSearch repo path return the SAME set of
// candidate asset IDs for the same gallery, threshold, and embedding — i.e.
// both apply the gallery scope AND the clustered-only filter identically.
func TestFindSimilarFacesInGallery_AndScored_ShareCandidateSet(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	repo := NewFaceRepo(pool)

	workspaceID, galleryID := seedFaceIdentityWorkspace(t, ctx, pool)
	embedding := samePersonEmbedding()

	clusterLabel := uuid.New()
	clusteredAsset := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "shared-clustered.jpg")
	seedFaceIdentityFaceWithEmbedding(t, ctx, repo, workspaceID, clusteredAsset, &galleryID, clusterLabel, "Cluster", 0, embedding)

	// Noise: an unclustered face neither path should surface.
	unclusteredAsset := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "shared-unclustered.jpg")
	storeUnclusteredFace(t, ctx, repo, workspaceID, unclusteredAsset, &galleryID, embedding, 0)

	const threshold = 0.30
	const limit = 200

	plain, err := repo.FindSimilarFacesInGallery(ctx, embedding, galleryID, threshold, limit)
	require.NoError(t, err)
	scored, err := repo.FindSimilarFacesInGalleryScored(ctx, embedding, galleryID, threshold, limit)
	require.NoError(t, err)

	plainAssets := assetIDSet(facesToAssetIDs(plain))
	scoredAssets := make(map[uuid.UUID]struct{}, len(scored))
	for _, m := range scored {
		scoredAssets[m.Face.AssetID] = struct{}{}
	}

	require.Equal(t, plainAssets, scoredAssets,
		"FaceMatch and PhotoSearch must search the same gallery-scoped, clustered-only candidate set")
	require.Contains(t, plainAssets, clusteredAsset)
	require.NotContains(t, plainAssets, unclusteredAsset)
}

func facesToAssetIDs(faces []*FaceCluster) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(faces))
	for _, f := range faces {
		ids = append(ids, f.AssetID)
	}
	return ids
}

func assetIDSet(ids []uuid.UUID) map[uuid.UUID]struct{} {
	set := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		set[id] = struct{}{}
	}
	return set
}
