package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewStorageAccounting(t *testing.T) {
	svc := NewStorageAccounting(nil)
	assert.NotNil(t, svc)
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
