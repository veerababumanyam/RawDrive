package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// ProofingService handles client proofing logic.
type ProofingService struct {
	proofingRepo *repository.ProofingRepo
	galleryRepo  *repository.GalleryRepo
}

// NewProofingService creates a new ProofingService.
func NewProofingService(pr *repository.ProofingRepo, gr *repository.GalleryRepo) *ProofingService {
	return &ProofingService{proofingRepo: pr, galleryRepo: gr}
}

// SubmitSelectionInput holds parameters for submitting a selection.
type SubmitSelectionInput struct {
	GalleryID   uuid.UUID
	AssetIDs    []uuid.UUID
	ClientName  string
	ClientEmail string
	Note        string
}

// SubmitSelections creates proofing selections for a client.
func (s *ProofingService) SubmitSelections(ctx context.Context, input SubmitSelectionInput) error {
	// Check max_selections limit
	gallery, err := s.galleryRepo.GetByID(ctx, input.GalleryID)
	if err != nil {
		return fmt.Errorf("proofing: get gallery: %w", err)
	}
	if gallery == nil {
		return fmt.Errorf("gallery not found")
	}

	if gallery.MaxSelections > 0 {
		currentCount, err := s.proofingRepo.CountByGalleryAndClient(ctx, input.GalleryID, input.ClientEmail)
		if err != nil {
			return fmt.Errorf("proofing: count: %w", err)
		}
		if currentCount+len(input.AssetIDs) > gallery.MaxSelections {
			return fmt.Errorf("selection limit exceeded: max %d, current %d, requested %d",
				gallery.MaxSelections, currentCount, len(input.AssetIDs))
		}
	}

	for _, assetID := range input.AssetIDs {
		ps := &repository.ProofingSelection{
			GalleryID:   input.GalleryID,
			AssetID:     assetID,
			ClientName:  input.ClientName,
			ClientEmail: input.ClientEmail,
			Status:      "selected",
			Note:        input.Note,
		}
		if err := s.proofingRepo.Create(ctx, ps); err != nil {
			return fmt.Errorf("proofing: create selection: %w", err)
		}
	}
	return nil
}

// ListByGallery returns all proofing selections for a gallery.
func (s *ProofingService) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]repository.ProofingSelection, error) {
	return s.proofingRepo.ListByGallery(ctx, galleryID)
}

// ListByClient returns selections for a client in a gallery.
func (s *ProofingService) ListByClient(ctx context.Context, galleryID uuid.UUID, email string) ([]repository.ProofingSelection, error) {
	return s.proofingRepo.ListByClient(ctx, galleryID, email)
}

// SubmitPublicBySlug resolves a gallery from its public slug and submits proofing selections.
func (s *ProofingService) SubmitPublicBySlug(ctx context.Context, slug string, assetIDs []string, clientName, clientEmail, note string) error {
	gallery, err := s.galleryRepo.GetBySlug(ctx, slug)
	if err != nil {
		return fmt.Errorf("proofing: resolve slug: %w", err)
	}
	if gallery == nil {
		return fmt.Errorf("gallery not found")
	}
	if !gallery.IsPublished {
		return fmt.Errorf("gallery is not published")
	}

	parsedIDs := make([]uuid.UUID, 0, len(assetIDs))
	for _, id := range assetIDs {
		parsed, err := uuid.Parse(id)
		if err != nil {
			return fmt.Errorf("invalid asset id: %s", id)
		}
		parsedIDs = append(parsedIDs, parsed)
	}

	return s.SubmitSelections(ctx, SubmitSelectionInput{
		GalleryID:   gallery.ID,
		AssetIDs:    parsedIDs,
		ClientName:  clientName,
		ClientEmail: clientEmail,
		Note:        note,
	})
}

// UpdateStatus changes a selection's status.
func (s *ProofingService) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	return s.proofingRepo.UpdateStatus(ctx, id, status)
}
