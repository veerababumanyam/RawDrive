package ai

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDetectImageAndStoreFaces_GalleryOptOutSkipsWithoutFaceClient(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	faceRepo := NewFaceRepo(pool)
	service := NewFaceService(faceRepo, nil, nil)

	workspaceID := uuid.New()
	galleryID := uuid.New()
	assetID := uuid.New()
	_, err := pool.Exec(ctx, `
		INSERT INTO workspaces (id, name, face_recognition_enabled)
		VALUES ($1, 'Face Gate Test', true)
	`, workspaceID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO galleries (id, workspace_id, title, slug, face_detection_enabled)
		VALUES ($1, $2, 'Face Gate Gallery', $3, false)
	`, galleryID, workspaceID, "face-gate-"+galleryID.String()[:8])
	require.NoError(t, err)

	stored, err := service.DetectImageAndStoreFaces(
		ctx,
		assetID,
		workspaceID,
		&galleryID,
		[]byte("WEBP"),
		"face-index.webp",
		"client",
	)

	require.NoError(t, err)
	require.Equal(t, 0, stored)
}
