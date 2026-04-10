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
	// Struct now mirrors migration 033 alert_thresholds — warning/critical
	// thresholds rather than the prior operator/threshold/severity triple
	// which did not exist as columns in the database.
	svc := "api"
	a := AlertThreshold{
		ID:                uuid.New(),
		ServiceName:       &svc,
		MetricType:        "cpu",
		WarningThreshold:  75.0,
		CriticalThreshold: 90.0,
		Enabled:           true,
	}
	assert.Equal(t, "cpu", a.MetricType)
	assert.InDelta(t, 75.0, a.WarningThreshold, 0.01)
	assert.InDelta(t, 90.0, a.CriticalThreshold, 0.01)
	assert.True(t, a.Enabled)
}

func TestAlertThreshold_Disabled(t *testing.T) {
	a := AlertThreshold{Enabled: false}
	assert.False(t, a.Enabled)
}
