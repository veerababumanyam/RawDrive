package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

var (
	ErrCouponCapExceeded = errors.New("dealer coupon cap exceeded for this state")
	ErrDuplicateCoupon   = errors.New("coupon code already exists")
	ErrInvalidPattern    = errors.New("bulk pattern must contain at least one X placeholder")
)

type CouponService struct {
	repo *repository.CouponRepo
}

func NewCouponService(repo *repository.CouponRepo) *CouponService {
	return &CouponService{repo: repo}
}

// CreateDealerCoupon creates a coupon with dealer cap enforcement.
func (s *CouponService) CreateDealerCoupon(ctx context.Context, userID uuid.UUID, dealerID uuid.UUID, stateID int, coupon *repository.Coupon, maxCouponsPerState int) error {
	// Check cap
	count, err := s.repo.CountByDealer(ctx, dealerID, stateID)
	if err != nil {
		return err
	}
	if count >= maxCouponsPerState {
		return ErrCouponCapExceeded
	}
	coupon.CreatedBy = userID
	coupon.DealerID = &dealerID
	coupon.OwnerType = "dealer"
	return s.repo.Create(ctx, coupon)
}

// CreateAdminCoupon creates a coupon without cap enforcement.
func (s *CouponService) CreateAdminCoupon(ctx context.Context, userID uuid.UUID, coupon *repository.Coupon) error {
	coupon.CreatedBy = userID
	coupon.OwnerType = "admin"
	return s.repo.Create(ctx, coupon)
}

// BulkGenerate generates N unique coupon codes from a pattern like "DEAL-XXXXX".
// Returns the generated codes and the count of skipped duplicates.
func (s *CouponService) BulkGenerate(ctx context.Context, userID uuid.UUID, ownerType string, pattern string, count int, template *repository.Coupon) ([]string, error) {
	if !strings.Contains(pattern, "X") {
		return nil, ErrInvalidPattern
	}
	if count <= 0 || count > 500 {
		return nil, fmt.Errorf("count must be between 1 and 500")
	}

	codes := make([]string, 0, count)
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	duplicates := 0

	for i := 0; i < count; i++ {
		var sb strings.Builder
		for _, ch := range pattern {
			if ch == 'X' {
				n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
				if err != nil {
					return nil, err
				}
				sb.WriteByte(charset[n.Int64()])
			} else {
				sb.WriteRune(ch)
			}
		}
		code := sb.String()

		c := *template
		c.Code = code
		c.CreatedBy = userID
		c.OwnerType = ownerType
		if err := s.repo.Create(ctx, &c); err != nil {
			if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
				duplicates++
				continue
			}
			// Non-duplicate error — return what we have so far with the error
			return codes, fmt.Errorf("bulk generate failed after %d codes: %w", len(codes), err)
		}
		codes = append(codes, code)
	}

	return codes, nil
}
