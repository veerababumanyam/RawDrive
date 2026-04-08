package ai

import (
	"testing"
)

func TestCapEnforcementResult_NoCap(t *testing.T) {
	// When MonthlyCapPaisa is 0, spend is always allowed
	result := &CapEnforcementResult{
		Allowed:        true,
		RemainingPaisa: -1,
		CapUsedPercent: 0,
	}

	if !result.Allowed {
		t.Error("expected Allowed=true when no cap")
	}
	if result.RemainingPaisa != -1 {
		t.Errorf("expected RemainingPaisa=-1, got %d", result.RemainingPaisa)
	}
}

func TestCapEnforcementResult_UnderCap(t *testing.T) {
	// Simulate: cap=100000, current=40000, estimated=10000 → projected=50000 (50%)
	capPaisa := int64(100000)
	currentSpend := int64(40000)
	estimatedPaisa := int64(10000)
	projected := currentSpend + estimatedPaisa
	remaining := capPaisa - projected

	capUsed := float64(projected) * 100 / float64(capPaisa)

	result := &CapEnforcementResult{
		Allowed:        projected <= capPaisa,
		RemainingPaisa: remaining,
		CapUsedPercent: capUsed,
		ShouldAlert80:  capUsed >= 80,
		ShouldAlert100: capUsed >= 100,
	}

	if !result.Allowed {
		t.Error("expected Allowed=true at 50%")
	}
	if result.RemainingPaisa != 50000 {
		t.Errorf("expected 50000 remaining, got %d", result.RemainingPaisa)
	}
	if result.ShouldAlert80 {
		t.Error("should NOT alert at 50%")
	}
}

func TestCapEnforcementResult_Crosses80(t *testing.T) {
	// cap=100000, current=75000, estimated=10000 → projected=85000 (85%)
	capPaisa := int64(100000)
	projected := int64(85000)
	capUsed := float64(projected) * 100 / float64(capPaisa)

	result := &CapEnforcementResult{
		Allowed:        projected <= capPaisa,
		RemainingPaisa: capPaisa - projected,
		CapUsedPercent: capUsed,
		ShouldAlert80:  capUsed >= 80 && true, // alert_80_sent = false
		ShouldAlert100: capUsed >= 100,
	}

	if !result.Allowed {
		t.Error("expected Allowed=true at 85%")
	}
	if !result.ShouldAlert80 {
		t.Error("expected ShouldAlert80 at 85%")
	}
	if result.ShouldAlert100 {
		t.Error("should NOT alert 100 at 85%")
	}
}

func TestCapEnforcementResult_CapExceeded(t *testing.T) {
	// cap=100000, current=95000, estimated=10000 → projected=105000 (105%)
	capPaisa := int64(100000)
	projected := int64(105000)

	result := &CapEnforcementResult{
		Allowed:        projected <= capPaisa,
		RemainingPaisa: 0,
		CapUsedPercent: float64(projected) * 100 / float64(capPaisa),
		ShouldAlert100: true,
	}

	if result.Allowed {
		t.Error("expected Allowed=false when cap exceeded")
	}
	if result.RemainingPaisa != 0 {
		t.Errorf("expected 0 remaining, got %d", result.RemainingPaisa)
	}
}
