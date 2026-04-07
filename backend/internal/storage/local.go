package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// LocalDriver implements Provider using the local filesystem.
type LocalDriver struct {
	baseDir string
}

// NewLocalDriver creates a new LocalDriver rooted at baseDir.
func NewLocalDriver(baseDir string) *LocalDriver {
	return &LocalDriver{baseDir: baseDir}
}

// Put writes the body to a file at key under the base directory.
func (d *LocalDriver) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	fullPath := filepath.Join(d.baseDir, key)

	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("local storage: mkdir %s: %w", dir, err)
	}

	f, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("local storage: create %s: %w", fullPath, err)
	}
	defer f.Close()

	if _, err := io.Copy(f, body); err != nil {
		return fmt.Errorf("local storage: write %s: %w", fullPath, err)
	}
	return nil
}

// Get opens the file at key and returns a ReadCloser.
func (d *LocalDriver) Get(_ context.Context, key string) (io.ReadCloser, error) {
	fullPath := filepath.Join(d.baseDir, key)

	f, err := os.Open(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("local storage: not found: %s", key)
		}
		return nil, fmt.Errorf("local storage: open %s: %w", fullPath, err)
	}
	return f, nil
}

// Delete removes the file at key.
func (d *LocalDriver) Delete(_ context.Context, key string) error {
	fullPath := filepath.Join(d.baseDir, key)

	if err := os.Remove(fullPath); err != nil {
		if os.IsNotExist(err) {
			return nil // idempotent delete
		}
		return fmt.Errorf("local storage: delete %s: %w", fullPath, err)
	}
	return nil
}

// PresignURL returns the local file path as a URL (for dev use only).
func (d *LocalDriver) PresignURL(_ context.Context, key string, _ PresignOptions) (string, error) {
	fullPath := filepath.Join(d.baseDir, key)
	return "file://" + filepath.ToSlash(fullPath), nil
}

// HealthCheck returns the health status of the local driver.
func (d *LocalDriver) HealthCheck() HealthStatus {
	info, err := os.Stat(d.baseDir)
	if err != nil {
		return HealthStatus{
			Status:  "unhealthy",
			Driver:  "local",
			Message: fmt.Sprintf("base dir check failed: %v", err),
		}
	}
	if !info.IsDir() {
		return HealthStatus{
			Status:  "unhealthy",
			Driver:  "local",
			Message: fmt.Sprintf("%s is not a directory", d.baseDir),
		}
	}
	return HealthStatus{
		Status:  "ok",
		Driver:  "local",
		Message: fmt.Sprintf("base dir: %s", d.baseDir),
	}
}
