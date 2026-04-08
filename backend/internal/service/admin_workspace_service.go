package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type AdminWorkspaceService struct {
	workspaceRepo *repository.AdminWorkspaceRepo
}

func NewAdminWorkspaceService(workspaceRepo *repository.AdminWorkspaceRepo) *AdminWorkspaceService {
	return &AdminWorkspaceService{workspaceRepo: workspaceRepo}
}

func (s *AdminWorkspaceService) ListWorkspaces(ctx context.Context, filter repository.AdminWorkspaceFilter) (*repository.PaginatedResult[repository.AdminWorkspaceRow], error) {
	return s.workspaceRepo.List(ctx, filter)
}

func (s *AdminWorkspaceService) GetWorkspace(ctx context.Context, id uuid.UUID) (*repository.AdminWorkspaceDetail, error) {
	return s.workspaceRepo.GetByID(ctx, id)
}
