package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestBuildPricingCatalogHidesRetiredOffers(t *testing.T) {
	catalog := buildPricingCatalog(
		[]PlanCatalogEntry{
			{Tier: "free", Name: "Starter", Active: true, Rank: 0},
			{Tier: "pay_per_event", Name: "Pay Per Event", Active: true, Rank: 1},
			{Tier: "creator", Name: "Creator", Active: true, Paid: true, Rank: 2},
		},
		[]BillingProductCatalog{
			{
				Code:          "event_upload_standard",
				ProductType:   "event_upload",
				Name:          "Event upload",
				Active:        true,
				EffectiveFrom: time.Now().UTC(),
			},
			{
				Code:          "gallery_extend_30",
				ProductType:   "gallery_extension",
				Name:          "Extend +30 days",
				Active:        true,
				EffectiveFrom: time.Now().UTC(),
			},
			{
				Code:          "storage_boost_50",
				ProductType:   "storage_booster",
				Name:          "Boost 50",
				Active:        true,
				EffectiveFrom: time.Now().UTC(),
			},
		},
	)

	require.Len(t, catalog.Plans, 2)
	require.Equal(t, "free", catalog.Plans[0].Tier)
	require.Equal(t, "creator", catalog.Plans[1].Tier)
	require.Empty(t, catalog.EventPacks)
	require.Empty(t, catalog.GalleryExtensions)
	require.Empty(t, catalog.StorageBoosters)
}
