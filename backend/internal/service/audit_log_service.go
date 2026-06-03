package service

import (
	"context"
	"log/slog"
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

type AuditLogService struct {
	auditRepo *repository.AuditLogRepo
	logger    *slog.Logger
}

func NewAuditLogService(auditRepo *repository.AuditLogRepo) *AuditLogService {
	return &AuditLogService{auditRepo: auditRepo, logger: slog.Default()}
}

func (s *AuditLogService) RecordAction(ctx context.Context, entry repository.AuditLogCreate) {
	go func() {
		bgCtx := context.Background()
		for attempt := 0; attempt < 3; attempt++ {
			if attempt > 0 {
				time.Sleep(time.Duration(float64(100)*math.Pow(2, float64(attempt-1))) * time.Millisecond)
			}
			if _, err := s.auditRepo.Create(bgCtx, entry); err != nil {
				s.logger.Warn("audit.insert_failed",
					slog.String("action", entry.Action),
					slog.Int("attempt", attempt+1),
					slog.Any("error", err),
				)
				continue
			}
			return
		}
		s.logger.Error("audit.insert_exhausted",
			slog.String("action", entry.Action),
			slog.Int("max_attempts", 3),
		)
	}()
}

func (s *AuditLogService) ListLogs(ctx context.Context, filter repository.AuditLogFilter) (*repository.PaginatedResult[repository.AuditLogEntry], error) {
	return s.auditRepo.List(ctx, filter)
}

func (s *AuditLogService) GetLogDetail(ctx context.Context, id uuid.UUID) (*repository.AuditLogEntry, error) {
	return s.auditRepo.GetByID(ctx, id)
}
