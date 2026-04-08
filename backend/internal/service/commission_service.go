package service

import (
	"github.com/rawdrive/backend/internal/repository"
)

// CommissionService handles commission calculation from margin ratios.
type CommissionService struct {
	marginSvc  *MarginService
	dealerRepo *repository.DealerRepo
}

func NewCommissionService(marginSvc *MarginService, dealerRepo *repository.DealerRepo) *CommissionService {
	return &CommissionService{marginSvc: marginSvc, dealerRepo: dealerRepo}
}

// CalculateCommission computes dealer commission in paisa for a payment.
// Formula: paymentAmountPaisa * (dealerPct / 100)
func CalculateCommission(paymentAmountPaisa int64, dealerPct float64) int64 {
	return int64(float64(paymentAmountPaisa) * dealerPct / 100)
}
