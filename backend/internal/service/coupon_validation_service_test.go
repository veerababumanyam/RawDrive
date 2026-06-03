package service

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

func TestCalculateDiscount_Percentage(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "percentage",
		DiscountValue: 1500, // 15% in basis points
	}
	original := int64(200000) // Rs. 2000

	discount := CalculateDiscount(coupon, original)
	expected := int64(30000) // 15% of 200000

	if discount != expected {
		t.Errorf("percentage discount: want %d, got %d", expected, discount)
	}
}

func TestCalculateDiscount_PercentageCapped(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "percentage",
		DiscountValue: 15000, // 150% — should be capped at original
	}
	original := int64(100000)

	discount := CalculateDiscount(coupon, original)
	if discount != original {
		t.Errorf("percentage capped: want %d, got %d", original, discount)
	}
}

func TestCalculateDiscount_FixedAmount(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "fixed_amount",
		DiscountValue: 50000, // Rs. 500
	}
	original := int64(200000) // Rs. 2000

	discount := CalculateDiscount(coupon, original)
	if discount != 50000 {
		t.Errorf("fixed discount: want 50000, got %d", discount)
	}
}

func TestCalculateDiscount_FixedExceedsAmount(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "fixed_amount",
		DiscountValue: 300000, // Rs. 3000 — exceeds original
	}
	original := int64(200000) // Rs. 2000

	discount := CalculateDiscount(coupon, original)
	if discount != original {
		t.Errorf("fixed capped: want %d, got %d", original, discount)
	}
}

func TestCheckStackingEligibility_ExclusiveCoupon(t *testing.T) {
	exclusive := &repository.Coupon{IsStackable: false}
	existing := []repository.Coupon{{IsStackable: true}}

	err := CheckStackingEligibility(exclusive, existing)
	if err != ErrCouponNotStackable {
		t.Errorf("expected ErrCouponNotStackable, got %v", err)
	}
}

func TestCheckStackingEligibility_StackableWithStackable(t *testing.T) {
	stackable := &repository.Coupon{IsStackable: true}
	existing := []repository.Coupon{{IsStackable: true}}

	err := CheckStackingEligibility(stackable, existing)
	if err != nil {
		t.Errorf("expected nil, got %v", err)
	}
}

func TestCheckStackingEligibility_StackableWithExclusive(t *testing.T) {
	stackable := &repository.Coupon{IsStackable: true}
	existing := []repository.Coupon{{IsStackable: false}}

	err := CheckStackingEligibility(stackable, existing)
	if err != ErrCouponNotStackable {
		t.Errorf("expected ErrCouponNotStackable, got %v", err)
	}
}

func TestCheckStackingEligibility_Empty(t *testing.T) {
	coupon := &repository.Coupon{IsStackable: false}

	err := CheckStackingEligibility(coupon, nil)
	if err != nil {
		t.Errorf("expected nil for no existing coupons, got %v", err)
	}
}

func TestCalculateDiscount_TrialExtension(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "trial_extension",
		DiscountValue: 7, // days
	}
	discount := CalculateDiscount(coupon, 100000)
	if discount != 0 {
		t.Errorf("trial_extension should return 0 discount, got %d", discount)
	}
}

// Validation tests — these test the error sentinel values are correct
func TestValidationErrors(t *testing.T) {
	_ = uuid.New() // just to confirm import works
	_ = time.Now() // just to confirm import works

	tests := []struct {
		err  error
		name string
	}{
		{ErrCouponNotFound, "not found"},
		{ErrCouponExpired, "expired"},
		{ErrCouponExhausted, "exhausted"},
		{ErrCouponInactive, "inactive"},
		{ErrCouponNotApplicablePlan, "not applicable plan"},
		{ErrCouponNotApplicableState, "not applicable state"},
		{ErrCouponAlreadyUsedByUser, "already used"},
		{ErrCouponNotStackable, "not stackable"},
	}

	for _, tt := range tests {
		if tt.err == nil {
			t.Errorf("sentinel error %s should not be nil", tt.name)
		}
	}
}
