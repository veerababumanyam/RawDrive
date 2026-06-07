package ai

// DB-backed concurrency regression test for slice 3f (issue #285).
//
// ClusterFaces used to be a non-transactional read-then-write: it called
// FindSimilarFaces (no match) and then minted a brand-new uuid.New() cluster
// label. Two faces of the SAME new person processed concurrently (worker batch
// + a client ingest, or two workers) both saw "no cluster" and minted DIFFERENT
// labels, splitting one person into two clusters that the merge UI then had to
// repair.
//
// FindOrAssignCluster now serializes the no-match → new-cluster decision under a
// per-(workspace, coarse-embedding-bucket) Postgres advisory transaction lock so
// concurrent first-faces of the same person converge on ONE cluster. This test
// drives two parallel ClusterFaces calls for near-identical embeddings and
// asserts EXACTLY ONE cluster label is created. Run with -race.

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestFaceService_ClusterFaces_ConcurrentFirstFaces_SingleCluster(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	repo := NewFaceRepo(pool)
	service := NewFaceService(repo, nil, nil)

	// N faces of the SAME (brand-new) person clustered concurrently. They are
	// all released from a barrier together so they hit the no-match window of
	// FindSimilarFaces at the same instant — the exact race the fix closes.
	// A fresh workspace per attempt + several attempts drives the race out
	// deterministically (a single 2-goroutine attempt is too flaky to fail
	// reliably on unfixed code).
	const facesPerAttempt = 8
	const attempts = 5

	for attempt := 0; attempt < attempts; attempt++ {
		workspaceID, galleryID := seedFaceIdentityWorkspace(t, ctx, pool)
		embedding := samePersonEmbedding()

		faces := make([]*FaceCluster, facesPerAttempt)
		for i := 0; i < facesPerAttempt; i++ {
			asset := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID,
				fmt.Sprintf("concurrent-%d-%d.jpg", attempt, i))
			faces[i] = storeUnclusteredFace(t, ctx, repo, workspaceID, asset, &galleryID, embedding, 0)
		}

		// Barrier: every goroutine blocks on the same channel, then all run
		// ClusterFaces simultaneously.
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(facesPerAttempt)
		errs := make([]error, facesPerAttempt)
		for i, fc := range faces {
			go func(idx int, f *FaceCluster) {
				defer wg.Done()
				<-start
				errs[idx] = service.ClusterFaces(ctx, []*FaceCluster{f}, workspaceID)
			}(i, fc)
		}
		close(start)
		wg.Wait()
		for i, err := range errs {
			require.NoErrorf(t, err, "ClusterFaces goroutine %d (attempt %d)", i, attempt)
		}

		// Every face must resolve to the SAME canonical cluster label, and
		// exactly ONE cluster must exist for this workspace. Before the fix the
		// concurrent no-match window minted multiple distinct labels → multiple
		// "Unnamed person" tiles for one face.
		canonical := uuid.Nil
		for _, f := range faces {
			label := clusterLabelOf(t, ctx, pool, f.ID)
			require.NotEqual(t, uuid.Nil, label)
			c, err := repo.ResolveClusterLabel(ctx, workspaceID, label)
			require.NoError(t, err)
			if canonical == uuid.Nil {
				canonical = c
			}
			require.Equalf(t, canonical, c,
				"attempt %d: concurrent first-faces of the same person must converge on one cluster", attempt)
		}

		summaries, err := repo.ListClusters(ctx, workspaceID, &galleryID)
		require.NoError(t, err)
		require.Lenf(t, summaries, 1,
			"attempt %d: concurrent first-faces must produce exactly one cluster, not %d", attempt, len(summaries))
	}
}

// samePersonEmbedding returns a stable, normalized-ish 512-d vector used for
// both concurrent faces so their cosine similarity is ~1.0 (same person).
func samePersonEmbedding() []float32 {
	embedding := make([]float32, 512)
	embedding[0] = 1
	embedding[1] = 0.5
	embedding[2] = 0.25
	return embedding
}

// storeUnclusteredFace inserts a face with NO cluster label (cluster_label
// NULL) so ClusterFaces takes the find-or-create path. Returns the stored
// FaceCluster (with its generated ID) so the test can cluster it.
func storeUnclusteredFace(t *testing.T, ctx context.Context, repo *FaceRepo, workspaceID, assetID uuid.UUID, galleryID *uuid.UUID, embedding []float32, faceIndex int) *FaceCluster {
	t.Helper()
	fc := &FaceCluster{
		WorkspaceID: workspaceID,
		AssetID:     assetID,
		GalleryID:   galleryID,
		FaceIndex:   faceIndex,
		BoundingBox: BoundingBox{X: 0.1, Y: 0.2, W: 0.3, H: 0.4},
		Embedding:   embedding,
		// ClusterLabel intentionally nil — unclustered.
		Confidence: 0.95,
		Source:     "client",
	}
	require.NoError(t, repo.StoreFaces(ctx, []*FaceCluster{fc}))
	return fc
}

func clusterLabelOf(t *testing.T, ctx context.Context, pool *pgxpool.Pool, faceID uuid.UUID) uuid.UUID {
	t.Helper()
	var label *uuid.UUID
	err := pool.QueryRow(ctx,
		`SELECT cluster_label FROM face_clusters WHERE id = $1`, faceID).Scan(&label)
	require.NoError(t, err)
	require.NotNil(t, label, "face should have been assigned a cluster label")
	return *label
}
