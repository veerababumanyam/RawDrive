package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type AdminModerationService struct {
	moderationRepo *repository.AdminModerationRepo
	auditLog       *AuditLogService
}

func NewAdminModerationService(moderationRepo *repository.AdminModerationRepo, auditLog *AuditLogService) *AdminModerationService {
	return &AdminModerationService{moderationRepo: moderationRepo, auditLog: auditLog}
}

func (s *AdminModerationService) GetQueue(ctx context.Context, filter repository.ModerationFilter) (*repository.PaginatedResult[repository.AdminModerationItem], error) {
	return s.moderationRepo.ListQueue(ctx, filter)
}

func (s *AdminModerationService) GetStats(ctx context.Context) (*repository.ModerationStats, error) {
	return s.moderationRepo.CountByStatus(ctx)
}

func (s *AdminModerationService) ApproveContent(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	if err := s.moderationRepo.UpdateStatus(ctx, id, "approved", "", actorID); err != nil {
		return fmt.Errorf("approving content: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "moderation.approve",
		ResourceType: "moderation_item", ResourceID: id.String(),
	})
	return nil
}

func (s *AdminModerationService) RejectContent(ctx context.Context, id uuid.UUID, reason string, actorID uuid.UUID) error {
	if err := s.moderationRepo.UpdateStatus(ctx, id, "rejected", reason, actorID); err != nil {
		return fmt.Errorf("rejecting content: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "moderation.reject",
		ResourceType: "moderation_item", ResourceID: id.String(),
	})
	return nil
}

func (s *AdminModerationService) EscalateContent(ctx context.Context, id uuid.UUID, notes string, actorID uuid.UUID) error {
	// Notes are persisted through the repo's existing review_note column via
	// the UpdateStatus reason parameter. Notes are optional — an empty string
	// is a valid escalation body.
	if err := s.moderationRepo.UpdateStatus(ctx, id, "escalated", notes, actorID); err != nil {
		return fmt.Errorf("escalating content: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "moderation.escalate",
		ResourceType: "moderation_item", ResourceID: id.String(),
	})
	return nil
}
