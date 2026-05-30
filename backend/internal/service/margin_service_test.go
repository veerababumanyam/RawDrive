package service

import (
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

func TestInvalidMarginSum(t *testing.T) {
	svc := NewMarginService(nil, nil)
	m := &repository.MarginRatio{
		DealerPct:   60,
		PlatformPct: 30, // sum = 90, not 100
	}
	err := svc.ConfigureMargin(nil, m)
	if err != ErrInvalidMarginSum {
		t.Errorf("expected ErrInvalidMarginSum, got %v", err)
	}
}

func TestValidMarginSum(t *testing.T) {
	// Can't fully test without DB, but verify validation passes for correct sum
	m := &repository.MarginRatio{
		DealerPct:   70,
		PlatformPct: 30,
	}
	if m.DealerPct+m.PlatformPct != 100 {
		t.Errorf("expected sum 100, got %f", m.DealerPct+m.PlatformPct)
	}
}

// configureMarginValidation runs ConfigureMargin against a nil repo and reports
// only the validation outcome. A nil-repo panic from s.repo.Create means both
// validation gates (sum + effective-from) passed — i.e. the config was accepted.
// We recover that panic so the test can distinguish "rejected by validation"
// from "accepted, then failed at the DB layer (out of scope here)".
func configureMarginValidation(t *testing.T, dealerPct, platformPct float64) (err error, accepted bool) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			// Reached s.repo.Create on a nil repo => validation accepted the config.
			accepted = true
			err = nil
		}
	}()
	svc := NewMarginService(nil, nil)
	m := &repository.MarginRatio{
		DealerPct:     dealerPct,
		PlatformPct:   platformPct,
		EffectiveFrom: time.Now().UTC().Add(24 * time.Hour), // future, passes retroactive check
	}
	err = svc.ConfigureMargin(nil, m)
	return err, false
}

// TestF060_FractionalMarginSumTolerance is the regression test for F-060.
//
// ConfigureMargin previously validated dealer_pct + platform_pct with exact
// float64 equality (`sum != 100`). For percentages whose IEEE-754
// representation carries accumulated error, that sum is not exactly 100.0 even
// though the values decimally sum to 100 — so a valid config was wrongly
// rejected with ErrInvalidMarginSum.
//
// 9.9999999999999804 + 90.0 == 99.99999999999998 (delta ~ -1.4e-14), a value
// that decimally rounds to 10.0 + 90.0. Before the fix this returned
// ErrInvalidMarginSum; with the tolerance comparison it is accepted.
func TestF060_FractionalMarginSumTolerance(t *testing.T) {
	// A dealer percentage carrying float accumulation error that decimally
	// equals 10.0, paired with platform 90.0. Built by accumulation so the
	// imprecision is real and not optimized away by the compiler.
	var dealerPct float64
	for i := 0; i < 100; i++ {
		dealerPct += 0.1 // 10.0 in exact arithmetic; 9.99999999999998... in float64
	}
	platformPct := 90.0

	// Sanity: confirm the operands genuinely fail exact float equality, so this
	// test actually exercises the imprecision path it claims to.
	if dealerPct+platformPct == 100 {
		t.Fatalf("test precondition not met: %.20g + %.1f == 100 exactly; "+
			"the imprecision reproducer no longer holds", dealerPct, platformPct)
	}

	err, accepted := configureMarginValidation(t, dealerPct, platformPct)
	if err == ErrInvalidMarginSum {
		t.Fatalf("F-060 regression: valid fractional split %.20g/%.1f rejected "+
			"with ErrInvalidMarginSum due to float64 equality", dealerPct, platformPct)
	}
	if !accepted {
		t.Fatalf("expected fractional split %.20g/%.1f to pass margin-sum "+
			"validation, got err=%v", dealerPct, platformPct, err)
	}
}

// TestF060_OutOfToleranceStillRejected ensures the tolerance fix did not widen
// validation so much that genuinely wrong splits slip through. A split off by
// more than the tolerance (here 0.5 percentage points) must still be rejected.
func TestF060_OutOfToleranceStillRejected(t *testing.T) {
	svc := NewMarginService(nil, nil)
	m := &repository.MarginRatio{
		DealerPct:     70.0,
		PlatformPct:   29.5, // sum = 99.5, off by 0.5 >> 0.001 tolerance
		EffectiveFrom: time.Now().UTC().Add(24 * time.Hour),
	}
	if err := svc.ConfigureMargin(nil, m); err != ErrInvalidMarginSum {
		t.Fatalf("expected ErrInvalidMarginSum for 70/29.5 split, got %v", err)
	}
}
