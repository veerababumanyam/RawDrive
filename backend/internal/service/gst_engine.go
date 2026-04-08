package service

import "fmt"

// GSTRate is the standard GST rate for photography services (HSN 998395).
const GSTRate int64 = 18 // percent

// GSTResult holds the breakdown of a GST calculation.
// All amounts are in paisa (1 INR = 100 paisa).
type GSTResult struct {
	SubtotalPaisa int64 `json:"subtotal_paisa"`
	CGSTPaisa     int64 `json:"cgst_paisa"`
	SGSTPaisa     int64 `json:"sgst_paisa"`
	IGSTPaisa     int64 `json:"igst_paisa"`
	TotalPaisa    int64 `json:"total_paisa"`
	IsInterState  bool  `json:"is_inter_state"`
}

// CalculateGST computes GST on a subtotal using integer arithmetic only.
// If photographerStateID == clientStateID → intra-state: CGST 9% + SGST 9%
// If photographerStateID != clientStateID → inter-state: IGST 18%
func CalculateGST(subtotalPaisa int64, photographerStateID int, clientStateID int) GSTResult {
	result := GSTResult{SubtotalPaisa: subtotalPaisa}
	if subtotalPaisa <= 0 {
		result.TotalPaisa = subtotalPaisa
		return result
	}

	if photographerStateID != clientStateID {
		result.IsInterState = true
		result.IGSTPaisa = roundHalfUpPercent(subtotalPaisa, GSTRate)
	} else {
		result.IsInterState = false
		result.CGSTPaisa = roundHalfUpPercent(subtotalPaisa, GSTRate/2)
		result.SGSTPaisa = roundHalfUpPercent(subtotalPaisa, GSTRate/2)
	}

	result.TotalPaisa = subtotalPaisa + result.CGSTPaisa + result.SGSTPaisa + result.IGSTPaisa
	return result
}

// roundHalfUpPercent returns (amount * percent / 100) rounded half-up.
func roundHalfUpPercent(amount int64, percent int64) int64 {
	return (amount*percent + 50) / 100
}

// FormatAmount formats a paisa value as an INR string, e.g. 99900 → "₹999.00".
func FormatAmount(paisa int64) string {
	negative := ""
	if paisa < 0 {
		negative = "-"
		paisa = -paisa
	}
	rupees := paisa / 100
	remainder := paisa % 100
	return fmt.Sprintf("%s₹%d.%02d", negative, rupees, remainder)
}
