package ai

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestFaceRepo_ListClusterFaces_UsesGalleryAssetMembership(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	repo := NewFaceRepo(pool)

	workspaceID, galleryID := seedFaceIdentityWorkspace(t, ctx, pool)
	assetID := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "membership.jpg")
	clusterLabel := uuid.New()
	seedFaceIdentityFace(t, ctx, repo, workspaceID, assetID, nil, clusterLabel, "Guest", 0)

	faces, err := repo.ListClusterFaces(ctx, workspaceID, clusterLabel, &galleryID)

	require.NoError(t, err)
	require.Len(t, faces, 1)
	require.Equal(t, assetID, faces[0].AssetID)
	require.Nil(t, faces[0].GalleryID, "test row intentionally relies on gallery_assets membership")
}

func TestFaceRepo_FaceIndexStatusAndContactLink(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	repo := NewFaceRepo(pool)

	workspaceID, galleryID := seedFaceIdentityWorkspace(t, ctx, pool)
	assetID := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "sync-now.jpg")
	_, err := pool.Exec(ctx, `
		UPDATE assets
		SET thumbnail_urls = '{"display_webp":"thumbs/sync-now.webp"}'::jsonb
		WHERE id = $1
	`, assetID)
	require.NoError(t, err)

	status, err := repo.GetFaceIndexStatus(ctx, workspaceID, galleryID)
	require.NoError(t, err)
	require.Equal(t, 1, status.UploadedPhotos)
	require.Equal(t, 1, status.IndexablePhotos)
	require.Equal(t, 0, status.IndexedFaces)
	require.Equal(t, 0, status.IndexedPeople)
	require.Equal(t, "empty", status.Status)

	clusterLabel := uuid.New()
	seedFaceIdentityFace(t, ctx, repo, workspaceID, assetID, &galleryID, clusterLabel, "Guest", 0)
	status, err = repo.GetFaceIndexStatus(ctx, workspaceID, galleryID)
	require.NoError(t, err)
	require.Equal(t, 1, status.IndexedFaces)
	require.Equal(t, 1, status.IndexedPeople)
	require.Equal(t, 1, status.IndexedPhotos)
	require.Equal(t, "ready", status.Status)

	contactID := seedFaceIdentityContact(t, ctx, pool, workspaceID, "Priya Client")
	contact, err := repo.LinkClusterContact(ctx, workspaceID, clusterLabel, contactID, &galleryID)
	require.NoError(t, err)
	require.NotNil(t, contact)
	require.Equal(t, contactID, contact.ContactID)
	require.Equal(t, "Priya Client", contact.Name)

	clusters, err := repo.ListClusters(ctx, workspaceID, &galleryID)
	require.NoError(t, err)
	require.Len(t, clusters, 1)
	require.NotNil(t, clusters[0].LinkedContact)
	require.Equal(t, contactID, clusters[0].LinkedContact.ContactID)

	require.NoError(t, repo.UnlinkClusterContact(ctx, workspaceID, clusterLabel))
	contact, err = repo.GetClusterContact(ctx, workspaceID, clusterLabel)
	require.NoError(t, err)
	require.Nil(t, contact)

	_, err = repo.LinkClusterContact(ctx, workspaceID, clusterLabel, uuid.New(), &galleryID)
	require.ErrorIs(t, err, ErrContactNotFound)
}

