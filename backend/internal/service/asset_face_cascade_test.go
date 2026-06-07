package service

// asset_face_cascade_test.go — slice 3k (B-X1) regression.
//
// Face embeddings are special-category biometric data. Their deletion on
// asset hard-delete relies SOLELY on the FK cascade declared in migration
// 017 (face_clusters.asset_id REFERENCES assets(id) ON DELETE CASCADE).
// Before this test there was NO regression coverage proving that the
// user-visible asset hard-delete path (AssetService.SoftDelete, which is a
// synchronous hard-delete) actually removes the subject's face_clusters
// rows. A future migration that dropped the cascade, or a delete path that
// bypassed the assets row delete, would silently orphan biometric data with
// no test catching it.
//
// This test exercises the REAL deletion path — AssetService.SoftDelete →
// AssetRepo.HardDeleteWithStorageAccounting → DELETE FROM assets — and
// asserts the cascade removed every face_clusters row for the asset. The
// dead, never-called FaceRepo.DeleteFacesByAsset was removed in favour of
// this now-asserted cascade (the cascade runs inside the same DB
// transaction as the row delete, so it is atomic and awaited, honouring the
// synchronous-hard-delete law — no soft-delete/retention window).

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/repository"
)

func TestAssetHardDelete_CascadesFaceClusters(t *testing.T) {
	pool := getServiceTestPool(t)
	ctx := context.Background()

	assetRepo := repository.NewAssetRepo(pool)
	derivativeRepo := repository.NewAssetDerivativeRepo(pool)
	// fakeStore (download_service_test.go) is a storage.Provider whose Delete
	// is a no-op, so the post-commit B2 object cleanup does nothing while the
	// DB cascade — the behaviour under test — runs inside the row-delete tx.
	svc := NewAssetService(assetRepo, &fakeStore{}).
		WithDerivativeRepo(derivativeRepo)

	// Seed a workspace + an asset (real wedding filename with spaces/parens,
	// per the test-photos law — the cascade must not care about the name).
	workspaceID := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO workspaces (id, name) VALUES ($1, $2)`,
		workspaceID, "Face Cascade WS "+workspaceID.String()[:8])
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM workspaces WHERE id = $1`, workspaceID)
	})

	assetID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key, status)
		 VALUES ($1, $2, $3, 'image/jpeg', 100, $4, 'ready')`,
		assetID, workspaceID, "Wedding (42).jpg",
		workspaceID.String()+"/"+assetID.String()+"/original.jpg")
	require.NoError(t, err)

	// Seed face_clusters rows for the asset via the real FaceRepo so the
	// pgvector embedding is stored exactly as production does it.
	faceRepo := ai.NewFaceRepo(pool)
	clusterLabel := uuid.New()
	require.NoError(t, faceRepo.StoreFaces(ctx, []*ai.FaceCluster{
		{
			WorkspaceID:  workspaceID,
			AssetID:      assetID,
			FaceIndex:    0,
			BoundingBox:  ai.BoundingBox{X: 0.1, Y: 0.2, W: 0.3, H: 0.4},
			Embedding:    cascadeEmbedding(1),
			ClusterLabel: &clusterLabel,
			ClusterName:  "Guest A",
			Confidence:   0.95,
			Source:       "insightface",
		},
		{
			WorkspaceID: workspaceID,
			AssetID:     assetID,
			FaceIndex:   1,
			BoundingBox: ai.BoundingBox{X: 0.5, Y: 0.5, W: 0.2, H: 0.2},
			Embedding:   cascadeEmbedding(2),
			Confidence:  0.80,
			Source:      "insightface",
		},
	}))

	// Pre-condition: the faces exist.
	var before int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM face_clusters WHERE asset_id = $1`, assetID).Scan(&before))
	require.Equal(t, 2, before, "expected the seeded face rows before delete")

	// Act: the user-visible synchronous hard-delete path.
	require.NoError(t, svc.SoftDelete(ctx, assetID))

	// The asset row is gone.
	var assetCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM assets WHERE id = $1`, assetID).Scan(&assetCount))
	require.Equal(t, 0, assetCount, "asset row must be hard-deleted")

	// The biometric face rows cascade-deleted with the asset — this is the
	// erasure guarantee under test.
	var after int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM face_clusters WHERE asset_id = $1`, assetID).Scan(&after))
	require.Equal(t, 0, after,
		"hard-deleting the asset must cascade-delete its face_clusters (biometric) rows")
}

// cascadeEmbedding returns a deterministic 512-d embedding (migration 149
// widened face_clusters.embedding from vector(128) to vector(512)).
func cascadeEmbedding(seed float32) []float32 {
	e := make([]float32, 512)
	e[0] = seed
	e[1] = 1
	return e
}
