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
	//   ""        — no SSE header sent
	//   "AES256"  — SSE-B2 / SSE-S3 with AES-256, server-managed keys
	//   "aws:kms" — reserved for future SSE-KMS support on AWS S3 targets
	//   "SSE-C"   — customer-managed AES-256 key. We supply the key with
	//               every request; B2 stores ciphertext + MD5(key) only.
	//               Requires SSECustomerKeyHex.
	// Source: STORAGE_SSE_MODE env var. SSE-B2/SSE-S3 mode applies to PUTs
	// only (decrypt is transparent on GET). SSE-C mode also requires the
	// key on every GET/HEAD/Copy/MultipartUpload/UploadPart.
	SSEMode string

	// SSECustomerKeyHex is the 64-char hex representation of a 32-byte
	// (256-bit) AES key, required when SSEMode == "SSE-C". The same key
	// MUST accompany every request that reads or writes the object —
	// B2 stores only an MD5 hash of the key for verification, never the
	// key itself. Losing this key = losing all SSE-C-encrypted objects
	// permanently. Source: STORAGE_SSE_C_KEY env var (.env.backend on
	// dev, /opt/rawdrive/app/.env on prod).
	SSECustomerKeyHex string
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

// EncryptionEnabled reports whether writes through this config request
// provider-side object encryption headers.
func (c Config) EncryptionEnabled() bool {
	return strings.TrimSpace(c.SSEMode) != ""
}

// EncryptionAlgorithm returns the stable metadata value stored on assets and
// derivatives for audit/display. Empty means storage encryption is disabled.
func (c Config) EncryptionAlgorithm() string {
	switch strings.TrimSpace(c.SSEMode) {
	case "AES256":
		return "SSE-B2-AES256"
	case "aws:kms":
		return "SSE-KMS"
	case "SSE-C":
		return "SSE-C-AES256"
	default:
		return ""
	}
}
