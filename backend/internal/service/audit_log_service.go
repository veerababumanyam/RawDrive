package service

import (
	"context"
	"log"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type AuditLogService struct {
	auditRepo *repository.AuditLogRepo
}

func NewAuditLogService(auditRepo *repository.AuditLogRepo) *AuditLogService {
	return &AuditLogService{auditRepo: auditRepo}
}

func (s *AuditLogService) RecordAction(ctx context.Context, entry repository.AuditLogCreate) {
	go func() {
		bgCtx := context.Background()
		for attempt := 0; attempt < 3; attempt++ {
			if attempt > 0 {
				time.Sleep(time.Duration(float64(100)*math.Pow(2, float64(attempt-1))) * time.Millisecond)
			}
			if _, err := s.auditRepo.Create(bgCtx, entry); err != nil {
				log.Printf("audit log write attempt %d/3 failed: %v", attempt+1, err)
				continue
			}
			return
		}
		log.Printf("AUDIT LOG WRITE FAILED after 3 attempts for action=%s", entry.Action)
	}()
}

func (s *AuditLogService) ListLogs(ctx context.Context, filter repository.AuditLogFilter) (*repository.PaginatedResult[repository.AuditLogEntry], error) {
	return s.auditRepo.List(ctx, filter)
}

func (s *AuditLogService) GetLogDetail(ctx context.Context, id uuid.UUID) (*repository.AuditLogEntry, error) {
	return s.auditRepo.GetByID(ctx, id)
}
