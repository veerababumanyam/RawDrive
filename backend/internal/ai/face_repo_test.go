package ai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFaceRepoStoreFacesWritesJSONBoundingBox(t *testing.T) {
	ctx := context.Background()
	pool := getAITestPool(t)
	repo := NewFaceRepo(pool)
	workspaceID, galleryID := seedFaceIdentityWorkspace(t, ctx, pool)
	assetID := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "face-index.jpg")

	err := repo.StoreFaces(ctx, []*FaceCluster{{
		WorkspaceID: workspaceID,
		AssetID:     assetID,
		GalleryID:   &galleryID,
		FaceIndex:   0,
		BoundingBox: BoundingBox{
			X: 0.12,
			Y: 0.23,
			W: 0.34,
			H: 0.45,
		},
		Embedding:  faceIdentityEmbedding(1),
		Confidence: 0.98,
		Source:     "client",
	}})
	require.NoError(t, err)

	var rawBoundingBox string
	err = pool.QueryRow(ctx, `
		SELECT bounding_box::text
		FROM face_clusters
		WHERE asset_id = $1 AND source = 'client'
	`, assetID).Scan(&rawBoundingBox)
	require.NoError(t, err)
	require.JSONEq(t, `{"x":0.12,"y":0.23,"w":0.34,"h":0.45}`, rawBoundingBox)

	faces, err := repo.GetFacesByAsset(ctx, assetID)
	require.NoError(t, err)
	require.Len(t, faces, 1)
	require.Equal(t, BoundingBox{X: 0.12, Y: 0.23, W: 0.34, H: 0.45}, faces[0].BoundingBox)
}
