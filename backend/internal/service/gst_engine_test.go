package service

import "testing"

func TestIntraStateTax(t *testing.T) {
	// Same state: CGST 9% + SGST 9%
	result := CalculateGST(100000, 1, 1) // ₹1000.00
	if result.IsInterState {
		t.Error("expected intra-state")
	}
	if result.CGSTPaisa != 9000 {
		t.Errorf("CGST: want 9000, got %d", result.CGSTPaisa)
	}
	if result.SGSTPaisa != 9000 {
		t.Errorf("SGST: want 9000, got %d", result.SGSTPaisa)
	}
	if result.IGSTPaisa != 0 {
		t.Errorf("IGST: want 0, got %d", result.IGSTPaisa)
	}
	if result.TotalPaisa != 118000 {
		t.Errorf("Total: want 118000, got %d", result.TotalPaisa)
	}
}

func TestInterStateTax(t *testing.T) {
	// Different states: IGST 18%
	result := CalculateGST(100000, 1, 2)
	if !result.IsInterState {
		t.Error("expected inter-state")
	}
	if result.CGSTPaisa != 0 {
		t.Errorf("CGST: want 0, got %d", result.CGSTPaisa)
	}
	if result.SGSTPaisa != 0 {
		t.Errorf("SGST: want 0, got %d", result.SGSTPaisa)
	}
	if result.IGSTPaisa != 18000 {
		t.Errorf("IGST: want 18000, got %d", result.IGSTPaisa)
	}
	if result.TotalPaisa != 118000 {
		t.Errorf("Total: want 118000, got %d", result.TotalPaisa)
	}
}

func TestGSTAllStates(t *testing.T) {
	// Verify that for all 36 state/UT IDs (1-36), calculation works
	subtotal := int64(99900) // ₹999.00
	for stateID := 1; stateID <= 36; stateID++ {
		// Intra-state
		intra := CalculateGST(subtotal, stateID, stateID)
		if intra.IsInterState {
			t.Errorf("state %d: expected intra-state", stateID)
		}
		expectedCGST := roundHalfUpPercent(subtotal, 9)
		if intra.CGSTPaisa != expectedCGST {
			t.Errorf("state %d intra CGST: want %d, got %d", stateID, expectedCGST, intra.CGSTPaisa)
		}

		// Inter-state (different from state 0)
		inter := CalculateGST(subtotal, stateID, stateID+100)
		if !inter.IsInterState {
			t.Errorf("state %d: expected inter-state", stateID)
		}
		expectedIGST := roundHalfUpPercent(subtotal, 18)
		if inter.IGSTPaisa != expectedIGST {
			t.Errorf("state %d inter IGST: want %d, got %d", stateID, expectedIGST, inter.IGSTPaisa)
		}
	}
}

func TestZeroAmount(t *testing.T) {
	result := CalculateGST(0, 1, 1)
	if result.TotalPaisa != 0 {
		t.Errorf("Total: want 0, got %d", result.TotalPaisa)
	}
}

func TestFormatAmount(t *testing.T) {
	tests := []struct {
		paisa int64
		want  string
	}{
		{99900, "₹999.00"},
		{100, "₹1.00"},
		{50, "₹0.50"},
		{0, "₹0.00"},
		{-5000, "-₹50.00"},
		{1, "₹0.01"},
	}
	for _, tt := range tests {
		got := FormatAmount(tt.paisa)
		if got != tt.want {
			t.Errorf("FormatAmount(%d): want %q, got %q", tt.paisa, tt.want, got)
		}
	}
}

func TestRoundingHalfUp(t *testing.T) {
	// 999 paisa * 9% = 89.91 → should round to 90
	result := CalculateGST(999, 1, 1)
	if result.CGSTPaisa != 90 {
		t.Errorf("CGST rounding: want 90, got %d", result.CGSTPaisa)
	}
}
