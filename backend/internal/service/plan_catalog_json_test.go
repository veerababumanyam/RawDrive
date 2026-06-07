package service

import (
	"encoding/json"
	"testing"
)

// TestPlanCatalogEntryJSONContract pins the public /api/v1/pricing-catalog plan
// wire format to the snake_case keys the frontend reads (frontend/src/lib/plans.ts
// ApiPlan + normalizeApiPlan). Regression for the live "pricing page missing tier
// plans" bug: PlanCatalogEntry had no json tags, so Go marshaled PascalCase
// (Tier, Paid, MonthlyPricePaise), the frontend read undefined for every field,
// normalizeApiPlan produced id:"" + paid:false, and PricingContent's paid/id
// filters dropped every plan after client hydration.
func TestPlanCatalogEntryJSONContract(t *testing.T) {
	entry := PlanCatalogEntry{
		Tier:              "pro_photographer",
		Name:              "Pro Photographer",
		Description:       "For working photographers.",
		Currency:          "INR",
		MonthlyPricePaise: 99900,
		AnnualPricePaise:  999000,
		QuotaBytes:        100 * (1 << 30),
		GalleryLimit:      10,
		ClientLimit:       50,
		Features:          []string{"AI Face Search", "Branding"},
		Popular:           true,
		Rank:              2,
		Paid:              true,
		Active:            true,
		SelfServe:         true,
		TrialDays:         0,
	}

	raw, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("marshal PlanCatalogEntry: %v", err)
	}

	var got map[string]json.RawMessage
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal to map: %v", err)
	}

	// Every key the frontend's ApiPlan interface depends on must be present in
	// snake_case. Missing any one re-introduces the empty-grid bug.
	required := []string{
		"tier", "name", "description", "currency",
		"monthly_price_paise", "annual_price_paise", "quota_bytes",
		"gallery_limit", "client_limit", "features", "popular",
		"rank", "paid", "active", "self_serve", "trial_days",
	}
	for _, key := range required {
		if _, ok := got[key]; !ok {
			t.Errorf("public pricing-catalog plan missing snake_case key %q; got keys %v", key, keysOf(got))
		}
	}

	// PascalCase keys must NOT appear — their presence means the json tags were
	// dropped and the frontend will read undefined.
	for _, bad := range []string{"Tier", "Paid", "MonthlyPricePaise", "Active", "SelfServe"} {
		if _, ok := got[bad]; ok {
			t.Errorf("public pricing-catalog plan leaked PascalCase key %q (json tags missing)", bad)
		}
	}

	// The two fields PricingContent filters on must survive the round trip.
	var rt struct {
		Tier string `json:"tier"`
		Paid bool   `json:"paid"`
		MPP  int64  `json:"monthly_price_paise"`
	}
	if err := json.Unmarshal(raw, &rt); err != nil {
		t.Fatalf("round-trip unmarshal: %v", err)
	}
	if rt.Tier != "pro_photographer" || !rt.Paid || rt.MPP != 99900 {
		t.Errorf("round trip lost data: tier=%q paid=%v monthly_price_paise=%d", rt.Tier, rt.Paid, rt.MPP)
	}
}

// TestPlanCatalogFallbackSerializesPaidPlans guards that the built-in catalog the
// public endpoint serves actually yields paid, active subscription tiers in the
// wire format — i.e. PricingContent's `plan.paid` filter will keep them.
func TestPlanCatalogFallbackSerializesPaidPlans(t *testing.T) {
	plans := PlanCatalog()
	if len(plans) == 0 {
		t.Fatal("PlanCatalog() returned no entries")
	}
	raw, err := json.Marshal(plans)
	if err != nil {
		t.Fatalf("marshal catalog: %v", err)
	}
	var decoded []struct {
		Tier string `json:"tier"`
		Paid bool   `json:"paid"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal catalog: %v", err)
	}
	paid := 0
	for _, p := range decoded {
		if p.Tier == "" {
			t.Errorf("plan serialized with empty tier (PascalCase regression)")
		}
		if p.Paid {
			paid++
		}
	}
	if paid == 0 {
		t.Error("no paid subscription tiers survive serialization — pricing grid would be empty")
	}
}

func keysOf(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
