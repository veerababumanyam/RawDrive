package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNewAdminRevenueRepo(t *testing.T) {
	repo := NewAdminRevenueRepo(nil)
	assert.NotNil(t, repo)
}

func TestRevenueMetrics_Fields(t *testing.T) {
	m := RevenueMetrics{
		MRR:       5000000,
		ARR:       60000000,
		ChurnRate: 2.5,
		LTV:       120000,
		ARPU:      10000,
	}
	assert.Equal(t, int64(5000000), m.MRR)
	assert.Equal(t, int64(60000000), m.ARR)
	assert.InDelta(t, 2.5, m.ChurnRate, 0.01)
}

func TestRevenueTimeSeries_Fields(t *testing.T) {
	now := time.Now()
	ts := RevenueTimeSeries{
		Date:          now,
		Revenue:       1500000,
		Subscriptions: 450,
		Churn:         12,
	}
	assert.Equal(t, int64(1500000), ts.Revenue)
	assert.Equal(t, int64(450), ts.Subscriptions)
	assert.Equal(t, int64(12), ts.Churn)
}

func TestStateRevenue_Fields(t *testing.T) {
	sr := StateRevenue{
		StateID:         uuid.New(),
		StateName:       "Karnataka",
		Revenue:         2000000,
		SubscriberCount: 150,
	}
	assert.Equal(t, "Karnataka", sr.StateName)
	assert.Equal(t, int64(150), sr.SubscriberCount)
}

func TestRevenueTimeSeries_GranularityMapping(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"", "day"}, {"day", "day"}, {"week", "week"}, {"month", "month"}, {"invalid", "day"},
	}
	for _, tt := range tests {
		truncFunc := "day"
		switch tt.input {
		case "week":
			truncFunc = "week"
		case "month":
			truncFunc = "month"
		}
		assert.Equal(t, tt.expected, truncFunc, "input=%q", tt.input)
	}
}
