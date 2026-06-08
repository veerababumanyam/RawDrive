package service

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPlanCatalogEntryJSONUsesSnakeCaseKeys(t *testing.T) {
	body, err := json.Marshal(PlanCatalogEntry{
		Tier:              "creator",
		Name:              "Creator",
		MonthlyPricePaise: 49900,
		AnnualPricePaise:  499000,
		QuotaBytes:        100 * (1 << 30),
		GalleryLimit:      10,
		ClientLimit:       -1,
		Features:          []string{"AI face search"},
		Popular:           false,
		Rank:              2,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
		TrialDays:         0,
	})

	require.NoError(t, err)
	require.JSONEq(t, `{
		"tier":"creator",
		"name":"Creator",
		"description":"",
		"currency":"",
		"monthly_price_paise":49900,
		"annual_price_paise":499000,
		"quota_bytes":107374182400,
		"gallery_limit":10,
		"client_limit":-1,
		"features":["AI face search"],
		"popular":false,
		"rank":2,
		"paid":true,
		"active":true,
		"self_serve":true,
		"trial_days":0
	}`, string(body))
	require.NotContains(t, string(body), "MonthlyPricePaise")
}

func TestIsSelfServePaidPlanTierExcludesPayPerEvent(t *testing.T) {
	require.True(t, IsSelfServePaidPlanTier("creator"))
	require.True(t, IsSelfServePaidPlanTier("pro_photographer"))
	require.True(t, IsSelfServePaidPlanTier("studio"))
	require.False(t, IsSelfServePaidPlanTier("free"))
	require.False(t, IsSelfServePaidPlanTier("pay_per_event"))
	require.False(t, IsSelfServePaidPlanTier("elite_studio"))
}

func TestPlanCatalogFallbackHasOneFeaturedPlan(t *testing.T) {
	var popular []string
	for _, plan := range PlanCatalog() {
		if plan.Popular {
			popular = append(popular, plan.Tier)
		}
	}
	require.Equal(t, []string{"studio"}, popular)
}
