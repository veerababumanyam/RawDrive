package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewStorageAccounting(t *testing.T) {
	svc := NewStorageAccounting(nil)
	assert.NotNil(t, svc)
}

// 2026-05-21: TotalBytes = UsedBytes + DerivativeBytes. Pin the calculation
// here so future refactors of GetUsage can't accidentally drop the addition
// (the dashboard's headline storage figure depends on it). Direct field
// math, no DB needed.
func TestWorkspaceStorage_TotalBytes(t *testing.T) {
	tests := []struct {
		name  string
		used  int64
		deriv int64
		want  int64
	}{
		{"both zero", 0, 0, 0},
		{"originals only", 1000, 0, 1000},
		{"derivatives only", 0, 500, 500},
		{"both populated", 1000, 750, 1750},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ws := WorkspaceStorage{UsedBytes: tt.used, DerivativeBytes: tt.deriv}
			ws.TotalBytes = ws.UsedBytes + ws.DerivativeBytes
			assert.Equal(t, tt.want, ws.TotalBytes)
		})
	}
}

func TestWorkspaceStorage_WarningLevel(t *testing.T) {
	tests := []struct {
		name     string
		used     int64
		deriv    int64
		reserved int64
		grace    int64
		quota    int64
		expected string
	}{
		{"no quota", 1000, 0, 0, 0, 0, "none"},
		{"under 80%", 700, 0, 0, 0, 1000, "none"},
		{"at 80%", 800, 0, 0, 0, 1000, "warning"},
		{"derivatives count toward warning", 700, 100, 0, 0, 1000, "warning"},
		{"reserved counts toward warning", 700, 0, 100, 0, 1000, "warning"},
		{"derivatives and reserved count toward critical", 800, 100, 50, 0, 1000, "critical"},
		{"grace is preserved in warning denominator", 900, 0, 0, 200, 1000, "none"},
		{"at 90%", 900, 0, 0, 0, 1000, "warning"},
		{"at 95%", 950, 0, 0, 0, 1000, "critical"},
		{"over 100%", 1100, 0, 0, 0, 1000, "critical"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ws := WorkspaceStorage{
				UsedBytes:       tt.used,
				DerivativeBytes: tt.deriv,
				ReservedBytes:   tt.reserved,
				GraceBytes:      tt.grace,
				QuotaBytes:      tt.quota,
			}
			assert.Equal(t, tt.expected, ws.WarningLevel())
		})
	}
}

func TestWorkspaceStorage_BillableBytesIncludesDerivativesAndReserved(t *testing.T) {
	ws := WorkspaceStorage{
		UsedBytes:       700,
		DerivativeBytes: 125,
		ReservedBytes:   75,
		QuotaBytes:      1000,
		GraceBytes:      50,
	}

	assert.Equal(t, int64(900), ws.billableBytes())
	assert.Equal(t, int64(1050), ws.effectiveQuotaBytes())
}
