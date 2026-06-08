package service

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMarshalJSONMapReturnsTextJSONForJsonbParameters(t *testing.T) {
	payload, err := marshalJSONMap(map[string]any{
		"tier":     "creator",
		"features": []string{"AI face search", "Photo selling"},
	})

	require.NoError(t, err)
	require.JSONEq(t, `{"tier":"creator","features":["AI face search","Photo selling"]}`, payload)
	require.True(t, json.Valid([]byte(payload)))
}

func TestValidateGovernedPlanPreservesStarterAndPayPerEventInvariants(t *testing.T) {
	require.NoError(t, validateGovernedPlan(PlanCatalogEntry{
		Tier:              "free",
		Name:              "Starter",
		MonthlyPricePaise: 0,
		AnnualPricePaise:  0,
		Paid:              false,
		Active:            true,
		SelfServe:         true,
	}))

	require.ErrorContains(t, validateGovernedPlan(PlanCatalogEntry{
		Tier:              "free",
		Name:              "Starter",
		MonthlyPricePaise: 100,
		AnnualPricePaise:  0,
		Paid:              false,
		Active:            true,
		SelfServe:         true,
	}), "starter/free plan cannot be made paid")

	require.ErrorContains(t, validateGovernedPlan(PlanCatalogEntry{
		Tier:      "pay_per_event",
		Name:      "Pay Per Event",
		Paid:      true,
		Active:    true,
		SelfServe: true,
	}), "pay per event cannot be a subscription signup or upgrade target")
}

func TestBillingProductFromMapAcceptsStructuredProductMetadata(t *testing.T) {
	product, err := billingProductFromMap(map[string]any{
		"code":             "event_upload_standard",
		"product_type":     "event_upload",
		"name":             "Event upload",
		"description":      "One-off upload cycle.",
		"currency":         "inr",
		"price_paise":      float64(19900),
		"billing_interval": "one_time",
		"metadata": map[string]any{
			"active_days":        float64(30),
			"upload_window_days": float64(30),
			"retention_days":     float64(30),
			"upload_credits":     float64(500),
			"quota_bytes":        float64(10 * 1024 * 1024 * 1024),
		},
		"rank":   float64(10),
		"active": true,
	})

	require.NoError(t, err)
	require.Equal(t, "event_upload_standard", product.Code)
	require.Equal(t, "event_upload", product.ProductType)
	require.Equal(t, "INR", product.Currency)
	require.Equal(t, int64(19900), product.PricePaise)
	require.Equal(t, "one_time", product.BillingInterval)
	require.Equal(t, 10, product.Rank)
	require.True(t, product.Active)
	require.Equal(t, float64(30), product.Metadata["active_days"])
	require.Equal(t, float64(500), product.Metadata["upload_credits"])
	require.Equal(t, float64(10*1024*1024*1024), product.Metadata["quota_bytes"])
}

func TestBillingProductFromMapRejectsInvalidPaymentCriticalFields(t *testing.T) {
	_, err := billingProductFromMap(map[string]any{
		"code":             "event_upload_standard",
		"product_type":     "event_upload",
		"name":             "Event upload",
		"price_paise":      float64(-1),
		"billing_interval": "one_time",
	})
	require.ErrorContains(t, err, "price_paise must be non-negative")

	_, err = billingProductFromMap(map[string]any{
		"code":             "event_upload_standard",
		"product_type":     "event_upload",
		"name":             "Event upload",
		"price_paise":      float64(19900),
		"billing_interval": "weekly",
	})
	require.ErrorContains(t, err, "invalid billing interval")

	_, err = billingProductFromMap(map[string]any{
		"code":             "event_upload_standard",
		"product_type":     "subscription_plan",
		"name":             "Event upload",
		"price_paise":      float64(19900),
		"billing_interval": "one_time",
	})
	require.ErrorContains(t, err, "invalid product type")
}

