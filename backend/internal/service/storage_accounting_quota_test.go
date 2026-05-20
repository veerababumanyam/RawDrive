package service

import (
	"errors"
	"testing"
)

// Tests the pure-arithmetic parts of the storage-quota path that don't need a
// live Postgres pool. The full GetUsage / CheckQuota integration is covered
// by manual prod verification in the fix RCA — those queries depend on
// real workspaces + workspace_storage rows so a unit test against a mocked
// pool would be value-less plausibility theater.

func TestPlanDefaultQuotaBytes(t *testing.T) {
	cases := []struct {
		tier string
		want int64
	}{
		{"free", 1 << 30},                  // 1 GB
		{"starter", 30 * (1 << 30)},        // 30 GB
		{"professional", 300 * (1 << 30)},  // 300 GB
		{"business", 3 * (1 << 40)},        // 3 TB
		{"enterprise", 6 * (1 << 40)},      // 6 TB
		{"", 1 << 30},                      // unknown -> free
		{"garbage-tier", 1 << 30},          // unknown -> free
	}
	for _, c := range cases {
		got := PlanDefaultQuotaBytes(c.tier)
		if got != c.want {
			t.Errorf("PlanDefaultQuotaBytes(%q) = %d, want %d", c.tier, got, c.want)
		}
	}
}

// ErrStorageQuotaExceeded must remain a stable sentinel so handlers can
// detect it with errors.Is. If someone refactors it to a typed struct or
// renames it, this test catches the contract break and the upload handler's
// 403 path silently falls through to 500.
func TestErrStorageQuotaExceededIsSentinel(t *testing.T) {
	if ErrStorageQuotaExceeded == nil {
		t.Fatal("ErrStorageQuotaExceeded must be a non-nil sentinel")
	}
	if !errors.Is(ErrStorageQuotaExceeded, ErrStorageQuotaExceeded) {
		t.Error("errors.Is must match the sentinel against itself")
	}
	wrapped := errorsWrap(ErrStorageQuotaExceeded, "upload: quota check")
	if !errors.Is(wrapped, ErrStorageQuotaExceeded) {
		t.Error("errors.Is must unwrap a fmt.Errorf-wrapped sentinel")
	}
	other := errors.New("unrelated error")
	if errors.Is(other, ErrStorageQuotaExceeded) {
		t.Error("errors.Is must not match an unrelated error")
	}
}

// errorsWrap is a tiny helper to mirror the fmt.Errorf(... %w ...) shape the
// handler-side code uses, without pulling fmt into the test file just for one
// line. Functionally identical to fmt.Errorf with a %w verb.
func errorsWrap(err error, msg string) error {
	return &wrapErr{msg: msg, err: err}
}

type wrapErr struct {
	msg string
	err error
}

func (w *wrapErr) Error() string { return w.msg + ": " + w.err.Error() }
func (w *wrapErr) Unwrap() error { return w.err }
