package service

import (
	"encoding/json"
	"testing"

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
