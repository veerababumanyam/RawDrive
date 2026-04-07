package storage

import (
	"context"
	"io"
)

// Provider is the storage abstraction interface. All storage backends
// (local filesystem, S3, Cloudflare R2) implement this interface.
type Provider interface {
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	PresignURL(ctx context.Context, key string, opts PresignOptions) (string, error)
	HealthCheck() HealthStatus
}

// PresignOptions controls presigned URL generation.
type PresignOptions struct {
	ExpiresInSeconds int64
}

// HealthStatus reports the health of a storage driver.
type HealthStatus struct {
	Status  string
	Driver  string
	Message string
}
