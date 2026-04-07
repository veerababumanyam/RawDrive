package storage

import (
	"context"
	"fmt"
	"io"
)

// S3Client is the interface for S3-compatible operations. It is used by S3Driver
// and can be mocked in tests.
type S3Client interface {
	PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
	GetObject(ctx context.Context, key string) (io.ReadCloser, error)
	DeleteObject(ctx context.Context, key string) error
	PresignGetObject(ctx context.Context, key string, expiresInSeconds int64) (string, error)
}

// S3Driver implements Provider using an S3-compatible backend.
type S3Driver struct {
	client S3Client
	bucket string
}

// NewS3Driver creates a new S3Driver from config.
func NewS3Driver(cfg Config) (*S3Driver, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	client, err := newAWSS3Client(cfg)
	if err != nil {
		return nil, fmt.Errorf("s3 storage: init client: %w", err)
	}
	return &S3Driver{client: client, bucket: cfg.Bucket}, nil
}

// NewS3DriverWithClient creates an S3Driver with a caller-supplied S3Client (for testing).
func NewS3DriverWithClient(client S3Client, bucket string) *S3Driver {
	return &S3Driver{client: client, bucket: bucket}
}

func (d *S3Driver) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	return d.client.PutObject(ctx, key, body, size, contentType)
}

func (d *S3Driver) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	return d.client.GetObject(ctx, key)
}

func (d *S3Driver) Delete(ctx context.Context, key string) error {
	return d.client.DeleteObject(ctx, key)
}

func (d *S3Driver) PresignURL(ctx context.Context, key string, opts PresignOptions) (string, error) {
	expires := opts.ExpiresInSeconds
	if expires <= 0 {
		expires = 3600
	}
	return d.client.PresignGetObject(ctx, key, expires)
}

func (d *S3Driver) HealthCheck() HealthStatus {
	return HealthStatus{
		Status:  "ok",
		Driver:  "s3",
		Message: fmt.Sprintf("bucket: %s", d.bucket),
	}
}
