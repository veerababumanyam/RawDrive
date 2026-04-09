package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// ProofingCommentService handles threaded comments with region pins.
type ProofingCommentService struct {
	commentRepo *repository.ProofingCommentRepo
}

// NewProofingCommentService creates a new ProofingCommentService.
func NewProofingCommentService(cr *repository.ProofingCommentRepo) *ProofingCommentService {
	return &ProofingCommentService{commentRepo: cr}
}

// CreateCommentInput holds parameters for creating a comment.
type CreateCommentInput struct {
	GalleryID    uuid.UUID
	AssetID      uuid.UUID
	ParentID     *uuid.UUID
	AuthorName   string
	AuthorEmail  string
	AuthorUserID *uuid.UUID
	Body         string
	PinX         *float64
	PinY         *float64
}

// CreateComment creates a new comment with optional pin coordinates.
func (s *ProofingCommentService) CreateComment(ctx context.Context, input CreateCommentInput) (*repository.ProofingComment, error) {
	if input.Body == "" {
		return nil, fmt.Errorf("comment body is required")
	}
	if input.AuthorName == "" {
		return nil, fmt.Errorf("author name is required")
	}

	// Validate pin coordinates are within 0-100 range (percentage)
	if input.PinX != nil && (*input.PinX < 0 || *input.PinX > 100) {
		return nil, fmt.Errorf("pin_x must be between 0 and 100")
	}
	if input.PinY != nil && (*input.PinY < 0 || *input.PinY > 100) {
		return nil, fmt.Errorf("pin_y must be between 0 and 100")
	}

	comment := &repository.ProofingComment{
		GalleryID:    input.GalleryID,
		AssetID:      input.AssetID,
		ParentID:     input.ParentID,
		AuthorName:   input.AuthorName,
		AuthorEmail:  input.AuthorEmail,
		AuthorUserID: input.AuthorUserID,
		Body:         input.Body,
		PinX:         input.PinX,
		PinY:         input.PinY,
	}

	if err := s.commentRepo.Create(ctx, comment); err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}
	return comment, nil
}

// GetCommentsByAsset returns all top-level comments for an asset.
func (s *ProofingCommentService) GetCommentsByAsset(ctx context.Context, galleryID, assetID uuid.UUID) ([]repository.ProofingComment, error) {
	return s.commentRepo.GetByAsset(ctx, galleryID, assetID)
}

// GetThread returns all replies to a comment.
func (s *ProofingCommentService) GetThread(ctx context.Context, parentID uuid.UUID) ([]repository.ProofingComment, error) {
	return s.commentRepo.GetThread(ctx, parentID)
}

// UpdateComment updates a comment's body.
func (s *ProofingCommentService) UpdateComment(ctx context.Context, id uuid.UUID, body string) error {
	if body == "" {
		return fmt.Errorf("comment body is required")
	}
	return s.commentRepo.Update(ctx, id, body)
}

// ResolveComment marks a comment as resolved.
func (s *ProofingCommentService) ResolveComment(ctx context.Context, id uuid.UUID) error {
	return s.commentRepo.Resolve(ctx, id)
}

// DeleteComment deletes a comment.
func (s *ProofingCommentService) DeleteComment(ctx context.Context, id uuid.UUID) error {
	return s.commentRepo.Delete(ctx, id)
}
