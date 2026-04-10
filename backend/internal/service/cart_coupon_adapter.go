package service

// cart_coupon_adapter.go — adapts the existing CouponValidationService
// to the narrow DiscountCalculator interface the cart service needs.
//
// Gallery carts sit on public/anonymous routes: no userID, no plan,
// no state. The platform CouponValidationService path enforces all
// of those, which is the right default for account-level coupons but
// wrong for a client browsing a public gallery. This adapter skips
// the per-user and scope checks and keeps only the validity gates
// that matter for anonymous redemption:
//
//  1. Coupon exists (GetByCodeActive)
//  2. Coupon is active
//  3. Not expired (valid_until in the future or null)
//  4. Not exhausted (redemption_count < max_redemptions)
//
// Pricing delegates to the existing CalculateDiscount helper so the
// percentage/fixed-amount math stays in one place.
//
// Redemption is intentionally NOT recorded here — the cart only
// PREVIEWS the discount. Redemption is recorded when the order moves
// to paid status (a future phase). Previewing without recording means
// a client can refresh a cart with the same coupon without exhausting
// limits, which matches the way Stripe and most checkout flows work.

import (
	"context"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

// CartCouponAdapter wraps a CouponRepo and implements DiscountCalculator
// for the cart service. The repo is used directly (not via
// CouponValidationService.ValidateCoupon) because that method requires
// userID and plan/state scopes that a public cart cannot supply.
type CartCouponAdapter struct {
	repo *repository.CouponRepo
	now  func() time.Time
}

// NewCartCouponAdapter constructs an adapter around the shared coupon repo.
func NewCartCouponAdapter(repo *repository.CouponRepo) *CartCouponAdapter {
	return &CartCouponAdapter{repo: repo, now: time.Now}
}

// WithClock overrides the clock for deterministic tests.
func (a *CartCouponAdapter) WithClock(now func() time.Time) *CartCouponAdapter {
	a.now = now
	return a
}

// ComputeDiscount implements DiscountCalculator. It returns a positive
// paisa discount to apply against the subtotal, or 0 + ErrCouponNotFound
// (or another coupon error) when the coupon cannot be applied.
func (a *CartCouponAdapter) ComputeDiscount(ctx context.Context, code string, subtotal int) (int, error) {
	if a.repo == nil || code == "" || subtotal <= 0 {
		return 0, ErrCouponNotFound
	}

	coupon, err := a.repo.GetByCodeActive(ctx, code)
	if err != nil {
		return 0, ErrCouponNotFound
	}
	if !coupon.IsActive {
		return 0, ErrCouponInactive
	}

	now := a.now().UTC()
	if !coupon.ValidFrom.IsZero() && coupon.ValidFrom.After(now) {
		// Coupon not yet active → treat as expired/invalid for cart preview.
		return 0, ErrCouponNotFound
	}
	if coupon.ValidUntil != nil && coupon.ValidUntil.Before(now) {
		return 0, ErrCouponExpired
	}
	if coupon.MaxRedemptions != nil && coupon.RedemptionCount >= *coupon.MaxRedemptions {
		return 0, ErrCouponExhausted
	}

	discount := CalculateDiscount(&coupon, int64(subtotal))
	if discount < 0 {
		discount = 0
	}
	return int(discount), nil
}
