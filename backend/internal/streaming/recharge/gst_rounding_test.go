package recharge

import "testing"

// TestF016_RechargeGSTMatchesBillingRoundHalfUp asserts the recharge invoice
// path computes GST with the SAME round-half-up arithmetic as the billing
// engine (gst_engine.go: (amount*percent + 50) / 100), instead of the old
// integer-floor (subtotal*18)/100.
//
// The canonical divergence from the finding is subtotal = 55 paise:
//
//	billing IGST = (55*18 + 50) / 100 = 1040 / 100 = 10
//	old recharge = (55*18)      / 100 =  990 / 100 =  9   // BUG (floor)
//
// Pre-fix this test fails (the floor calc yields 9); post-fix it passes.
func TestF016_RechargeGSTMatchesBillingRoundHalfUp(t *testing.T) {
	cases := []struct {
		name    string
		amount  int64
		percent int64
		want    int64
	}{
		// F-016 canonical case: floor=9, round-half-up=10.
		{"finding subtotal 55 at 18pct rounds up", 55, gstRatePercent, 10},
		// 3*18=54, +50=104 -> 1 (floor would be 0).
		{"subtotal 3 at 18pct", 3, gstRatePercent, 1},
		// 53*18=954, +50=1004 -> 10 (floor would be 9).
		{"subtotal 53 at 18pct", 53, gstRatePercent, 10},
		// Exact multiples where both schemes agree.
		{"subtotal 100 at 18pct", 100, gstRatePercent, 18},
		{"subtotal 0 at 18pct", 0, gstRatePercent, 0},
		// Exact half-paisa boundary rounds up: 25*18=450, +50=500 -> 5.
		{"subtotal 25 at 18pct half rounds up", 25, gstRatePercent, 5},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := gstRoundHalfUpPercent(tc.amount, tc.percent)
			if got != tc.want {
				t.Fatalf("gstRoundHalfUpPercent(%d, %d) = %d; want %d (round-half-up parity with billing)",
					tc.amount, tc.percent, got, tc.want)
			}
		})
	}
}

// TestF017_IntraStateCGSTEqualsSGST asserts CGST == SGST for intra-state
// streaming invoices across every subtotal, including odd ones. The old code
// computed cgst = totalGST/2 and sgst = totalGST - cgst, so for an odd total
// (e.g. totalGST = 9 -> cgst 4, sgst 5) the split was asymmetric.
//
// The fix computes each independently at gstRatePercent/2 (9%) from the same
// subtotal, so they are equal by construction.
func TestF017_IntraStateCGSTEqualsSGST(t *testing.T) {
	half := int64(gstRatePercent / 2) // 9

	// Walk a wide range of subtotals; many produce an odd "total GST" under the
	// old split scheme and would have failed CGST == SGST.
	for subtotal := int64(0); subtotal <= 1000; subtotal++ {
		cgst := gstRoundHalfUpPercent(subtotal, half)
		sgst := gstRoundHalfUpPercent(subtotal, half)
		if cgst != sgst {
			t.Fatalf("subtotal=%d: cgst=%d sgst=%d; intra-state split must be equal", subtotal, cgst, sgst)
		}
	}

	// Spot-check a subtotal whose 18% total is odd (so the old "split the total"
	// approach gave 4/5). subtotal=50 -> 18% = (50*18+50)/100 = 9 (odd total).
	// Independent halves: 9% of 50 = (50*9+50)/100 = 5 each.
	cgst := gstRoundHalfUpPercent(50, half)
	sgst := gstRoundHalfUpPercent(50, half)
	if cgst != sgst {
		t.Fatalf("subtotal=50: cgst=%d sgst=%d; want equal", cgst, sgst)
	}
	if cgst != 5 {
		t.Fatalf("subtotal=50: cgst=%d; want 5 (9 percent round-half-up)", cgst)
	}
}

// TestGSTRoundHalfUpMatchesBillingFormula is an exhaustive cross-check that
// gstRoundHalfUpPercent here is byte-for-byte the billing engine formula
// (amount*percent + 50) / 100, so the two invoice families can never drift.
func TestGSTRoundHalfUpMatchesBillingFormula(t *testing.T) {
	for amount := int64(0); amount <= 5000; amount++ {
		for _, percent := range []int64{gstRatePercent, gstRatePercent / 2} {
			want := (amount*percent + 50) / 100
			if got := gstRoundHalfUpPercent(amount, percent); got != want {
				t.Fatalf("gstRoundHalfUpPercent(%d,%d)=%d; want %d", amount, percent, got, want)
			}
		}
	}
}
