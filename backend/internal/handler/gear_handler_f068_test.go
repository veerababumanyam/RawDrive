package handler

import (
	"os"
	"regexp"
	"testing"
)

// TestF068_AvailabilitySyncErrorIsLogged is a source-level regression guard for
// finding F-068.
//
// Root cause: GearHandler.UpdateBookingStatus persisted the secondary gear
// availability flip with `_ = h.repo.Update(r.Context(), &gear)`, discarding the
// error. A failed availability sync silently left stale availability, which can
// cause double-bookings.
//
// The handler holds a concrete *repository.GearRepo (a DB-backed struct, not an
// interface), so the failing-Update code path cannot be driven by a pure
// in-memory fake without either a live DB connection or a repository-layer
// refactor that is outside this fix's owned scope. To keep this a pure,
// deterministic unit test, we assert the fix at the source level: the swallowed
// `_ = h.repo.Update(...)` pattern must be gone and replaced by an
// error-checked, logged Update.
//
// Before the fix this test fails (the `_ =` discard is present and the log line
// is absent); after the fix it passes.
func TestF068_AvailabilitySyncErrorIsLogged(t *testing.T) {
	src, err := os.ReadFile("gear_handler.go")
	if err != nil {
		t.Fatalf("read gear_handler.go: %v", err)
	}
	code := string(src)

	// The discard pattern must no longer be used for the availability sync.
	discard := regexp.MustCompile(`_\s*=\s*h\.repo\.Update\(`)
	if discard.MatchString(code) {
		t.Errorf("F-068 regression: gear availability Update error is discarded with `_ = h.repo.Update(...)`; it must be error-checked and logged")
	}

	// The fix must error-check the Update and log on failure.
	checked := regexp.MustCompile(`if\s+\w+\s*:=\s*h\.repo\.Update\(`)
	if !checked.MatchString(code) {
		t.Errorf("F-068 regression: expected an error-checked `if err := h.repo.Update(...)` around the availability sync")
	}
	if !regexp.MustCompile(`log\.Printf\(`).MatchString(code) {
		t.Errorf("F-068 regression: expected the availability-sync failure to be logged via log.Printf")
	}
}
