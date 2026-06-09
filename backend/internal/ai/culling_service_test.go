package ai

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCullingService_AnalyzeGalleryScopesGalleryToWorkspace(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	wsID, galleryID := seedFaceIdentityWorkspace(t, ctx, pool)
	_ = seedFaceIdentityAsset(t, ctx, pool, wsID, galleryID, "cull-me.jpg")
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM ai_jobs WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM gallery_assets WHERE gallery_id = $1`, galleryID)
		_, _ = pool.Exec(c, `DELETE FROM quality_scores WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE id = $1`, galleryID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
	})

	svc := NewCullingService(pool, nil, nil, nil, NewJobRepo(pool), nil)
	job, err := svc.AnalyzeGallery(ctx, wsID, galleryID, 20)
	require.NoError(t, err)
	require.Equal(t, "culling", job.Type)
	require.Equal(t, "pending", job.Status)
	require.Equal(t, 1, job.TotalItems)
	require.Equal(t, galleryID.String(), job.Result["gallery_id"])
	require.Equal(t, 20, job.Result["top_percent"])

	_, err = svc.AnalyzeGallery(ctx, uuid.New(), galleryID, 20)
	require.ErrorIs(t, err, ErrGalleryNotFound)
}

func TestCullingService_AnalyzeGalleryRejectsInvalidTopPercent(t *testing.T) {
	svc := NewCullingService(nil, nil, nil, nil, nil, nil)
	_, err := svc.AnalyzeGallery(context.Background(), uuid.New(), uuid.New(), 0)
	require.Error(t, err)
	require.False(t, errors.Is(err, ErrGalleryNotFound))
}
