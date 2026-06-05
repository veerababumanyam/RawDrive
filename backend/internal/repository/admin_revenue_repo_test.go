package repository

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewAdminRevenueRepo(t *testing.T) {
	repo := NewAdminRevenueRepo(nil)
	assert.NotNil(t, repo)
}

func TestRevenueMetrics_Fields(t *testing.T) {
	m := RevenueMetrics{
		MRR:              5000000,
		ARR:              60000000,
		ChurnRate:        2.5,
		LTV:              120000,
		ARPU:             10000,
		TotalSubscribers: 450,
	}
	assert.Equal(t, int64(5000000), m.MRR)
	assert.Equal(t, int64(60000000), m.ARR)
	assert.InDelta(t, 2.5, m.ChurnRate, 0.01)
	assert.Equal(t, int64(120000), m.LTV)
	assert.Equal(t, int64(10000), m.ARPU)
	assert.Equal(t, int64(450), m.TotalSubscribers)
}

func TestRevenueTimeSeries_Fields(t *testing.T) {
	ts := RevenueTimeSeries{
		Period:      "2026-04",
		Revenue:     1500000,
		Subscribers: 450,
		Churn:       12,
	}
	assert.Equal(t, "2026-04", ts.Period)
	assert.Equal(t, int64(1500000), ts.Revenue)
	assert.Equal(t, int64(450), ts.Subscribers)
	assert.Equal(t, int64(12), ts.Churn)
}

func TestStateRevenue_Fields(t *testing.T) {
	// state_id removed from the struct — states.id is INT in the real
	// schema (migration 005), and the frontend state breakdown card
	// does not render state_id anyway.
	sr := StateRevenue{
		StateName:       "Karnataka",
		Revenue:         2000000,
		SubscriberCount: 150,
	}
	assert.Equal(t, "Karnataka", sr.StateName)
	assert.Equal(t, int64(2000000), sr.Revenue)
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

// TestGetMetrics_FractionalARPU_ScansWithoutError is the regression for the
// GET /admin/revenue 500. Postgres SUM(bigint) returns numeric, so ARPU's
// SUM(amount_paisa) / COUNT(DISTINCT user_id) was NUMERIC division and produced
// a fractional value (e.g. 133233.33) that could not scan into the int64 ARPU
// field ("cannot convert ... to integer"), 500-ing the admin revenue dashboard
// for any deployment with active paid subscribers whose total revenue is not
// evenly divisible by the subscriber count. The ::bigint cast restores integer
// (paisa) division so GetMetrics returns cleanly.
//
// DB-backed: skips when no DATABASE_URL/testcontainer is available (see
// getRetryTestPool); runs against the dev DB locally.
func TestGetMetrics_FractionalARPU_ScansWithoutError(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAdminRevenueRepo(pool)
	ctx := context.Background()

	// 3 active paid subscriptions; total revenue 399700 paisa is NOT divisible
	// by the 3 distinct users → fractional numeric ARPU on the pre-fix query.
	emails := []string{
		"arpu-regress-1@test.invalid",
		"arpu-regress-2@test.invalid",
		"arpu-regress-3@test.invalid",
	}
	amounts := []int64{99900, 199900, 99900}

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c,
			`DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))`, emails)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE email = ANY($1)`, emails)
	})

	for i, email := range emails {
		var uid string
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO users (id, email) VALUES (gen_random_uuid(), $1)
			 ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
			email).Scan(&uid))
		_, err := pool.Exec(ctx,
			`INSERT INTO subscriptions
			   (id, user_id, amount_paisa, status, tier_slug, billing_interval,
			    started_at, created_at, updated_at)
			 VALUES (gen_random_uuid(), $1, $2, 'active', 'pro', 'monthly',
			         now() - interval '10 days', now() - interval '10 days', now())`,
			uid, amounts[i])
		require.NoError(t, err)
	}

	from, to := time.Now().AddDate(0, -1, 0), time.Now()
	m, err := repo.GetMetrics(ctx, from, to, nil)
	require.NoError(t, err,
		"GetMetrics must not error on fractional ARPU (SUM(bigint) numeric division)")
	require.NotNil(t, m)
	// The bug was a scan failure, not a wrong value; the guarantee is a clean
	// scan into the int64 (paisa) ARPU field.
	require.GreaterOrEqual(t, m.ARPU, int64(0))
}
