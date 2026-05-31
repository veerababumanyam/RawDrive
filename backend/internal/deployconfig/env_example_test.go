package deployconfig

// env_example_test.go — regression test for audit finding F-079.
//
// Both .env.example files (repo root and deploy/) used to ship the obsolete
// Cloudflare R2 storage config: STORAGE_DRIVER=r2 with R2_* vars. The shipped
// stack migrated to Backblaze B2 (S3-compatible) — the storage factory
// (backend/internal/storage/factory.go) only accepts STORAGE_DRIVER=s3 and the
// backend reads B2_* env vars. A developer following the old .env.example set
// an unsupported driver and the backend errored at storage init.
//
// This is a pure-file assertion (no DB, no network): it reads the committed
// .env.example files from the repo and asserts the active storage config is
// the supported one (STORAGE_DRIVER=s3 + B2_* vars) and that the obsolete
// STORAGE_DRIVER=r2 is gone, so a future edit that regresses to the R2 driver
// fails CI.
//
// We locate the repo root by walking up from the test's working directory
// until we find go.mod (the repo root has go.mod adjacent to .env.example).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// envRepoRoot walks up from the current working directory until it finds the
// directory containing the root .env.example (next to the top-level go.mod /
// package.json). The test runs from backend/internal/deployconfig, so the
// root is a few levels up.
func envRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for {
		if _, statErr := os.Stat(filepath.Join(dir, ".env.example")); statErr == nil {
			// Confirm this is the repo root and not some nested copy by also
			// requiring the deploy/.env.example sibling path to exist.
			if _, depErr := os.Stat(filepath.Join(dir, "deploy", ".env.example")); depErr == nil {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("could not locate repo root containing .env.example and deploy/.env.example")
		}
		dir = parent
	}
}

func readEnvFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(b)
}

// activeDriverValue returns the value of the last non-comment STORAGE_DRIVER=
// assignment in the file (mirrors shell dotenv semantics where the last
// assignment wins). Returns "" if no active assignment exists.
func activeDriverValue(content string) string {
	value := ""
	for _, raw := range strings.Split(content, "\n") {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "STORAGE_DRIVER=") {
			value = strings.TrimSpace(strings.TrimPrefix(line, "STORAGE_DRIVER="))
		}
	}
	return value
}

// hasActiveAssignment reports whether key= appears on a non-comment line.
func hasActiveAssignment(content, key string) bool {
	for _, raw := range strings.Split(content, "\n") {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, key+"=") {
			return true
		}
	}
	return false
}

// TestF079_EnvExampleUsesB2NotR2 asserts the root .env.example documents the
// supported Backblaze B2 (s3) storage config and not the obsolete R2 driver.
func TestF079_EnvExampleUsesB2NotR2(t *testing.T) {
	root := envRepoRoot(t)
	content := readEnvFile(t, filepath.Join(root, ".env.example"))

	if got := activeDriverValue(content); got != "s3" {
		t.Errorf("root .env.example active STORAGE_DRIVER = %q, want \"s3\" "+
			"(the storage factory only accepts \"s3\"; \"r2\" fatals at boot)", got)
	}

	// The dead R2 OBJECT-STORAGE vars must not be active assignments — they
	// are no longer read by the storage factory and would mislead operators.
	// R2_ACCOUNT_ID is intentionally excluded: it is still read by
	// stream_service.go as a Cloudflare Stream (video) fallback and is
	// unrelated to object storage.
	for _, key := range []string{
		"R2_BUCKET_NAME",
		"R2_ACCESS_KEY_ID",
		"R2_SECRET_ACCESS_KEY",
		"R2_ENDPOINT",
		"R2_REGION",
		"R2_PUBLIC_URL",
	} {
		if hasActiveAssignment(content, key) {
			t.Errorf("root .env.example still has an active %s= assignment; "+
				"R2 object-storage vars are deprecated and must be "+
				"comment-only breadcrumbs, not active config", key)
		}
	}

	// Every B2_* var the backend (cmd/api/main.go initStorage) reads must be
	// documented as an active assignment so a fresh clone can provision them.
	for _, key := range []string{
		"B2_BUCKET_NAME",
		"B2_KEY_ID",
		"B2_APPLICATION_KEY",
		"B2_ENDPOINT",
		"B2_REGION",
	} {
		if !hasActiveAssignment(content, key) {
			t.Errorf("root .env.example missing required B2 var %q", key)
		}
	}
}

// TestF079_DeployEnvExampleUsesB2NotR2 asserts the deploy/.env.example file is
// in sync with the shipped B2 backend too.
func TestF079_DeployEnvExampleUsesB2NotR2(t *testing.T) {
	root := envRepoRoot(t)
	content := readEnvFile(t, filepath.Join(root, "deploy", ".env.example"))

	if got := activeDriverValue(content); got != "s3" {
		t.Errorf("deploy/.env.example active STORAGE_DRIVER = %q, want \"s3\"", got)
	}

	if hasActiveAssignment(content, "R2_BUCKET_NAME") {
		t.Errorf("deploy/.env.example still has an active R2_BUCKET_NAME= " +
			"assignment; R2_* storage vars are deprecated")
	}

	for _, key := range []string{
		"B2_BUCKET_NAME",
		"B2_KEY_ID",
		"B2_APPLICATION_KEY",
		"B2_ENDPOINT",
		"B2_REGION",
	} {
		if !hasActiveAssignment(content, key) {
			t.Errorf("deploy/.env.example missing required B2 var %q", key)
		}
	}
}

func TestDeployEnvExampleDocumentsGoogleOAuthAndFrontendOrigin(t *testing.T) {
	root := envRepoRoot(t)
	content := readEnvFile(t, filepath.Join(root, "deploy", ".env.example"))

	for _, key := range []string{
		"FRONTEND_URL",
		"GOOGLE_CLIENT_ID",
		"GOOGLE_CLIENT_SECRET",
		"GOOGLE_REDIRECT_URL",
	} {
		if !hasActiveAssignment(content, key) {
			t.Errorf("deploy/.env.example missing required OAuth/frontend var %q", key)
		}
	}
}
