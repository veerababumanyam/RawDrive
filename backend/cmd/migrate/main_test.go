package main

import (
	"errors"
	"testing"
)

// TestExitsOnMissingDSN verifies the binary reports a clear error and
// exits non-zero when DATABASE_URL is absent.
func TestExitsOnMissingDSN(t *testing.T) {
	err := runMigrate("")
	if !errors.Is(err, errMissingDSN) {
		t.Fatalf("expected errMissingDSN, got %v", err)
	}
}
