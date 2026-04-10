package handler

// health_handler_test.go — pure-logic tests for the M14 deep health
// check. Database probes are covered by integration tests; these
// cover the classification helpers.

import (
	"testing"
)

func TestIsExpectedNotFound_TrueForMarkers(t *testing.T) {
	cases := []string{
		"NoSuchKey: the specified key does not exist",
		"storage get: not found",
		"HTTP 404",
		"NotFound",
	}
	for _, msg := range cases {
		err := stringErr(msg)
		if !isExpectedNotFound(err) {
			t.Errorf("should recognize as not-found: %q", msg)
		}
	}
}

func TestIsExpectedNotFound_FalseForRealErrors(t *testing.T) {
	cases := []string{
		"connection refused",
		"context deadline exceeded",
		"dial tcp: lookup failed",
	}
	for _, msg := range cases {
		err := stringErr(msg)
		if isExpectedNotFound(err) {
			t.Errorf("should NOT be not-found: %q", msg)
		}
	}
}

func TestIsExpectedNotFound_NilSafe(t *testing.T) {
	if isExpectedNotFound(nil) {
		t.Errorf("nil err should return false")
	}
}

func TestContains_SubstringMatching(t *testing.T) {
	if !contains("hello world", "world") {
		t.Errorf("should match end substring")
	}
	if !contains("hello world", "hello") {
		t.Errorf("should match start substring")
	}
	if !contains("hello world", "o wo") {
		t.Errorf("should match middle substring")
	}
	if contains("hello", "longer than haystack") {
		t.Errorf("substring larger than string should not match")
	}
}

// stringErr is a test helper — errors.New would work but we want to
// keep this file import-light.
type stringError string

func (s stringError) Error() string { return string(s) }

func stringErr(s string) error { return stringError(s) }
