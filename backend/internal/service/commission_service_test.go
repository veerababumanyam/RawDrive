package service

import (
	"math/big"
	"testing"
)

// oldFloatCommission reproduces the pre-fix implementation:
//
//	int64(float64(paymentAmountPaisa) * dealerPct / 100)
//
// It is kept in the test only to document the behaviour the fix corrects.
func oldFloatCommission(paymentAmountPaisa int64, dealerPct float64) int64 {
	return int64(float64(paymentAmountPaisa) * dealerPct / 100)
}

// exactCommission is an independent, arbitrary-precision reference for
// floor(paymentAmountPaisa * pct/100) computed via integer basis points.
func exactCommission(paymentAmountPaisa int64, pct float64) int64 {
	bp := PctToBasisPoints(pct)
	num := new(big.Int).Mul(big.NewInt(paymentAmountPaisa), big.NewInt(bp))
	num.Quo(num, big.NewInt(10000))
	return num.Int64()
}

func TestF059_PctToBasisPoints(t *testing.T) {
	cases := []struct {
		pct  float64
		want int64
	}{
		{0, 0},
		{15, 1500},
		{15.5, 1550}, // must not truncate to 1549 (15.5*100 == 1549.999... in float64)
		{12.5, 1250},
		{33.33, 3333},
		{100, 10000},
		{2.5, 250},
	}
	for _, c := range cases {
		if got := PctToBasisPoints(c.pct); got != c.want {
			t.Errorf("PctToBasisPoints(%v) = %d, want %d", c.pct, got, c.want)
		}
	}
}

// TestF059_CommissionMatchesIntegerBasis is the core regression: in realistic
// money ranges the commission must equal the exact integer basis-point result.
// This passes with the fixed pure-integer implementation.
func TestF059_CommissionMatchesIntegerBasis(t *testing.T) {
	cases := []struct {
		name   string
		paisa  int64
		pct    float64
		expect int64
	}{
		{"15pct of 1 lakh rupees", 10_000_000, 15, 1_500_000},
		{"15.5pct of 1 lakh rupees", 10_000_000, 15.5, 1_550_000},
		{"12.5pct of 333 rupees", 33_300, 12.5, 4_162}, // floor(33300*1250/10000)=4162
		{"zero amount", 0, 15, 0},
		{"zero pct", 99_999_999, 0, 0},
	}
	for _, c := range cases {
		got := CalculateCommission(c.paisa, c.pct)
		if got != c.expect {
			t.Errorf("%s: CalculateCommission(%d, %v) = %d, want %d",
				c.name, c.paisa, c.pct, got, c.expect)
		}
		if got != exactCommission(c.paisa, c.pct) {
			t.Errorf("%s: CalculateCommission(%d, %v) = %d, diverges from exact integer basis %d",
				c.name, c.paisa, c.pct, got, exactCommission(c.paisa, c.pct))
		}
	}
}

// TestF059_NoFloatDriftAtLargeAmounts exercises amounts above 2^53 paisa where
// float64 multiplication loses integer precision. The fixed integer
// implementation must match the exact basis-point reference; the old float
// formula does not. This test FAILS against the pre-fix implementation
// (oldFloatCommission diverges from exact) and PASSES after the fix.
func TestF059_NoFloatDriftAtLargeAmounts(t *testing.T) {
	// paisa just above 2^53 (9_007_199_254_740_992): float64 can no longer
	// represent every integer exactly here.
	const bigPaisa = int64(9_007_199_254_740_999)
	pcts := []float64{15, 15.5, 12.5, 18}

	driftSeen := false
	for _, pct := range pcts {
		want := exactCommission(bigPaisa, pct)
		got := CalculateCommission(bigPaisa, pct)
		if got != want {
			t.Errorf("CalculateCommission(%d, %v) = %d, want exact integer basis %d",
				bigPaisa, pct, got, want)
		}
		if oldFloatCommission(bigPaisa, pct) != want {
			driftSeen = true
		}
	}

	// Guard: confirm the regression is meaningful — the old float formula
	// really did drift from the exact integer result for at least one case.
	if !driftSeen {
		t.Fatal("expected old float formula to drift from exact integer basis at large amounts, but it matched everywhere — regression no longer demonstrates the bug")
	}
}

// TestF059_NoOverflowAtExtremeAmounts guards against a naive int64
// multiplication (paymentAmountPaisa * basisPoints) overflowing and producing a
// negative payout. The fix uses math/big, so the result must stay correct and
// non-negative even when the int64 product would wrap.
func TestF059_NoOverflowAtExtremeAmounts(t *testing.T) {
	// paisa * 1500 overflows int64 (max ~9.22e18) once paisa exceeds ~6.1e15.
	const extremePaisa = int64(9_000_000_000_000_000)
	const pct = 15.0

	got := CalculateCommission(extremePaisa, pct)
	want := exactCommission(extremePaisa, pct)
	if got != want {
		t.Errorf("CalculateCommission(%d, %v) = %d, want %d", extremePaisa, pct, got, want)
	}
	if got < 0 {
		t.Errorf("CalculateCommission(%d, %v) = %d is negative — int64 overflow regression",
			extremePaisa, pct, got)
	}

	// Also exercise the basis-point entry point directly.
	if gotBP := CalculateCommissionBasisPoints(extremePaisa, 1500); gotBP != want {
		t.Errorf("CalculateCommissionBasisPoints(%d, 1500) = %d, want %d", extremePaisa, gotBP, want)
	}
}
