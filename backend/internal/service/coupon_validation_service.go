package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rawdrive/backend/internal/repository"
)

var (
	ErrCouponNotFound          = errors.New("coupon not found")
	ErrCouponExpired           = errors.New("coupon has expired")
	ErrCouponExhausted         = errors.New("coupon redemption limit reached")
	ErrCouponInactive          = errors.New("coupon is inactive")
	ErrCouponNotApplicablePlan = errors.New("coupon not valid for this plan")
	ErrCouponNotApplicableState = errors.New("coupon not valid for this state")
	ErrCouponAlreadyUsedByUser = errors.New("coupon already used by this user")
	ErrCouponNotStackable      = errors.New("coupon cannot be combined with other coupons")
)

type CouponValidationResponse struct {
	CouponCode            string     `json:"coupon_code"`
	DiscountType          string     `json:"discount_type"`
	DiscountValue         int64      `json:"discount_value"`
	Applicable            bool       `json:"applicable"`
	OriginalAmountPaisa   int64      `json:"original_amount_paisa"`
	DiscountedAmountPaisa int64      `json:"discounted_amount_paisa"`
	DealerID              *uuid.UUID `json:"dealer_id,omitempty"`
}

type CouponValidationService struct {
	couponRepo *repository.CouponRepo
}

func NewCouponValidationService(couponRepo *repository.CouponRepo) *CouponValidationService {
	return &CouponValidationService{couponRepo: couponRepo}
}

func (s *CouponValidationService) ValidateCoupon(ctx context.Context, code string, userID uuid.UUID, planID *uuid.UUID, stateID *int) (*repository.Coupon, error) {
	coupon, err := s.couponRepo.GetByCodeActive(ctx, code)
	if err != nil {
		return nil, ErrCouponNotFound
	}

	if !coupon.IsActive {
		return nil, ErrCouponInactive
	}

	now := time.Now().UTC()
	if coupon.ValidUntil != nil && coupon.ValidUntil.Before(now) {
		return nil, ErrCouponExpired
	}
	if coupon.MaxRedemptions != nil && coupon.RedemptionCount >= *coupon.MaxRedemptions {
		return nil, ErrCouponExhausted
	}

	// Per-user limit check
	userCount, err := s.couponRepo.GetUserRedemptionCount(ctx, coupon.ID, userID)
	if err != nil {
		return nil, err
	}
	if userCount >= coupon.PerUserLimit {
		return nil, ErrCouponAlreadyUsedByUser
	}

	// Plan scope check
	if coupon.ScopePlanID != nil && planID != nil && *coupon.ScopePlanID != *planID {
		return nil, ErrCouponNotApplicablePlan
	}

	// State scope check
	if coupon.ScopeStateID != nil && stateID != nil && *coupon.ScopeStateID != *stateID {
		return nil, ErrCouponNotApplicableState
	}

	return &coupon, nil
}

// CalculateDiscount computes discount in paisa.
// For percentage: originalAmount * value / 10000 (value is basis points, 1500 = 15%).
// For fixed: min(value, originalAmount).
func CalculateDiscount(coupon *repository.Coupon, originalAmountPaisa int64) int64 {
	switch coupon.CouponType {
	case "percentage":
		discount := originalAmountPaisa * coupon.DiscountValue / 10000
		if discount > originalAmountPaisa {
			return originalAmountPaisa
		}
		return discount
	case "fixed_amount":
		if coupon.DiscountValue > originalAmountPaisa {
			return originalAmountPaisa
		}
		return coupon.DiscountValue
	default:
		return 0
	}
}

// RedeemCouponTx atomically redeems a coupon within an existing DB transaction.
func (s *CouponValidationService) RedeemCouponTx(ctx context.Context, tx pgx.Tx, couponID, userID, workspaceID uuid.UUID, stateID *int, discountPaisa int64) error {
	// Increment redemption count
	if err := s.couponRepo.IncrementRedemption(ctx, tx, couponID); err != nil {
		return err
	}

	// Insert redemption record
	_, err := tx.Exec(ctx, `
		INSERT INTO coupon_redemptions (id, coupon_id, user_id, workspace_id, state_id, discount_applied, redeemed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		uuid.New(), couponID, userID, workspaceID, stateID, discountPaisa, time.Now().UTC())
	return err
}

// CheckStackingEligibility verifies stacking rules.
func CheckStackingEligibility(coupon *repository.Coupon, existingCoupons []repository.Coupon) error {
	if !coupon.IsStackable && len(existingCoupons) > 0 {
		return ErrCouponNotStackable
	}
	for _, existing := range existingCoupons {
		if !existing.IsStackable {
			return ErrCouponNotStackable
		}
	}
	return nil
}
