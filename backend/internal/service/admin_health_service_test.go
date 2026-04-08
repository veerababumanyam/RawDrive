package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminHealthService_Constructor(t *testing.T) {
	svc := NewAdminHealthService(nil)
	assert.NotNil(t, svc)
	assert.Nil(t, svc.healthRepo)
}

func TestSystemStatus_ZeroValue(t *testing.T) {
	var s SystemStatus
	assert.Empty(t, s.Overall)
	assert.Nil(t, s.Services)
	assert.True(t, s.CheckedAt.IsZero())
}

func TestServiceStatus_Fields(t *testing.T) {
	s := ServiceStatus{Name: "api", Status: "healthy", Latency: 12.5}
	assert.Equal(t, "api", s.Name)
	assert.Equal(t, "healthy", s.Status)
	assert.InDelta(t, 12.5, s.Latency, 0.001)
}
