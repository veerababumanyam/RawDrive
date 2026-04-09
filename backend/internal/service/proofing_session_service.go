package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// ProofingSessionService handles named selection lists and ratings.
type ProofingSessionService struct {
	sessionRepo  *repository.ProofingSessionRepo
	proofingRepo *repository.ProofingRepo
}

// NewProofingSessionService creates a new ProofingSessionService.
func NewProofingSessionService(sr *repository.ProofingSessionRepo, pr *repository.ProofingRepo) *ProofingSessionService {
	return &ProofingSessionService{sessionRepo: sr, proofingRepo: pr}
}

// CreateSessionInput holds parameters for creating a proofing session.
type CreateSessionInput struct {
	GalleryID      uuid.UUID
	Name           string
	Description    string
	SessionType    string
	CreatedByName  string
	CreatedByEmail string
}

// CreateSession creates a named selection list.
func (s *ProofingSessionService) CreateSession(ctx context.Context, input CreateSessionInput) (*repository.ProofingSession, error) {
	if input.Name == "" {
		return nil, fmt.Errorf("session name is required")
	}
	if input.SessionType == "" {
		input.SessionType = "custom"
	}

	session := &repository.ProofingSession{
		GalleryID:      input.GalleryID,
		Name:           input.Name,
		Description:    input.Description,
		SessionType:    input.SessionType,
		CreatedByName:  input.CreatedByName,
		CreatedByEmail: input.CreatedByEmail,
	}

	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	return session, nil
}

// GetSession returns a proofing session by ID.
func (s *ProofingSessionService) GetSession(ctx context.Context, id uuid.UUID) (*repository.ProofingSession, error) {
	return s.sessionRepo.GetByID(ctx, id)
}

// ListSessions returns all proofing sessions for a gallery.
func (s *ProofingSessionService) ListSessions(ctx context.Context, galleryID uuid.UUID) ([]repository.ProofingSession, error) {
	return s.sessionRepo.ListByGallery(ctx, galleryID)
}

// UpdateSession updates a session's name and description.
func (s *ProofingSessionService) UpdateSession(ctx context.Context, id uuid.UUID, name, description string) error {
	if name == "" {
		return fmt.Errorf("session name is required")
	}
	return s.sessionRepo.Update(ctx, id, name, description)
}

// DeleteSession deletes a proofing session.
func (s *ProofingSessionService) DeleteSession(ctx context.Context, id uuid.UUID) error {
	return s.sessionRepo.Delete(ctx, id)
}

// AddToSession adds an asset to a proofing session by updating the selection's session_id.
func (s *ProofingSessionService) AddToSession(ctx context.Context, sessionID, selectionID uuid.UUID) error {
	return s.proofingRepo.UpdateSessionID(ctx, selectionID, &sessionID)
}

// RemoveFromSession removes an asset from a proofing session.
func (s *ProofingSessionService) RemoveFromSession(ctx context.Context, selectionID uuid.UUID) error {
	return s.proofingRepo.UpdateSessionID(ctx, selectionID, nil)
}

// SetStarRating updates a selection's star rating (1-5).
func (s *ProofingSessionService) SetStarRating(ctx context.Context, selectionID uuid.UUID, rating int) error {
	if rating < 1 || rating > 5 {
		return fmt.Errorf("star rating must be between 1 and 5, got %d", rating)
	}
	return s.proofingRepo.UpdateStarRating(ctx, selectionID, rating)
}

// SetColorLabel updates a selection's color label.
func (s *ProofingSessionService) SetColorLabel(ctx context.Context, selectionID uuid.UUID, label string) error {
	validLabels := map[string]bool{
		"red": true, "orange": true, "yellow": true, "green": true, "blue": true, "purple": true, "none": true,
	}
	if !validLabels[label] {
		return fmt.Errorf("invalid color label: %s", label)
	}
	return s.proofingRepo.UpdateColorLabel(ctx, selectionID, label)
}

// CreateDefaultSessions creates the system default selection lists for a gallery.
func (s *ProofingSessionService) CreateDefaultSessions(ctx context.Context, galleryID uuid.UUID) error {
	defaults := []struct {
		name        string
		sessionType string
	}{
		{"Favorites", "favorites"},
		{"Approved", "approved"},
		{"Rejected", "rejected"},
	}

	for _, d := range defaults {
		session := &repository.ProofingSession{
			GalleryID:   galleryID,
			Name:        d.name,
			SessionType: d.sessionType,
			IsSystem:    true,
		}
		if err := s.sessionRepo.Create(ctx, session); err != nil {
			return fmt.Errorf("create default session %s: %w", d.name, err)
		}
	}
	return nil
}
