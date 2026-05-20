package storage

import (
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
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

	// A valid 32-byte hex key for the SSE-C-success case.
	validHexKey := strings.Repeat("ab", 32) // 64 hex chars = 32 bytes

	tests := []struct {
		name      string
		sseMode   string
		sseKeyHex string
		wantError bool
		errSubstr string
	}{
		{"empty disables SSE", "", "", false, ""},
		{"AES256 enables SSE-B2/SSE-S3", "AES256", "", false, ""},
		{"aws:kms is accepted for AWS S3 targets", "aws:kms", "", false, ""},
		{"SSE-C with valid 32-byte hex key", "SSE-C", validHexKey, false, ""},
		{"SSE-C without key fails", "SSE-C", "", true, "requires STORAGE_SSE_C_KEY"},
		{"SSE-C with invalid hex fails", "SSE-C", "not-hex-at-all-zzzz", true, "not valid hex"},
		{"SSE-C with short key fails", "SSE-C", strings.Repeat("ab", 16), true, "32 bytes"},
		{"SSE-C with long key fails", "SSE-C", strings.Repeat("ab", 48), true, "32 bytes"},
		{"unknown value fails fast", "AES999", "", true, "unsupported STORAGE_SSE_MODE"},
		{"typo fails fast", "aes256", "", true, "unsupported STORAGE_SSE_MODE"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := base
			cfg.SSEMode = tt.sseMode
			cfg.SSECustomerKeyHex = tt.sseKeyHex
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

// SSE-C: confirm the construction pre-computes base64(key) and
// base64(md5(key)) correctly. B2 stores only the MD5 hash and verifies
// every subsequent request against it — a wrong MD5 means the request
// is silently rejected (403). This test pins the encoding so any
// future refactor (e.g. switching from StdEncoding to URLEncoding,
// which would corrupt the value B2 expects) breaks visibly.
func TestNewAWSS3Client_SSECKeyMaterial(t *testing.T) {
	rawKey, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	wantKeyB64 := base64.StdEncoding.EncodeToString(rawKey)
	sum := md5.Sum(rawKey)
	wantMD5B64 := base64.StdEncoding.EncodeToString(sum[:])

	cfg := Config{
		Driver:            "s3",
		Bucket:            "test-bucket",
		Region:            "us-east-005",
		Endpoint:          "https://s3.us-east-005.backblazeb2.com",
		AccessKey:         "test-key-id",
		SecretKey:         "test-secret",
		SSEMode:           "SSE-C",
		SSECustomerKeyHex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	}
	c, err := newAWSS3Client(cfg)
	if err != nil {
		t.Fatalf("newAWSS3Client: %v", err)
	}
	ac, ok := c.(*awsS3Client)
	if !ok {
		t.Fatalf("newAWSS3Client did not return *awsS3Client")
	}
	if !ac.sseCActive {
		t.Error("expected sseCActive=true")
	}
	if ac.sseCAlgorithm == nil || *ac.sseCAlgorithm != "AES256" {
		t.Errorf("sseCAlgorithm: want AES256, got %v", ac.sseCAlgorithm)
	}
	if ac.sseCKeyB64 == nil || *ac.sseCKeyB64 != wantKeyB64 {
		t.Errorf("sseCKeyB64 mismatch:\n  want: %s\n  got:  %v", wantKeyB64, ac.sseCKeyB64)
	}
	if ac.sseCKeyMD5B64 == nil || *ac.sseCKeyMD5B64 != wantMD5B64 {
		t.Errorf("sseCKeyMD5B64 mismatch:\n  want: %s\n  got:  %v", wantMD5B64, ac.sseCKeyMD5B64)
	}
}
