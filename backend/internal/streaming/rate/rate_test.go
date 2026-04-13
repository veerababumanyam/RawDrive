package rate_test

// M31 / E103-S1 — rate package unit tests that don't need a DB.

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/streaming/rate"
)

func TestCreatePackage_ValidationErrors(t *testing.T) {
	svc := rate.NewService(nil) // pool unused — validation runs first.
	ctx := context.Background()

	tests := []struct {
		name string
		in   rate.CreatePackageInput
		want error
	}{
		{
			name: "invalid tier",
			in:   rate.CreatePackageInput{Code: "x", Name: "X", Tier: "gold", Minutes: 10, MaxConcurrentViewers: 10, ReplayTTLDays: 7},
			want: rate.ErrInvalidTier,
		},
		{
			name: "zero minutes",
			in:   rate.CreatePackageInput{Code: "x", Name: "X", Tier: "basic", Minutes: 0, MaxConcurrentViewers: 10, ReplayTTLDays: 7},
			want: rate.ErrNonPositiveMinutes,
		},
		{
			name: "zero viewers",
			in:   rate.CreatePackageInput{Code: "x", Name: "X", Tier: "basic", Minutes: 60, MaxConcurrentViewers: 0, ReplayTTLDays: 7},
			want: rate.ErrNonPositiveViewers,
		},
		{
			name: "zero TTL",
			in:   rate.CreatePackageInput{Code: "x", Name: "X", Tier: "basic", Minutes: 60, MaxConcurrentViewers: 50, ReplayTTLDays: 0},
			want: rate.ErrNonPositiveTTL,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.CreatePackage(ctx, tc.in)
			assert.ErrorIs(t, err, tc.want)
		})
	}
}

func TestPatchPackage_ValidationErrors(t *testing.T) {
	svc := rate.NewService(nil)
	ctx := context.Background()

	// Zero-value pointers trigger each guard.
	zero := 0
	_, err := svc.PatchPackage(ctx, uuid.New(), rate.PatchPackageInput{Minutes: &zero})
	assert.ErrorIs(t, err, rate.ErrNonPositiveMinutes)

	_, err = svc.PatchPackage(ctx, uuid.New(), rate.PatchPackageInput{MaxConcurrentViewers: &zero})
	assert.ErrorIs(t, err, rate.ErrNonPositiveViewers)

	_, err = svc.PatchPackage(ctx, uuid.New(), rate.PatchPackageInput{ReplayTTLDays: &zero})
	assert.ErrorIs(t, err, rate.ErrNonPositiveTTL)
}

func TestCreateRateCard_RejectsPastEffectiveFrom(t *testing.T) {
	svc := rate.NewService(nil)
	ctx := context.Background()

	_, err := svc.CreateRateCard(ctx, uuid.New(), nil, rate.CreateRateCardInput{
		PricePaise:             49900,
		BaseRatePaisePerMin:    100,
		OverageRatePaisePerMin: 150,
		EffectiveFrom:          time.Now().Add(-1 * time.Hour), // in the past
	})
	assert.ErrorIs(t, err, rate.ErrEffectiveFromPast)
}

func TestCreateRateCard_RejectsNonPositiveRate(t *testing.T) {
	svc := rate.NewService(nil)
	ctx := context.Background()

	future := time.Now().Add(24 * time.Hour)

	_, err := svc.CreateRateCard(ctx, uuid.New(), nil, rate.CreateRateCardInput{
		PricePaise:             49900,
		BaseRatePaisePerMin:    0,
		OverageRatePaisePerMin: 150,
		EffectiveFrom:          future,
	})
	assert.ErrorIs(t, err, rate.ErrNonPositiveRate)

	_, err = svc.CreateRateCard(ctx, uuid.New(), nil, rate.CreateRateCardInput{
		PricePaise:             49900,
		BaseRatePaisePerMin:    100,
		OverageRatePaisePerMin: 0,
		EffectiveFrom:          future,
	})
	assert.ErrorIs(t, err, rate.ErrNonPositiveRate)
}

func TestCreateRateCard_RejectsNegativePrice(t *testing.T) {
	svc := rate.NewService(nil)
	ctx := context.Background()
	future := time.Now().Add(24 * time.Hour)
	_, err := svc.CreateRateCard(ctx, uuid.New(), nil, rate.CreateRateCardInput{
		PricePaise:             -1,
		BaseRatePaisePerMin:    100,
		OverageRatePaisePerMin: 150,
		EffectiveFrom:          future,
	})
	assert.ErrorIs(t, err, rate.ErrNonPositivePrice)
}
