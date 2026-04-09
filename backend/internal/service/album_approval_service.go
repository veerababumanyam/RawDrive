package service

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// AlbumApprovalService handles immutable album approval records.
type AlbumApprovalService struct {
	approvalRepo *repository.AlbumApprovalRepo
}

// NewAlbumApprovalService creates a new AlbumApprovalService.
func NewAlbumApprovalService(ar *repository.AlbumApprovalRepo) *AlbumApprovalService {
	return &AlbumApprovalService{approvalRepo: ar}
}

// SubmitApprovalInput holds parameters for creating an album approval.
type SubmitApprovalInput struct {
	GalleryID       uuid.UUID
	SessionID       *uuid.UUID
	ApprovedByName  string
	ApprovedByEmail string
	ApprovedByUserID *uuid.UUID
	ConfigSnapshot  map[string]any
	IPAddress       string
	UserAgent       string
	Notes           string
}

// SubmitApproval creates an immutable album approval record with a version hash.
func (s *AlbumApprovalService) SubmitApproval(ctx context.Context, input SubmitApprovalInput) (*repository.AlbumApproval, error) {
	if input.ApprovedByName == "" || input.ApprovedByEmail == "" {
		return nil, fmt.Errorf("approver name and email are required")
	}

	// Serialize config snapshot to JSON
	configJSON, err := json.Marshal(input.ConfigSnapshot)
	if err != nil {
		return nil, fmt.Errorf("album approval: marshal config: %w", err)
	}

	// Compute SHA-256 hash of the config snapshot
	hash := sha256.Sum256(configJSON)
	versionHash := fmt.Sprintf("%x", hash)

	approval := &repository.AlbumApproval{
		GalleryID:        input.GalleryID,
		SessionID:        input.SessionID,
		ApprovedByName:   input.ApprovedByName,
		ApprovedByEmail:  input.ApprovedByEmail,
		ApprovedByUserID: input.ApprovedByUserID,
		VersionHash:      versionHash,
		ConfigSnapshot:   configJSON,
		IPAddress:        input.IPAddress,
		UserAgent:        input.UserAgent,
		Notes:            input.Notes,
	}

	if err := s.approvalRepo.Create(ctx, approval); err != nil {
		return nil, fmt.Errorf("album approval: create: %w", err)
	}
	return approval, nil
}

// GetApproval returns an album approval by ID.
func (s *AlbumApprovalService) GetApproval(ctx context.Context, id uuid.UUID) (*repository.AlbumApproval, error) {
	return s.approvalRepo.GetByID(ctx, id)
}

// ListApprovals returns all approval records for a gallery.
func (s *AlbumApprovalService) ListApprovals(ctx context.Context, galleryID uuid.UUID) ([]repository.AlbumApproval, error) {
	return s.approvalRepo.ListByGallery(ctx, galleryID)
}
