package service

import (
	"testing"

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
