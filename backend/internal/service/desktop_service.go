package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// DesktopService handles desktop companion app business logic.
type DesktopService struct {
	sessionRepo *repository.DesktopSessionRepo
}

// NewDesktopService creates a new DesktopService.
func NewDesktopService(sr *repository.DesktopSessionRepo) *DesktopService {
	return &DesktopService{sessionRepo: sr}
}

// RegisterSessionInput holds input for registering a desktop session.
type RegisterSessionInput struct {
	UserID      uuid.UUID `json:"user_id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	DeviceName  string    `json:"device_name"`
	OS          string    `json:"os"`
	AppVersion  string    `json:"app_version"`
}

// RegisterSession registers a new desktop app session.
func (s *DesktopService) RegisterSession(ctx context.Context, input RegisterSessionInput) (*repository.DesktopSession, error) {
	if input.DeviceName == "" {
		return nil, fmt.Errorf("device name is required")
	}
	if input.OS != "windows" && input.OS != "macos" && input.OS != "linux" {
		return nil, fmt.Errorf("unsupported OS: %s (must be windows, macos, or linux)", input.OS)
	}

	session := &repository.DesktopSession{
		UserID:      input.UserID,
		WorkspaceID: input.WorkspaceID,
		DeviceName:  input.DeviceName,
		OS:          input.OS,
		AppVersion:  input.AppVersion,
		UploadStats: `{"total_uploaded": 0, "total_bytes": 0}`,
	}

	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return nil, fmt.Errorf("register session: %w", err)
	}
	return session, nil
}

// GetSession retrieves a desktop session by ID.
func (s *DesktopService) GetSession(ctx context.Context, id uuid.UUID) (*repository.DesktopSession, error) {
	session, err := s.sessionRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	return &session, nil
}

// ListUserSessions lists active desktop sessions for a user.
func (s *DesktopService) ListUserSessions(ctx context.Context, userID uuid.UUID) ([]repository.DesktopSession, error) {
	return s.sessionRepo.ListByUser(ctx, userID)
}

// Heartbeat updates the session's last seen timestamp.
func (s *DesktopService) Heartbeat(ctx context.Context, id uuid.UUID, appVersion string) error {
	return s.sessionRepo.Heartbeat(ctx, id, appVersion)
}

// UpdateUploadStats updates the session's upload statistics.
func (s *DesktopService) UpdateUploadStats(ctx context.Context, id uuid.UUID, stats string) error {
	return s.sessionRepo.UpdateUploadStats(ctx, id, stats)
}

// DeactivateSession marks a desktop session as inactive.
func (s *DesktopService) DeactivateSession(ctx context.Context, id uuid.UUID) error {
	return s.sessionRepo.Deactivate(ctx, id)
}
