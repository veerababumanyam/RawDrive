package repository

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminAnalyticsRepo(t *testing.T) {
	repo := NewAdminAnalyticsRepo(nil)
	assert.NotNil(t, repo)
}

func TestActiveUserMetrics_Fields(t *testing.T) {
	m := ActiveUserMetrics{DAU: 1200, WAU: 5400, MAU: 18000}
	assert.Equal(t, int64(1200), m.DAU)
	assert.Equal(t, int64(5400), m.WAU)
	assert.Equal(t, int64(18000), m.MAU)
}

func TestAnalyticsFeatureAdoption_Fields(t *testing.T) {
	f := AnalyticsFeatureAdoption{
		Feature:     "Client Galleries",
		AdoptionPct: 72.0,
		ActiveUsers: 13000,
	}
	assert.Equal(t, "Client Galleries", f.Feature)
	assert.InDelta(t, 72.0, f.AdoptionPct, 0.01)
	assert.Equal(t, int64(13000), f.ActiveUsers)
}

func TestGrowthTimeSeriesPoint_Fields(t *testing.T) {
	now := time.Now()
	p := GrowthTimeSeriesPoint{Date: now, NewUsers: 42, Cumulative: 10042}
	assert.Equal(t, now, p.Date)
	assert.Equal(t, int64(42), p.NewUsers)
	assert.Equal(t, int64(10042), p.Cumulative)
}
