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
	// Optional photographer notification sink (GAL-FR-134). When nil, the
	// service logs the event but does not persist a notification row.
	notifRepo *repository.NotificationRepo
}

// NewProofingService creates a new ProofingService.
func NewProofingService(pr *repository.ProofingRepo, gr *repository.GalleryRepo) *ProofingService {
	return &ProofingService{proofingRepo: pr, galleryRepo: gr}
}

// WithNotifications attaches a notification repo so proofing events trigger
// photographer notifications (GAL-FR-134). Returns the receiver for chaining.
func (s *ProofingService) WithNotifications(nr *repository.NotificationRepo) *ProofingService {
	s.notifRepo = nr
	return s
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

	// GAL-FR-134: notify the photographer (gallery owner) of client proofing
	// activity. We write a single aggregated in-app notification — one per
	// submission batch, not one per asset — so the photographer isn't spammed
	// when a client picks 50 photos at once. Failures here are non-fatal:
	// the selections are already committed and the notification is a
	// side-effect the client need not wait for.
	s.notifyPhotographerOfSubmission(ctx, gallery, input)

	return nil
}

// notifyPhotographerOfSubmission writes an in-app notification to the gallery
// owner when a client submits proofing selections. The notification points to
// the gallery's proofing dashboard via action_url so the photographer can
// jump straight into reviewing the picks.
func (s *ProofingService) notifyPhotographerOfSubmission(ctx context.Context, gallery *repository.Gallery, input SubmitSelectionInput) {
	if s.notifRepo == nil || gallery == nil || gallery.CreatedBy == nil {
		return
	}
	actionURL := fmt.Sprintf("/galleries/%s/proofing", gallery.ID.String())
	body := fmt.Sprintf("%s (%s) selected %d photo(s) in \"%s\"",
		input.ClientName, input.ClientEmail, len(input.AssetIDs), gallery.Title)
	wsID := gallery.WorkspaceID
	notif := &repository.Notification{
		UserID:           *gallery.CreatedBy,
		WorkspaceID:      &wsID,
		NotificationType: "proofing.client_submission",
		Title:            "New proofing selections",
		Body:             &body,
		ActionURL:        &actionURL,
		Channel:          "in_app",
	}
	_ = s.notifRepo.Create(ctx, notif) // non-fatal
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
