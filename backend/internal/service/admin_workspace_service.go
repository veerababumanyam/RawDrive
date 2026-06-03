package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

var (
	ErrEmptySuspendReason = errors.New("suspend reason is required")
)

type AdminWorkspaceService struct {
	workspaceRepo *repository.AdminWorkspaceRepo
	auditLog      *AuditLogService
}

func NewAdminWorkspaceService(workspaceRepo *repository.AdminWorkspaceRepo) *AdminWorkspaceService {
	return &AdminWorkspaceService{workspaceRepo: workspaceRepo}
}

// WithAuditLog wires an audit log service so suspend/delete actions write to
// the immutable audit trail. Returns the receiver for fluent chaining.
func (s *AdminWorkspaceService) WithAuditLog(log *AuditLogService) *AdminWorkspaceService {
	s.auditLog = log
	return s
}

func (s *AdminWorkspaceService) ListWorkspaces(ctx context.Context, filter repository.AdminWorkspaceFilter) (*repository.PaginatedResult[repository.AdminWorkspaceRow], error) {
	return s.workspaceRepo.List(ctx, filter)
}

func (s *AdminWorkspaceService) GetWorkspace(ctx context.Context, id uuid.UUID) (*repository.AdminWorkspaceDetail, error) {
	return s.workspaceRepo.GetByID(ctx, id)
}

// SuspendWorkspace blocks access to a workspace (M7 E20-S3). Reason is
// required so audit logs have actionable context. Data is preserved.
func (s *AdminWorkspaceService) SuspendWorkspace(ctx context.Context, id uuid.UUID, reason string, actorID uuid.UUID) error {
	if reason == "" {
		return ErrEmptySuspendReason
	}
	if err := s.workspaceRepo.Suspend(ctx, id, reason, actorID); err != nil {
		return fmt.Errorf("suspend workspace: %w", err)
	}
	s.recordAudit(ctx, actorID, "workspace.suspend", id, map[string]any{"reason": reason})
	return nil
}

// UnsuspendWorkspace restores an active state for a suspended workspace.
func (s *AdminWorkspaceService) UnsuspendWorkspace(ctx context.Context, id, actorID uuid.UUID) error {
	if err := s.workspaceRepo.Unsuspend(ctx, id); err != nil {
		return fmt.Errorf("unsuspend workspace: %w", err)
	}
	s.recordAudit(ctx, actorID, "workspace.unsuspend", id, nil)
	return nil
}

// DeleteWorkspace soft-deletes a workspace. Hard purge is handled by the
// background purge worker after the retention window.
func (s *AdminWorkspaceService) DeleteWorkspace(ctx context.Context, id, actorID uuid.UUID) error {
	if err := s.workspaceRepo.SoftDelete(ctx, id, actorID); err != nil {
		return fmt.Errorf("delete workspace: %w", err)
	}
	s.recordAudit(ctx, actorID, "workspace.delete", id, nil)
	return nil
}

// recordAudit writes an audit entry if the service has an audit log wired.
// Non-fatal: audit failure never rolls back the primary action.
func (s *AdminWorkspaceService) recordAudit(ctx context.Context, actorID uuid.UUID, action string, resourceID uuid.UUID, meta map[string]any) {
	if s.auditLog == nil {
		return
	}
	var metaJSON json.RawMessage
	if meta != nil {
		if b, err := json.Marshal(meta); err == nil {
			metaJSON = b
		}
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID:      actorID,
		ActorType:    "admin",
		Action:       action,
		ResourceType: "workspace",
		ResourceID:   resourceID.String(),
		Metadata:     metaJSON,
		Severity:     "info",
	})
}
