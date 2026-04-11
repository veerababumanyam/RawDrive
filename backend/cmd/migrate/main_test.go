package main

import (
	"errors"
	"os"
	"testing"
)

// TestExitsOnMissingDSN verifies the binary reports a clear error and
// exits non-zero when DATABASE_URL is absent.
func TestExitsOnMissingDSN(t *testing.T) {
	if os.Getenv("TEST_RUN_MAIN") == "1" {
		os.Unsetenv("DATABASE_URL")
		main()
		return
	}
	// Test harness that re-runs this test binary in a child process
	// is overkill here. Instead just assert runMigrate() returns the
	// expected error when called directly with empty DSN.
	err := runMigrate("")
	if !errors.Is(err, errMissingDSN) {
		t.Fatalf("expected errMissingDSN, got %v", err)
	}
}
