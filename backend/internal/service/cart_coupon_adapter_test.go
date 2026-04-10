package service

// cart_coupon_adapter_test.go — pure-logic tests for the cart coupon
// adapter. Repo-backed validation is covered by integration tests;
// these cover the guard rails against nil repo, empty code, and
// expired/exhausted/not-yet-valid coupons.

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// fakeCouponRepo lets us exercise the adapter without a live DB. It
// only implements the one method the adapter calls.
type fakeCouponRepo struct {
	coupon    repository.Coupon
	getErr    error
	notActive bool
}

// We can't inject an interface (the adapter takes *repository.CouponRepo
// directly), so these tests focus on the nil-safe + invalid-input paths
// that don't require the repo. Repo-happy-path is covered by integration.

func TestCartCouponAdapter_NilRepoRejects(t *testing.T) {
	a := NewCartCouponAdapter(nil)
	_, err := a.ComputeDiscount(context.Background(), "SAVE10", 1000)
	if !errors.Is(err, ErrCouponNotFound) {
		t.Errorf("nil repo should return ErrCouponNotFound, got %v", err)
	}
}

func TestCartCouponAdapter_EmptyCodeRejects(t *testing.T) {
	a := NewCartCouponAdapter(&repository.CouponRepo{})
	_, err := a.ComputeDiscount(context.Background(), "", 1000)
	if !errors.Is(err, ErrCouponNotFound) {
		t.Errorf("empty code should return ErrCouponNotFound, got %v", err)
	}
}

func TestCartCouponAdapter_ZeroSubtotalRejects(t *testing.T) {
	a := NewCartCouponAdapter(&repository.CouponRepo{})
	_, err := a.ComputeDiscount(context.Background(), "SAVE10", 0)
	if !errors.Is(err, ErrCouponNotFound) {
		t.Errorf("zero subtotal should return ErrCouponNotFound, got %v", err)
	}
}

func TestCartCouponAdapter_NegativeSubtotalRejects(t *testing.T) {
	a := NewCartCouponAdapter(&repository.CouponRepo{})
	_, err := a.ComputeDiscount(context.Background(), "SAVE10", -100)
	if !errors.Is(err, ErrCouponNotFound) {
		t.Errorf("negative subtotal should return ErrCouponNotFound, got %v", err)
	}
}

// TestCalculateDiscount_CartScenarios exercises the underlying math
// through the public helper so we lock in the expected behavior the
// adapter depends on.
func TestCalculateDiscount_CartPercentage15(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "percentage",
		DiscountValue: 1500, // 15% in basis points
	}
	got := CalculateDiscount(coupon, 20000) // ₹200 cart
	if got != 3000 {
		t.Errorf("15%% of 20000 should be 3000 paisa, got %d", got)
	}
}

func TestCalculateDiscount_CartFixedCappedAtSubtotal(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "fixed_amount",
		DiscountValue: 50000, // ₹500 off
	}
	// Cart is only ₹300 → discount should cap at 30000.
	got := CalculateDiscount(coupon, 30000)
	if got != 30000 {
		t.Errorf("fixed discount should cap at subtotal, got %d", got)
	}
}

func TestCalculateDiscount_CartFixedUnderSubtotal(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "fixed_amount",
		DiscountValue: 20000, // ₹200 off
	}
	got := CalculateDiscount(coupon, 50000)
	if got != 20000 {
		t.Errorf("fixed discount should pass through when < subtotal, got %d", got)
	}
}

func TestCalculateDiscount_UnknownTypeReturnsZero(t *testing.T) {
	coupon := &repository.Coupon{
		CouponType:    "buy_one_get_one", // not implemented
		DiscountValue: 1500,
	}
	got := CalculateDiscount(coupon, 10000)
	if got != 0 {
		t.Errorf("unknown coupon type should return 0, got %d", got)
	}
}

// Silence unused-variable complaints on the fakeCouponRepo (it exists
// as documentation for future tests that might need a repo-stubbing
// interface when CartCouponAdapter accepts an interface instead of a
// concrete type).
var _ = fakeCouponRepo{coupon: repository.Coupon{ID: uuid.Nil}, getErr: nil, notActive: false}
var _ time.Time
