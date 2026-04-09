package service

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// VideoService handles video asset business logic.
type VideoService struct {
	videoRepo *repository.VideoRepo
}

// NewVideoService creates a new VideoService.
func NewVideoService(vr *repository.VideoRepo) *VideoService {
	return &VideoService{videoRepo: vr}
}

// CreateVideoInput holds input for creating a video asset entry.
type CreateVideoInput struct {
	AssetID       uuid.UUID `json:"asset_id"`
	WorkspaceID   uuid.UUID `json:"workspace_id"`
	FileSizeBytes *int64    `json:"file_size_bytes"`
	Codec         *string   `json:"codec"`
	Resolution    *string   `json:"resolution"`
}

// CreateVideoAsset creates a new video asset entry and queues it for transcoding.
func (s *VideoService) CreateVideoAsset(ctx context.Context, input CreateVideoInput) (*repository.VideoAsset, error) {
	va := &repository.VideoAsset{
		AssetID:       input.AssetID,
		WorkspaceID:   input.WorkspaceID,
		FileSizeBytes: input.FileSizeBytes,
		Codec:         input.Codec,
		Resolution:    input.Resolution,
		Qualities:     "[]",
		ThumbnailURLs: "[]",
	}

	if err := s.videoRepo.Create(ctx, va); err != nil {
		return nil, fmt.Errorf("create video asset: %w", err)
	}

	log.Printf("Video asset %s created for asset %s — queued for transcoding", va.ID, va.AssetID)
	return va, nil
}

// GetVideoAsset retrieves a video asset by ID.
func (s *VideoService) GetVideoAsset(ctx context.Context, id uuid.UUID) (*repository.VideoAsset, error) {
	v, err := s.videoRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("video asset not found: %w", err)
	}
	return &v, nil
}

// GetVideoByAssetID retrieves a video asset by its parent asset ID.
func (s *VideoService) GetVideoByAssetID(ctx context.Context, assetID uuid.UUID) (*repository.VideoAsset, error) {
	v, err := s.videoRepo.GetByAssetID(ctx, assetID)
	if err != nil {
		return nil, fmt.Errorf("video for asset not found: %w", err)
	}
	return &v, nil
}

// ListPendingTranscodes retrieves videos awaiting transcoding.
func (s *VideoService) ListPendingTranscodes(ctx context.Context, limit int) ([]repository.VideoAsset, error) {
	return s.videoRepo.ListPending(ctx, limit)
}

// ListWorkspaceVideos lists video assets for a workspace.
func (s *VideoService) ListWorkspaceVideos(ctx context.Context, workspaceID uuid.UUID, limit, offset int) ([]repository.VideoAsset, error) {
	return s.videoRepo.ListByWorkspace(ctx, workspaceID, limit, offset)
}

// MarkProcessing marks a video as being transcoded.
func (s *VideoService) MarkProcessing(ctx context.Context, id uuid.UUID) error {
	return s.videoRepo.UpdateStatus(ctx, id, "processing", nil)
}

// MarkReady marks a video as ready with transcoding results.
func (s *VideoService) MarkReady(ctx context.Context, id uuid.UUID, qualities, thumbnails string, cfUID, cfPlaybackURL *string, durationSecs *int, codec, resolution *string) error {
	return s.videoRepo.SetReady(ctx, id, qualities, thumbnails, cfUID, cfPlaybackURL, durationSecs, codec, resolution)
}

// MarkFailed marks a video transcoding as failed.
func (s *VideoService) MarkFailed(ctx context.Context, id uuid.UUID, errMsg string) error {
	return s.videoRepo.UpdateStatus(ctx, id, "failed", &errMsg)
}

// DeleteVideoAsset removes a video asset.
func (s *VideoService) DeleteVideoAsset(ctx context.Context, id uuid.UUID) error {
	return s.videoRepo.Delete(ctx, id)
}
