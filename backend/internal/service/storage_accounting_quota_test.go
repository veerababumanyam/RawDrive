package service

import (
	"errors"
	"os"
	"strings"
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
		{"free", 5 * (1 << 30)},               // 5 GB
		{"standard", 5 * (1 << 30)},           // legacy alias -> free
		{"creator", 100 * (1 << 30)},          // 100 GB
		{"starter", 100 * (1 << 30)},          // legacy alias -> creator
		{"pro_photographer", 300 * (1 << 30)}, // 300 GB
		{"professional", 300 * (1 << 30)},     // legacy alias -> pro_photographer
		{"studio", 1 * (1 << 40)},             // 1 TB
		{"elite_studio", 3 * (1 << 40)},       // 3 TB+ default
		{"enterprise", 3 * (1 << 40)},         // legacy alias -> elite_studio
		{"", 5 * (1 << 30)},                   // unknown -> free
		{"garbage-tier", 5 * (1 << 30)},       // unknown -> free
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

func TestEffectiveQuotaPathsIncludeDerivativesReservedAndGrace(t *testing.T) {
	body, err := os.ReadFile("storage_accounting_service.go")
	if err != nil {
		t.Fatalf("read storage accounting service: %v", err)
	}
	source := string(body)
	for _, fragment := range []string{
		"used_bytes + derivative_bytes + reserved_bytes + $2 <= quota_bytes + grace_bytes",
		"reserved_bytes = reserved_bytes + $2",
		"ws.PercentUsed = float64(ws.billableBytes()) / float64(limit) * 100",
		"usage.TotalBytes + usage.ReservedBytes + additionalBytes",
	} {
		if !strings.Contains(source, fragment) {
			t.Fatalf("effective quota path must contain %q", fragment)
		}
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
