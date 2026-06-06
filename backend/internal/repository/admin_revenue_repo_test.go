package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
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

func TestRevenueRecordAndDealer_Fields(t *testing.T) {
	dealerID := uuid.New()
	record := RevenueRecord{
		StateID:         12,
		StateName:       "Karnataka",
		District:        "Bengaluru Urban",
		Revenue:         2000000,
		SubscriberCount: 150,
	}
	dealer := RevenueReportDealer{
		DealerID:          dealerID,
		BusinessName:      "RawDrive Karnataka",
		Email:             "dealer@example.test",
		CommissionRatePct: 20,
	}

	assert.Equal(t, 12, record.StateID)
	assert.Equal(t, "Bengaluru Urban", record.District)
	assert.Equal(t, int64(2000000), record.Revenue)
	assert.Equal(t, dealerID, dealer.DealerID)
	assert.Equal(t, "dealer@example.test", dealer.Email)
	assert.Equal(t, float64(20), dealer.CommissionRatePct)
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

// TestGetByState_RevenueAttributedByWorkspaceState is the regression for the
// GET /admin/revenue/states "revenue_paisa: 0 for every state" bug. A
// subscription's state is NOT on the subscription row — subscriptions.state_id
// is NULL on every real (revenue-bearing) subscription and is only populated on
// comped/test rows. The state lives on the subscription's WORKSPACE
// (subscriptions.workspace_id → workspaces.state_id). GetByState used to join on
// subscriptions.state_id, so all real revenue fell out and every state showed 0.
//
// It creates a workspace carrying a real state_id and an active paid subscription
// whose OWN state_id is left NULL, then asserts that state's revenue rises by
// exactly the subscription amount. Pre-fix: the NULL-state_id join drops it →
// delta 0 → fail. Fixed: attribution routes through the workspace → delta ==
// amount. Delta-based so it's robust against any pre-existing data.
//
// Self-contained (creates its own state-tagged workspace) so it runs in the CI
// testcontainer, not just a populated dev DB. The workspace name is unique per
// run, and cleanup is best-effort in FK-safe order: in a fresh testcontainer it
// removes everything; in a dev DB whose audit_logs→workspaces FK blocks workspace
// deletes it harmlessly leaves a 0-revenue workspace behind (its subscription is
// deleted), and the unique name means re-runs never collide.
//
// DB-backed: skips when no DATABASE_URL/testcontainer is available.
func TestGetByState_RevenueAttributedByWorkspaceState(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAdminRevenueRepo(pool)
	ctx := context.Background()

	// A real, seeded state (migration 010 seeds Indian states).
	var stateID int
	var stateName string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT id, name FROM states ORDER BY id LIMIT 1`).Scan(&stateID, &stateName))

	email := fmt.Sprintf("revstate-ws-%d@test.invalid", time.Now().UnixNano())
	wsName := fmt.Sprintf("rev-state-ws-test-%d", time.Now().UnixNano())
	const amount = int64(13579)
	var userID, wsID string

	t.Cleanup(func() {
		c := context.Background()
		// FK-safe order; ignore errors (dev-DB audit_logs FK may block the ws delete).
		_, _ = pool.Exec(c, `DELETE FROM subscriptions WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM audit_logs WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE email = $1`, email)
	})

	// stateRevenue reads the current GetByState revenue for our target state.
	stateRevenue := func() int64 {
		rows, err := repo.GetByState(ctx, time.Now().AddDate(0, -1, 0), time.Now())
		require.NoError(t, err)
		for _, r := range rows {
			if r.StateName == stateName {
				return r.Revenue
			}
		}
		t.Fatalf("state %q absent from GetByState output", stateName)
		return 0
	}

	before := stateRevenue()

	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (id, email) VALUES (gen_random_uuid(), $1) RETURNING id`,
		email).Scan(&userID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (owner_id, name, state_id) VALUES ($1, $2, $3) RETURNING id`,
		userID, wsName, stateID).Scan(&wsID))
	// state_id deliberately left NULL on the subscription — the pre-fix query
	// joined on it, which is exactly why real revenue showed 0. workspace_id carries it.
	_, err := pool.Exec(ctx,
		`INSERT INTO subscriptions
		   (id, user_id, workspace_id, amount_paisa, status, tier_slug, billing_interval,
		    started_at, created_at, updated_at)
		 VALUES (gen_random_uuid(), $1, $2, $3, 'active', 'creator', 'monthly',
		         now() - interval '5 days', now() - interval '5 days', now())`,
		userID, wsID, amount)
	require.NoError(t, err)

	after := stateRevenue()

	require.Equal(t, before+amount, after,
		"state %q revenue must include the subscription via its workspace's state "+
			"(workspace_id → workspaces.state_id), not subscriptions.state_id", stateName)
}
