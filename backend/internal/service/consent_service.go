package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// ConsentService handles privacy consent management.
type ConsentService struct {
	consentRepo *repository.ConsentRepo
}

// NewConsentService creates a new ConsentService.
func NewConsentService(cr *repository.ConsentRepo) *ConsentService {
	return &ConsentService{consentRepo: cr}
}

// RecordConsent records a consent decision.
func (s *ConsentService) RecordConsent(ctx context.Context, galleryID *uuid.UUID, email, ip, consentType, language string, granted bool) error {
	validTypes := map[string]bool{
		"terms": true, "notifications": true, "biometric": true, "analytics": true,
	}
	if !validTypes[consentType] {
		return fmt.Errorf("invalid consent type: %s", consentType)
	}

	record := &repository.ConsentRecord{
		GalleryID:    galleryID,
		VisitorEmail: email,
		VisitorIP:    ip,
		ConsentType:  consentType,
		Granted:      granted,
		Language:     language,
	}
	return s.consentRepo.Create(ctx, record)
}

// WithdrawConsent withdraws a specific consent type.
func (s *ConsentService) WithdrawConsent(ctx context.Context, email, consentType string) error {
	return s.consentRepo.Withdraw(ctx, email, consentType)
}

// GetConsentStatus returns all consent records for a visitor.
func (s *ConsentService) GetConsentStatus(ctx context.Context, email string) ([]repository.ConsentRecord, error) {
	return s.consentRepo.ListByEmail(ctx, email)
}
