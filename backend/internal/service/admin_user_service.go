package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

var (
	ErrCannotSuspendSelf           = errors.New("cannot suspend your own account")
	ErrCannotSuspendSuperAdmin     = errors.New("cannot suspend a super_admin")
	ErrCannotImpersonateSuperAdmin = errors.New("cannot impersonate a super_admin")
	ErrInvalidRole                 = errors.New("invalid role")
	ErrUserNotFound                = errors.New("user not found")
)

type AdminUserService struct {
	userRepo  *repository.AdminUserRepo
	auditLog  *AuditLogService
	jwtSecret []byte
}

func NewAdminUserService(userRepo *repository.AdminUserRepo, auditLog *AuditLogService, jwtSecret []byte) *AdminUserService {
	return &AdminUserService{userRepo: userRepo, auditLog: auditLog, jwtSecret: jwtSecret}
}

func (s *AdminUserService) ListUsers(ctx context.Context, filter repository.AdminUserFilter) (*repository.PaginatedResult[repository.AdminUserRow], error) {
	return s.userRepo.List(ctx, filter)
}

func (s *AdminUserService) GetUser(ctx context.Context, id uuid.UUID) (*repository.AdminUserDetail, error) {
	return s.userRepo.GetByID(ctx, id)
}

func (s *AdminUserService) SuspendUser(ctx context.Context, id uuid.UUID, reason string, actorID uuid.UUID) error {
	if id == actorID {
		return ErrCannotSuspendSelf
	}
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("fetching user: %w", err)
	}
	if user == nil {
		return ErrUserNotFound
	}
	if user.Role == "super_admin" {
		return ErrCannotSuspendSuperAdmin
	}
	if err := s.userRepo.UpdateStatus(ctx, id, "suspended", reason, actorID); err != nil {
		return fmt.Errorf("suspending user: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.suspend",
		ResourceType: "user", ResourceID: id.String(),
	})
	return nil
}

func (s *AdminUserService) ReactivateUser(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	if err := s.userRepo.UpdateStatus(ctx, id, "active", "", actorID); err != nil {
		return fmt.Errorf("reactivating user: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.reactivate",
		ResourceType: "user", ResourceID: id.String(),
	})
	return nil
}

func (s *AdminUserService) ImpersonateUser(ctx context.Context, targetID uuid.UUID, adminID uuid.UUID) (string, error) {
	user, err := s.userRepo.GetByID(ctx, targetID)
	if err != nil {
		return "", fmt.Errorf("fetching target user: %w", err)
	}
	if user == nil {
		return "", ErrUserNotFound
	}
	if user.Role == "super_admin" {
		return "", ErrCannotImpersonateSuperAdmin
	}
	claims := jwt.MapClaims{
		"sub": targetID.String(), "impersonator": adminID.String(),
		"impersonation": true, "role": user.Role,
		"exp": time.Now().Add(1 * time.Hour).Unix(), "iat": time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return "", fmt.Errorf("signing impersonation token: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: adminID, ActorType: "admin", Action: "user.impersonate",
		ResourceType: "user", ResourceID: targetID.String(),
	})
	return signed, nil
}

func (s *AdminUserService) ChangeRole(ctx context.Context, id uuid.UUID, newRole string, actorID uuid.UUID) error {
	if id == actorID {
		return errors.New("cannot change your own role")
	}
	if err := s.userRepo.UpdateRole(ctx, id, newRole, actorID); err != nil {
		return fmt.Errorf("updating role: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.change_role",
		ResourceType: "user", ResourceID: id.String(),
	})
	return nil
}

func (s *AdminUserService) BulkSuspend(ctx context.Context, ids []uuid.UUID, reason string, actorID uuid.UUID) (int64, error) {
	filtered := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id != actorID {
			filtered = append(filtered, id)
		}
	}
	count, err := s.userRepo.BulkUpdateStatus(ctx, filtered, "suspended", reason, actorID)
	if err != nil {
		return 0, fmt.Errorf("bulk suspending: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.bulk_suspend",
		ResourceType: "user",
	})
	return count, nil
}
