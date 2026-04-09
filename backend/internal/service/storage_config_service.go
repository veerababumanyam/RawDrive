package service

import (
	"bytes"
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/storage"
)

type StorageConfigService struct {
	pool *pgxpool.Pool
}

func NewStorageConfigService(pool *pgxpool.Pool) *StorageConfigService {
	return &StorageConfigService{pool: pool}
}

func (s *StorageConfigService) GetWorkspacePlanTier(ctx context.Context, wsID uuid.UUID) (string, error) {
	var tier string
	err := s.pool.QueryRow(ctx, `SELECT COALESCE(plan_tier, 'standard') FROM workspaces WHERE id = $1`, wsID).Scan(&tier)
	if err != nil {
		return "standard", fmt.Errorf("get plan tier: %w", err)
	}
	return tier, nil
}

func (s *StorageConfigService) TestConnection(ctx context.Context, cfg storage.Config) error {
	provider, err := storage.NewProvider(cfg)
	if err != nil {
		return fmt.Errorf("storage config test: %w", err)
	}
	testKey := ".cobolt-test-connection"
	testData := []byte("connection-test")
	if err := provider.Put(ctx, testKey, bytes.NewReader(testData), int64(len(testData)), "text/plain"); err != nil {
		return fmt.Errorf("storage config test write: %w", err)
	}
	reader, err := provider.Get(ctx, testKey)
	if err != nil {
		return fmt.Errorf("storage config test read: %w", err)
	}
	reader.Close()
	if err := provider.Delete(ctx, testKey); err != nil {
		return fmt.Errorf("storage config test delete: %w", err)
	}
	return nil
}
