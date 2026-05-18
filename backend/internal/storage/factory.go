package storage

import "fmt"

// NewProvider creates a storage Provider based on the given Config.
//
// F-008 (audit 2026-04-10) + CLAUDE.md hardcode law #1:
// The "local" driver is DISABLED in production. RawDrive uses Backblaze B2
// as the managed storage backend (via its S3-compatible API); the local-disk
// driver exists for unit tests only (which call NewLocalDriver directly).
// Going through this factory with Driver="local" — which is exactly what
// the STORAGE_DRIVER=local env var did before this fix — fails fast with an
// explicit hardcode-law reference so operators know why.
// Redesigning the chunked-upload temp staging to stream through to B2
// multipart (the other half of F-008) is tracked as a follow-up.
//
// Enterprise tenants may override the managed B2 backend via the BYOS wizard
// (workspace_storage_configs); those overrides still drive the "s3" case
// with tenant-supplied AWS S3 / MinIO / B2 credentials.
func NewProvider(cfg Config) (Provider, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	switch cfg.Driver {
	case "local":
		return nil, fmt.Errorf(
			"storage: the 'local' driver is disabled in production (RawDrive " +
				"hardcode law #1 — audit F-008). RawDrive uses Backblaze B2 " +
				"(S3-compatible). Set STORAGE_DRIVER=s3 with B2 credentials " +
				"(B2_BUCKET_NAME, B2_KEY_ID, B2_APPLICATION_KEY, B2_ENDPOINT), " +
				"or if you are running tests, call NewLocalDriver directly " +
				"instead of going through NewProvider.")
	case "s3":
		return NewS3Driver(cfg)
	default:
		return nil, fmt.Errorf("storage: unsupported driver %q", cfg.Driver)
	}
}
