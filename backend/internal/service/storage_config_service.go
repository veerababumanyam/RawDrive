package service

import (
	"bytes"
	"context"
	"fmt"

	"github.com/rawdrive/backend/internal/storage"
)

// StorageConfigService handles BYOS configuration.
type StorageConfigService struct{}

// NewStorageConfigService creates a new StorageConfigService.
func NewStorageConfigService() *StorageConfigService {
	return &StorageConfigService{}
}

// TestConnection validates that the storage config can connect and perform basic operations.
func (s *StorageConfigService) TestConnection(ctx context.Context, cfg storage.Config) error {
	provider, err := storage.NewProvider(cfg)
	if err != nil {
		return fmt.Errorf("storage config test: %w", err)
	}

	testKey := ".cobolt-test-connection"
	testData := []byte("connection-test")

	// Test write
	if err := provider.Put(ctx, testKey, bytes.NewReader(testData), int64(len(testData)), "text/plain"); err != nil {
		return fmt.Errorf("storage config test write: %w", err)
	}

	// Test read
	reader, err := provider.Get(ctx, testKey)
	if err != nil {
		return fmt.Errorf("storage config test read: %w", err)
	}
	reader.Close()

	// Test delete
	if err := provider.Delete(ctx, testKey); err != nil {
		return fmt.Errorf("storage config test delete: %w", err)
	}

	return nil
}
