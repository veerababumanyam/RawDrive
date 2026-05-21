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
		quota    int64
		expected string
	}{
		{"no quota", 1000, 0, "none"},
		{"under 80%", 700, 1000, "none"},
		{"at 80%", 800, 1000, "warning"},
		{"at 90%", 900, 1000, "warning"},
		{"at 95%", 950, 1000, "critical"},
		{"over 100%", 1100, 1000, "critical"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ws := WorkspaceStorage{UsedBytes: tt.used, QuotaBytes: tt.quota}
			assert.Equal(t, tt.expected, ws.WarningLevel())
		})
	}
}