func TestFaceService_MergeClusters_ValidatesAndPersistsAliases(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	repo := NewFaceRepo(pool)
	service := NewFaceService(repo, nil, nil)

	workspaceID, galleryID := seedFaceIdentityWorkspace(t, ctx, pool)
	assetA := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "guest-a.jpg")
	assetB := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "guest-b.jpg")
	assetC := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "guest-c.jpg")
	labelA := uuid.New()
	labelB := uuid.New()
	labelC := uuid.New()
	seedFaceIdentityFace(t, ctx, repo, workspaceID, assetA, &galleryID, labelA, "Guest A", 0)
	seedFaceIdentityFace(t, ctx, repo, workspaceID, assetB, &galleryID, labelB, "Guest B", 0)
	seedFaceIdentityFace(t, ctx, repo, workspaceID, assetC, &galleryID, labelC, "Guest C", 0)

	_, err := service.MergeClusters(ctx, workspaceID, labelA, uuid.New())
	require.ErrorIs(t, err, ErrClusterNotFound)

	merged, err := service.MergeClusters(ctx, workspaceID, labelA, labelB)
	require.NoError(t, err)
	require.Equal(t, 1, merged)

	resolved, err := repo.ResolveClusterLabel(ctx, workspaceID, labelA)
	require.NoError(t, err)
	require.Equal(t, labelB, resolved)

	faces, err := repo.ListClusterFaces(ctx, workspaceID, labelB, &galleryID)
	require.NoError(t, err)
	require.Len(t, faces, 2)
	for _, face := range faces {
		require.Equal(t, labelB, *face.ClusterLabel)
		require.Equal(t, "Guest B", face.ClusterName)
	}

	aliasAsset := seedFaceIdentityAsset(t, ctx, pool, workspaceID, galleryID, "guest-stale-alias.jpg")
	seedFaceIdentityFace(t, ctx, repo, workspaceID, aliasAsset, &galleryID, labelA, "Stale Alias", 1)
	ids, err := repo.ListClusterAssetIDsInGallery(ctx, workspaceID, galleryID, labelB)
	require.NoError(t, err)
	require.Contains(t, ids, aliasAsset)
	faces, err = repo.ListClusterFaces(ctx, workspaceID, labelA, &galleryID)
	require.NoError(t, err)
	require.Len(t, faces, 3, "old alias IDs should resolve to canonical face rows plus stale alias-labeled rows")
	summaries, err := repo.ListClusters(ctx, workspaceID, &galleryID)
	require.NoError(t, err)
	require.Len(t, summaries, 2, "alias-labeled rows must fold into the canonical person summary")
	var canonicalSummary *ClusterSummary
	for _, summary := range summaries {
		require.NotEqual(t, labelA, summary.ClusterLabel)
		if summary.ClusterLabel == labelB {
			canonicalSummary = summary
		}
	}
	require.NotNil(t, canonicalSummary)
	require.Equal(t, 3, canonicalSummary.FaceCount)

	merged, err = service.MergeClusters(ctx, workspaceID, labelC, labelA)
	require.NoError(t, err, "alias targets should resolve to the canonical person")
	require.Equal(t, 1, merged)

	resolved, err = repo.ResolveClusterLabel(ctx, workspaceID, labelC)
	require.NoError(t, err)
	require.Equal(t, labelB, resolved)

	require.NoError(t, service.NameCluster(ctx, workspaceID, labelA, "VIP Guest"))
	faces, err = repo.ListClusterFaces(ctx, workspaceID, labelB, &galleryID)
	require.NoError(t, err)
	require.NotEmpty(t, faces)
	for _, face := range faces {
		require.Equal(t, "VIP Guest", face.ClusterName)
	}

	err = service.NameCluster(ctx, workspaceID, uuid.New(), "Missing Guest")
	require.ErrorIs(t, err, ErrClusterNotFound)

	_, err = service.MergeClusters(ctx, workspaceID, labelA, labelB)
	require.True(t, errors.Is(err, ErrSameCluster), "source aliases should resolve before merge")
}

func seedFaceIdentityWorkspace(t *testing.T, ctx context.Context, pool *pgxpool.Pool) (uuid.UUID, uuid.UUID) {
	t.Helper()
	workspaceID := uuid.New()
	galleryID := uuid.New()
	suffix := workspaceID.String()[:8]
	_, err := pool.Exec(ctx, `
		INSERT INTO workspaces (id, name, face_recognition_enabled)
		VALUES ($1, $2, true)
	`, workspaceID, "Face Identity "+suffix)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO galleries (id, workspace_id, title, slug, face_detection_enabled)
		VALUES ($1, $2, $3, $4, true)
	`, galleryID, workspaceID, "Face Identity Gallery "+suffix, "face-identity-"+suffix)
	require.NoError(t, err)
	return workspaceID, galleryID
}

func seedFaceIdentityAsset(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID, galleryID uuid.UUID, filename string) uuid.UUID {
	t.Helper()
	assetID := uuid.New()
	_, err := pool.Exec(ctx, `
		INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key, status)
		VALUES ($1, $2, $3, 'image/jpeg', 100, $4, 'ready')
	`, assetID, workspaceID, filename, fmt.Sprintf("%s/%s/original.jpg", workspaceID, assetID))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO gallery_assets (gallery_id, asset_id, sort_order)
		VALUES ($1, $2, 0)
	`, galleryID, assetID)
	require.NoError(t, err)
	return assetID
}

func seedFaceIdentityContact(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID, name string) uuid.UUID {
	t.Helper()
	contactID := uuid.New()
	_, err := pool.Exec(ctx, `
		INSERT INTO contacts (id, workspace_id, name, email, phone, contact_type)
		VALUES ($1, $2, $3, $4, $5, 'client')
	`, contactID, workspaceID, name, "client@example.test", "+910000000000")
	require.NoError(t, err)
	return contactID
}

func seedFaceIdentityFace(t *testing.T, ctx context.Context, repo *FaceRepo, workspaceID, assetID uuid.UUID, galleryID *uuid.UUID, clusterLabel uuid.UUID, clusterName string, faceIndex int) {
	t.Helper()
	label := clusterLabel
	err := repo.StoreFaces(ctx, []*FaceCluster{{
		WorkspaceID:  workspaceID,
		AssetID:      assetID,
		GalleryID:    galleryID,
		FaceIndex:    faceIndex,
		BoundingBox:  BoundingBox{X: 0.1, Y: 0.2, W: 0.3, H: 0.4},
		Embedding:    faceIdentityEmbedding(float32(faceIndex + 1)),
		ClusterLabel: &label,
		ClusterName:  clusterName,
		Confidence:   0.95,
		Source:       "client",
	}})
	require.NoError(t, err)
}

func faceIdentityEmbedding(seed float32) []float32 {
	embedding := make([]float32, 512)
	embedding[0] = seed
	embedding[1] = 1
	return embedding
}
