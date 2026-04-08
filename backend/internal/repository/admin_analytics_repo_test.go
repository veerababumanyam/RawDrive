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

func TestEngagementMetrics_Fields(t *testing.T) {
	m := EngagementMetrics{
		Uploads:           3500,
		GalleriesCreated:  120,
		ClientInvitations: 45,
	}
	assert.Equal(t, int64(3500), m.Uploads)
	assert.Equal(t, int64(120), m.GalleriesCreated)
	assert.Equal(t, int64(45), m.ClientInvitations)
}

func TestFeatureAdoption_Fields(t *testing.T) {
	f := FeatureAdoption{
		FeatureName: "AI Tagging",
		Percentage:  72.0,
		UserCount:   13000,
	}
	assert.Equal(t, "AI Tagging", f.FeatureName)
	assert.InDelta(t, 72.0, f.Percentage, 0.01)
	assert.Equal(t, int64(13000), f.UserCount)
}

func TestTimeSeriesPoint_Fields(t *testing.T) {
	now := time.Now()
	p := TimeSeriesPoint{Date: now, Value: 42}
	assert.Equal(t, now, p.Date)
	assert.Equal(t, int64(42), p.Value)
}
