package service

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSubscriptionCatalogBackfillPlannerExactCurrentTier(t *testing.T) {
	row := testBackfillRow("creator", "", "2026-02-01T00:00:00Z", 49900)
	versions := map[string][]subscriptionPlanVersion{
		"creator": {
			testPlanVersion("creator", 1, "2026-01-01T00:00:00Z", 49900),
			testPlanVersion("creator", 2, "2026-01-20T00:00:00Z", 59900),
		},
	}

	decision := planSubscriptionCatalogBackfill(row, versions)

	require.False(t, decision.Unresolved)
	assert.Equal(t, SubscriptionCatalogBackfillSourceExact, decision.Source)
	assert.Equal(t, 2, decision.Version.Version, "must choose latest approved version before subscription start")
	assert.Equal(t, "creator", decision.NormalizedTier)
}

func TestSubscriptionCatalogBackfillPlannerAliasTier(t *testing.T) {
	row := testBackfillRow("starter", "", "2026-02-01T00:00:00Z", 9900)
	versions := map[string][]subscriptionPlanVersion{
		"creator": {testPlanVersion("creator", 1, "2026-01-01T00:00:00Z", 49900)},
	}

	decision := planSubscriptionCatalogBackfill(row, versions)

	require.False(t, decision.Unresolved)
	assert.Equal(t, SubscriptionCatalogBackfillSourceAlias, decision.Source)
	assert.Equal(t, "starter", decision.RawTier)
	assert.Equal(t, "creator", decision.NormalizedTier)
}

func TestSubscriptionCatalogBackfillPlannerEarliestFallback(t *testing.T) {
	row := testBackfillRow("pro_photographer", "", "2025-01-01T00:00:00Z", 79900)
	versions := map[string][]subscriptionPlanVersion{
		"pro_photographer": {testPlanVersion("pro_photographer", 1, "2026-01-01T00:00:00Z", 99900)},
	}

	decision := planSubscriptionCatalogBackfill(row, versions)

	require.False(t, decision.Unresolved)
	assert.Equal(t, SubscriptionCatalogBackfillSourceEarliest, decision.Source)
	assert.Equal(t, 1, decision.Version.Version)
}

func TestSubscriptionCatalogBackfillPlannerLegacyForRemovedTier(t *testing.T) {
	row := testBackfillRow("bespoke_2024", "", "2025-01-01T00:00:00Z", 123456)

	decision := planSubscriptionCatalogBackfill(row, map[string][]subscriptionPlanVersion{})

	require.False(t, decision.Unresolved)
	assert.True(t, decision.RequiresLegacy)
	assert.Equal(t, SubscriptionCatalogBackfillSourceLegacy, decision.Source)
	assert.Equal(t, "legacy_backfill_bespoke_2024", decision.LegacyTier)
}

func TestSubscriptionCatalogBackfillPlannerUnresolvedWithoutTier(t *testing.T) {
	row := testBackfillRow("", "", "2025-01-01T00:00:00Z", 123456)

	decision := planSubscriptionCatalogBackfill(row, map[string][]subscriptionPlanVersion{})

	require.True(t, decision.Unresolved)
	assert.Contains(t, decision.Reason, "no tier_slug")
}

func TestBuildSubscriptionCatalogSnapshotPreservesHistoricalAmount(t *testing.T) {
	row := testBackfillRow("creator", "", "2026-02-01T00:00:00Z", 29900)
	version := testPlanVersion("creator", 1, "2026-01-01T00:00:00Z", 49900)
	decision := subscriptionBackfillDecision{
		Version:        version,
		Source:         SubscriptionCatalogBackfillSourceExact,
		RawTier:        "creator",
		NormalizedTier: "creator",
	}

	snapshot, err := BuildSubscriptionCatalogSnapshot(row, version, decision)
	require.NoError(t, err)

	var decoded map[string]any
	require.NoError(t, json.Unmarshal(snapshot, &decoded))
	assert.Equal(t, subscriptionCatalogSnapshotSchema, decoded["snapshot_schema"])
	billing := decoded["billing"].(map[string]any)
	assert.Equal(t, float64(29900), billing["preserved_amount_paisa"],
		"historical amount must not be recomputed from today's catalog price")
	plan := decoded["plan"].(map[string]any)
	assert.Equal(t, float64(49900), plan["monthly_price_paise"],
		"snapshot should still record the matched catalog version price")
}

func TestSubscriptionBackfillReportDedupesLegacyTiers(t *testing.T) {
	row1 := testBackfillRow("bespoke", "", "2025-01-01T00:00:00Z", 100)
	row2 := testBackfillRow("bespoke", "", "2025-02-01T00:00:00Z", 100)
	decision1 := planSubscriptionCatalogBackfill(row1, map[string][]subscriptionPlanVersion{})
	decision2 := planSubscriptionCatalogBackfill(row2, map[string][]subscriptionPlanVersion{})
	report := SubscriptionCatalogBackfillReport{DryRun: true}

	report.addDecision(row1, decision1, true)
	report.addDecision(row2, decision2, true)
	report.finalizeLegacyTiers()

	assert.Equal(t, 2, report.LegacyVersionMatches)
	assert.Equal(t, 1, report.LegacyVersionsToCreate,
		"dry-run report must not double-count the same archived legacy plan")
	assert.Equal(t, []string{"legacy_backfill_bespoke"}, report.LegacyVersionTiers)
}

func TestValidateSubscriptionCatalogBackfillPreflightFailsWithUnresolvedRows(t *testing.T) {
	report := SubscriptionCatalogBackfillReport{
		Unresolved: []SubscriptionBackfillUnresolved{{
			SubscriptionID: uuid.NewString(),
			Reason:         "missing tier",
		}},
	}

	err := ValidateSubscriptionCatalogBackfillPreflight(report)

	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrUnresolvedSubscriptions))
}

func testBackfillRow(tier string, workspaceTier string, startedAt string, amount int64) subscriptionBackfillRow {
	started := mustTime(startedAt)
	return subscriptionBackfillRow{
		ID:                uuid.New(),
		WorkspaceID:       uuid.New(),
		TierSlug:          tier,
		WorkspacePlanTier: workspaceTier,
		AmountPaisa:       amount,
		BillingInterval:   "monthly",
		Status:            "active",
		StartedAt:         started,
	}
}

func testPlanVersion(tier string, version int, effectiveFrom string, monthlyPrice int64) subscriptionPlanVersion {
	t := mustTime(effectiveFrom)
	return subscriptionPlanVersion{
		ID:                uuid.New(),
		Tier:              tier,
		Version:           version,
		Status:            "approved",
		Name:              tier,
		Description:       "test plan",
		Currency:          "INR",
		MonthlyPricePaise: monthlyPrice,
		AnnualPricePaise:  monthlyPrice * 10,
		QuotaBytes:        100,
		GalleryLimit:      1,
		ClientLimit:       1,
		Features:          []string{"feature"},
		Paid:              monthlyPrice > 0,
		Active:            true,
		SelfServe:         true,
		Rank:              version,
		EffectiveFrom:     t,
		CreatedAt:         t,
		UpdatedAt:         t,
	}
}

func mustTime(value string) time.Time {
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		panic(err)
	}
	return t
}
