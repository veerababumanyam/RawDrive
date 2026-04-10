package service

// print_preflight_test.go — pure-logic tests for the DPI preflight.
// Everything is arithmetic, so full coverage is trivial.

import "testing"

func TestEvaluatePrintPreflight_Excellent300DPI(t *testing.T) {
	// 8x10 print at exactly 300 DPI → need 2400x3000.
	res := EvaluatePrintPreflight(PrintPreflightRequest{
		SourceWidthPx:  2400,
		SourceHeightPx: 3000,
		PrintWidthIn:   8,
		PrintHeightIn:  10,
	}, 300)
	if res.Quality != PrintQualityExcellent {
		t.Errorf("want excellent, got %s", res.Quality)
	}
	if res.EffectiveDPI != 300 {
		t.Errorf("effective DPI: want 300, got %d", res.EffectiveDPI)
	}
	if res.Shortfall {
		t.Errorf("should not be a shortfall at exactly 300 DPI")
	}
}

func TestEvaluatePrintPreflight_Shortfall(t *testing.T) {
	// 16x20 poster from a 1200x1600 source → 75x80 DPI
	res := EvaluatePrintPreflight(PrintPreflightRequest{
		SourceWidthPx:  1200,
		SourceHeightPx: 1600,
		PrintWidthIn:   16,
		PrintHeightIn:  20,
	}, 300)
	if res.Quality != PrintQualityFail {
		t.Errorf("want fail, got %s", res.Quality)
	}
	if !res.Shortfall {
		t.Errorf("should detect shortfall")
	}
	if res.EffectiveDPI != 75 {
		t.Errorf("effective DPI: want 75, got %d", res.EffectiveDPI)
	}
}

func TestEvaluatePrintPreflight_Acceptable200DPI(t *testing.T) {
	// 10x15 print from a 2000x3000 source → exactly 200 DPI
	res := EvaluatePrintPreflight(PrintPreflightRequest{
		SourceWidthPx:  2000,
		SourceHeightPx: 3000,
		PrintWidthIn:   10,
		PrintHeightIn:  15,
	}, 300)
	if res.Quality != PrintQualityAcceptable {
		t.Errorf("want acceptable, got %s", res.Quality)
	}
	if res.EffectiveDPI != 200 {
		t.Errorf("effective DPI: want 200, got %d", res.EffectiveDPI)
	}
}

func TestEvaluatePrintPreflight_InvalidDimensions(t *testing.T) {
	cases := []PrintPreflightRequest{
		{SourceWidthPx: 0, SourceHeightPx: 100, PrintWidthIn: 4, PrintHeightIn: 6},
		{SourceWidthPx: 100, SourceHeightPx: 0, PrintWidthIn: 4, PrintHeightIn: 6},
		{SourceWidthPx: 100, SourceHeightPx: 100, PrintWidthIn: 0, PrintHeightIn: 6},
		{SourceWidthPx: 100, SourceHeightPx: 100, PrintWidthIn: 4, PrintHeightIn: -1},
	}
	for _, c := range cases {
		res := EvaluatePrintPreflight(c, 300)
		if res.Quality != PrintQualityFail {
			t.Errorf("case %+v: want fail, got %s", c, res.Quality)
		}
	}
}

func TestEvaluatePrintPreflight_DefaultTargetDPI(t *testing.T) {
	// targetDPI=0 should default to 300
	res := EvaluatePrintPreflight(PrintPreflightRequest{
		SourceWidthPx:  1200,
		SourceHeightPx: 1800,
		PrintWidthIn:   4,
		PrintHeightIn:  6,
	}, 0)
	// 1200/4 = 300 DPI → excellent
	if res.Quality != PrintQualityExcellent {
		t.Errorf("want excellent with default 300 DPI, got %s", res.Quality)
	}
	if res.RequiredWidth != 1200 {
		t.Errorf("required width: want 1200, got %d", res.RequiredWidth)
	}
}

func TestEvaluatePrintPreflight_EffectiveDPIIsBottleneck(t *testing.T) {
	// Source is 3000x1000, print 10x10. Width = 300 DPI, Height = 100 DPI.
	// Effective should be the smaller = 100.
	res := EvaluatePrintPreflight(PrintPreflightRequest{
		SourceWidthPx:  3000,
		SourceHeightPx: 1000,
		PrintWidthIn:   10,
		PrintHeightIn:  10,
	}, 300)
	if res.WidthDPI != 300 || res.HeightDPI != 100 {
		t.Errorf("per-axis DPI mismatch: w=%d h=%d", res.WidthDPI, res.HeightDPI)
	}
	if res.EffectiveDPI != 100 {
		t.Errorf("effective should be min(w,h)=100, got %d", res.EffectiveDPI)
	}
	if res.Quality != PrintQualityFail {
		t.Errorf("want fail at 100 DPI, got %s", res.Quality)
	}
}

func TestClassifyDPI_AllBuckets(t *testing.T) {
	cases := []struct {
		dpi  int
		want PrintQualityLevel
	}{
		{400, PrintQualityExcellent},
		{300, PrintQualityExcellent},
		{299, PrintQualityGood},
		{240, PrintQualityGood},
		{239, PrintQualityAcceptable},
		{180, PrintQualityAcceptable},
		{179, PrintQualityWarning},
		{150, PrintQualityWarning},
		{149, PrintQualityFail},
		{50, PrintQualityFail},
	}
	for _, c := range cases {
		got, _ := classifyDPI(c.dpi)
		if got != c.want {
			t.Errorf("dpi=%d: want %s, got %s", c.dpi, c.want, got)
		}
	}
}
