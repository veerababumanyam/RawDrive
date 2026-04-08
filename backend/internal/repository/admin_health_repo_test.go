package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNewAdminHealthRepo(t *testing.T) {
	repo := NewAdminHealthRepo(nil)
	assert.NotNil(t, repo)
}

func TestHealthStatus_Fields(t *testing.T) {
	now := time.Now()
	s := HealthStatus{
		ServiceName: "api",
		Status:      "healthy",
		Uptime:      99.99,
		LastCheck:   now,
	}
	assert.Equal(t, "api", s.ServiceName)
	assert.Equal(t, "healthy", s.Status)
	assert.InDelta(t, 99.99, s.Uptime, 0.01)
}

func TestMetricPoint_Fields(t *testing.T) {
	now := time.Now()
	p := MetricPoint{
		Timestamp: now,
		Value:     95.5,
		Unit:      "percent",
	}
	assert.Equal(t, now, p.Timestamp)
	assert.InDelta(t, 95.5, p.Value, 0.01)
	assert.Equal(t, "percent", p.Unit)
}

func TestAlertThreshold_Fields(t *testing.T) {
	a := AlertThreshold{
		ID:          uuid.New(),
		ServiceName: "api",
		MetricType:  "cpu_usage",
		Operator:    ">",
		Threshold:   90.0,
		Severity:    "critical",
		Enabled:     true,
	}
	assert.Equal(t, "cpu_usage", a.MetricType)
	assert.InDelta(t, 90.0, a.Threshold, 0.01)
	assert.Equal(t, "critical", a.Severity)
	assert.True(t, a.Enabled)
}

func TestAlertThreshold_Disabled(t *testing.T) {
	a := AlertThreshold{Enabled: false}
	assert.False(t, a.Enabled)
}
