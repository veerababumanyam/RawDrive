package storage

import (
	"fmt"
	"strings"
)

// Config holds configuration for a storage provider.
type Config struct {
	Driver    string // "local" or "s3"
	LocalDir  string // base directory for local driver
	Bucket    string // S3 bucket name
	Region    string // AWS region
	Endpoint  string // custom S3-compatible endpoint (e.g. Backblaze B2)
	AccessKey string // AWS access key ID
	SecretKey string // AWS secret access key

	// SSEMode requests server-side encryption on PUT operations.
	// Accepted values:
	//   ""       — no SSE header sent (back-compat default; objects still
	//              live on B2's encrypted disks but not under SSE-B2 keys)
	//   "AES256" — SSE-B2 / SSE-S3 with AES-256, server-managed keys.
	//              B2's S3-compatible API translates this to native
	//              SSE-B2; AWS S3 reads it as SSE-S3.
	//   "aws:kms" — reserved for future SSE-KMS support on AWS S3 targets.
	// Source: STORAGE_SSE_MODE env var, set in .env.backend. Applied to
	// PutObject and CreateMultipartUpload; GetObject needs nothing because
	// the server decrypts transparently on read.
	SSEMode string
}

// Validate checks the config for required fields depending on the driver.
func (c Config) Validate() error {
	driver := strings.TrimSpace(c.Driver)
	if driver == "" {
		return fmt.Errorf("storage config: driver is required")
	}

	switch driver {
	case "local":
		if strings.TrimSpace(c.LocalDir) == "" {
			return fmt.Errorf("storage config: local_dir is required for local driver")
		}
	case "s3":
		if strings.TrimSpace(c.Bucket) == "" {
			return fmt.Errorf("storage config: bucket is required for s3 driver")
		}
		if strings.TrimSpace(c.Region) == "" {
			return fmt.Errorf("storage config: region is required for s3 driver")
		}
		if strings.TrimSpace(c.AccessKey) == "" {
			return fmt.Errorf("storage config: access_key is required for s3 driver")
		}
		if strings.TrimSpace(c.SecretKey) == "" {
			return fmt.Errorf("storage config: secret_key is required for s3 driver")
		}
	default:
		return fmt.Errorf("storage config: unsupported driver %q", driver)
	}

	return nil
}
