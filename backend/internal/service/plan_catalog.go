package service

// PlanCatalogEntry is the backend source of truth for subscription pricing and
// storage quota. Prices are paise (INR x 100); quota is bytes.
type PlanCatalogEntry struct {
	Tier              string
	Name              string
	MonthlyPricePaise int64
	AnnualPricePaise  int64
	QuotaBytes        int64
	Rank              int
	Paid              bool
}

var planCatalog = []PlanCatalogEntry{
	{Tier: "free", Name: "Free", MonthlyPricePaise: 0, AnnualPricePaise: 0, QuotaBytes: 1 << 30, Rank: 0, Paid: false},
	{Tier: "starter", Name: "Starter", MonthlyPricePaise: 9900, AnnualPricePaise: 99000, QuotaBytes: 30 * (1 << 30), Rank: 1, Paid: true},
	{Tier: "professional", Name: "Professional", MonthlyPricePaise: 29900, AnnualPricePaise: 299000, QuotaBytes: 300 * (1 << 30), Rank: 2, Paid: true},
	{Tier: "business", Name: "Business", MonthlyPricePaise: 299900, AnnualPricePaise: 2999000, QuotaBytes: 3 * (1 << 40), Rank: 3, Paid: true},
	{Tier: "enterprise", Name: "Enterprise", MonthlyPricePaise: 599900, AnnualPricePaise: 5999000, QuotaBytes: 6 * (1 << 40), Rank: 4, Paid: true},
}

// PlanCatalog returns a stable copy of the plan catalog in display order.
func PlanCatalog() []PlanCatalogEntry {
	out := make([]PlanCatalogEntry, len(planCatalog))
	copy(out, planCatalog)
	return out
}

func planByTier(tier string) (PlanCatalogEntry, bool) {
	for _, p := range planCatalog {
		if p.Tier == tier {
			return p, true
		}
	}
	return PlanCatalogEntry{}, false
}

// PlanDefaultQuotaBytes returns the storage quota in bytes for a given plan.
func PlanDefaultQuotaBytes(tier string) int64 {
	if p, ok := planByTier(tier); ok {
		return p.QuotaBytes
	}
	return planCatalog[0].QuotaBytes
}

// PlanPricePaise returns the monthly/annual price for a paid tier.
func PlanPricePaise(tier, billingInterval string) (int64, bool) {
	p, ok := planByTier(tier)
	if !ok || !p.Paid {
		return 0, false
	}
	if billingInterval == "annual" {
		return p.AnnualPricePaise, true
	}
	return p.MonthlyPricePaise, true
}

func PlanTierRank(tier string) (int, bool) {
	p, ok := planByTier(tier)
	return p.Rank, ok
}

func IsPaidPlanTier(tier string) bool {
	p, ok := planByTier(tier)
	return ok && p.Paid
}
