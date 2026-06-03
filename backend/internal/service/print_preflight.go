package service

// print_preflight.go — M14 GAL-FR-160: print DPI quality check.
//
// When a client orders a print product, we need to warn them if the
// source image resolution won't produce a crisp print at the chosen
// size. This is a classic DPI (dots-per-inch) check:
//
//   required_pixels = print_inches * target_dpi
//
// For a 4×6 print at 300 DPI we need 1200×1800 pixels. If the source
// asset is smaller, the client sees a "Low resolution" warning with
// the actual effective DPI. The industry convention:
//
//   >= 300 DPI  : excellent
//   240-299 DPI : good
//   180-239 DPI : acceptable
//   150-179 DPI : warning
//   <  150 DPI  : fail
//
// This is pure logic — no repo dependency — so it's easy to test.

// PrintQualityLevel is a classification of a print preflight result.
type PrintQualityLevel string

const (
	PrintQualityExcellent  PrintQualityLevel = "excellent"
	PrintQualityGood       PrintQualityLevel = "good"
	PrintQualityAcceptable PrintQualityLevel = "acceptable"
	PrintQualityWarning    PrintQualityLevel = "warning"
	PrintQualityFail       PrintQualityLevel = "fail"
)

// PrintPreflightRequest is the input: source pixel dimensions plus the
// target print size in inches (half-inch precision is fine).
type PrintPreflightRequest struct {
	SourceWidthPx  int     `json:"source_width_px"`
	SourceHeightPx int     `json:"source_height_px"`
	PrintWidthIn   float64 `json:"print_width_in"`
	PrintHeightIn  float64 `json:"print_height_in"`
}

// PrintPreflightResult holds the computed DPI and a recommendation.
type PrintPreflightResult struct {
	WidthDPI       int               `json:"width_dpi"`
	HeightDPI      int               `json:"height_dpi"`
	EffectiveDPI   int               `json:"effective_dpi"`
	Quality        PrintQualityLevel `json:"quality"`
	Message        string            `json:"message"`
	RequiredWidth  int               `json:"required_width_px"`
	RequiredHeight int               `json:"required_height_px"`
	Shortfall      bool              `json:"shortfall"`
}

// EvaluatePrintPreflight runs the DPI check and classifies the result.
// targetDPI defaults to 300 when <= 0.
func EvaluatePrintPreflight(req PrintPreflightRequest, targetDPI int) PrintPreflightResult {
	if targetDPI <= 0 {
		targetDPI = 300
	}
	if req.PrintWidthIn <= 0 || req.PrintHeightIn <= 0 || req.SourceWidthPx <= 0 || req.SourceHeightPx <= 0 {
		return PrintPreflightResult{
			Quality: PrintQualityFail,
			Message: "invalid dimensions: all values must be positive",
		}
	}

	widthDPI := int(float64(req.SourceWidthPx) / req.PrintWidthIn)
	heightDPI := int(float64(req.SourceHeightPx) / req.PrintHeightIn)
	// Effective DPI is the bottleneck (whichever axis is worse).
	effective := widthDPI
	if heightDPI < effective {
		effective = heightDPI
	}

	requiredW := int(float64(targetDPI) * req.PrintWidthIn)
	requiredH := int(float64(targetDPI) * req.PrintHeightIn)
	shortfall := req.SourceWidthPx < requiredW || req.SourceHeightPx < requiredH

	quality, msg := classifyDPI(effective)

	return PrintPreflightResult{
		WidthDPI:       widthDPI,
		HeightDPI:      heightDPI,
		EffectiveDPI:   effective,
		Quality:        quality,
		Message:        msg,
		RequiredWidth:  requiredW,
		RequiredHeight: requiredH,
		Shortfall:      shortfall,
	}
}

// classifyDPI maps an effective DPI to a quality level and message.
func classifyDPI(dpi int) (PrintQualityLevel, string) {
	switch {
	case dpi >= 300:
		return PrintQualityExcellent, "Print quality: excellent — meets 300 DPI target"
	case dpi >= 240:
		return PrintQualityGood, "Print quality: good"
	case dpi >= 180:
		return PrintQualityAcceptable, "Print quality: acceptable but not ideal"
	case dpi >= 150:
		return PrintQualityWarning, "Print quality: marginal — softness may be visible"
	default:
		return PrintQualityFail, "Print quality: too low — recommend smaller print size"
	}
}