func TestBillingProductFromMapRejectsActiveEventProductWithoutQuota(t *testing.T) {
	_, err := billingProductFromMap(map[string]any{
		"code":             "event_upload_standard",
		"product_type":     "event_upload",
		"name":             "Event upload",
		"price_paise":      float64(19900),
		"billing_interval": "one_time",
		"metadata": map[string]any{
			"active_days":        float64(30),
			"upload_window_days": float64(30),
			"retention_days":     float64(30),
		},
		"active": true,
	})
	require.ErrorContains(t, err, "quota_bytes")
}

func TestBillingProductFromMapRejectsEventRetentionAboveThirtyDays(t *testing.T) {
	_, err := billingProductFromMap(map[string]any{
		"code":             "event_upload_wedding",
		"product_type":     "event_upload",
		"name":             "Wedding upload",
		"price_paise":      float64(49900),
		"billing_interval": "one_time",
		"metadata": map[string]any{
			"active_days":        float64(60),
			"upload_window_days": float64(60),
			"retention_days":     float64(90),
			"quota_bytes":        float64(50 * 1024 * 1024 * 1024),
		},
		"active": true,
	})
	require.ErrorContains(t, err, "active_days between 1 and 30")
}

func TestPricingChangePlanDirectPublishCastsNilEffectiveFrom(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool := getServiceTestPool(t)
	svc := NewPricingChangeRequestService(pool)
	tier := fmt.Sprintf("codex_sqltype_%d", time.Now().UnixNano())

	cleanup := func() {
		_, _ = pool.Exec(context.Background(), `
			DELETE FROM pricing_email_batches
			 WHERE pricing_change_request_id IN (
				SELECT id FROM pricing_change_requests WHERE target_type = 'subscription_plan' AND target_key = $1
			 )`, tier)
		_, _ = pool.Exec(context.Background(), `
			DELETE FROM pricing_audit_events WHERE target_type = 'subscription_plan' AND target_key = $1`, tier)
		_, _ = pool.Exec(context.Background(), `
			DELETE FROM pricing_change_requests WHERE target_type = 'subscription_plan' AND target_key = $1`, tier)
		_, _ = pool.Exec(context.Background(), `DELETE FROM subscription_plan_versions WHERE tier = $1`, tier)
		_, _ = pool.Exec(context.Background(), `DELETE FROM subscription_plans WHERE tier = $1`, tier)
	}
	cleanup()
	t.Cleanup(cleanup)

	var rank int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COALESCE(MAX(rank), 0) + 1 FROM subscription_plans`).Scan(&rank))

	after := map[string]any{
		"tier":                tier,
		"name":                "Codex SQL Type Plan",
		"description":         "Regression plan for direct publish SQL parameter typing.",
		"currency":            "INR",
		"monthly_price_paise": int64(12300),
		"annual_price_paise":  int64(123000),
		"quota_bytes":         int64(10 * 1024 * 1024 * 1024),
		"gallery_limit":       5,
		"client_limit":        10,
		"features":            []string{"SQL parameter typing"},
		"popular":             false,
		"paid":                true,
		"active":              true,
		"self_serve":          true,
		"trial_days":          0,
		"rank":                rank,
	}

	created, err := svc.Create(ctx, CreatePricingChangeRequestInput{
		RequestType:   "plan_create",
		TargetType:    "subscription_plan",
		TargetKey:     tier,
		BeforeState:   map[string]any{"tier": tier},
		AfterState:    after,
		ImpactSummary: map[string]any{"rank": rank},
		EmailPreview:  map[string]any{"notice_required": false},
	})
	require.NoError(t, err)

	submitted, err := svc.Submit(ctx, created.ID, nil)
	require.NoError(t, err)
	require.Equal(t, "pending_approval", submitted.Status)

	approved, err := svc.Approve(ctx, submitted.ID, nil, "Super admin direct publish", nil)
	require.NoError(t, err)
	require.Equal(t, "approved", approved.Status)
	require.NotNil(t, approved.EffectiveFrom)

	published, err := svc.Publish(ctx, approved.ID, nil)
	require.NoError(t, err)
	require.Equal(t, "published", published.Status)

	var planVersionCount int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM subscription_plan_versions WHERE tier = $1 AND status = 'approved'
	`, tier).Scan(&planVersionCount))
	require.Equal(t, 1, planVersionCount)
}
