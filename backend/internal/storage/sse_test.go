package storage

import (
	"strings"
	"testing"
)

// Verifies the STORAGE_SSE_MODE parsing in newAWSS3Client. Unknown values
// must fail fast at construction — silently dropping a typo would leave
// production objects unencrypted while the operator believed SSE was on.
// We can't run a real B2 round-trip in unit tests (no creds, no network),
// so this test exercises the validation gate only; the wire-level header
// presence is observable in production via STORAGE_SSE_MODE startup log
// and a B2 console object inspection.

func TestNewAWSS3Client_SSEModeValidation(t *testing.T) {
	base := Config{
		Driver:    "s3",
		Bucket:    "test-bucket",
		Region:    "us-east-005",
		Endpoint:  "https://s3.us-east-005.backblazeb2.com",
		AccessKey: "test-key-id",
		SecretKey: "test-secret",
	}

	tests := []struct {
		name      string
		sseMode   string
		wantError bool
		errSubstr string
	}{
		{"empty disables SSE", "", false, ""},
		{"AES256 enables SSE-B2/SSE-S3", "AES256", false, ""},
		{"aws:kms is accepted for AWS S3 targets", "aws:kms", false, ""},
		{"unknown value fails fast", "AES999", true, "unsupported STORAGE_SSE_MODE"},
		{"typo fails fast", "aes256", true, "unsupported STORAGE_SSE_MODE"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := base
			cfg.SSEMode = tt.sseMode
			_, err := newAWSS3Client(cfg)
			if tt.wantError {
				if err == nil {
					t.Fatalf("expected error for SSEMode=%q, got nil", tt.sseMode)
				}
				if !strings.Contains(err.Error(), tt.errSubstr) {
					t.Errorf("error message missing %q; got: %v", tt.errSubstr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error for SSEMode=%q: %v", tt.sseMode, err)
			}
		})
	}
}
