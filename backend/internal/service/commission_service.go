package service

import (
	"math"
	"math/big"

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

// PctToBasisPoints converts a percentage (e.g. 15.5 for 15.5%) into integer
// basis points (1550). Basis points are the canonical integer rate basis: one
// basis point is 0.01%, so 100% == 10000 bp. The percent values stored in the
// schema carry at most two decimal places, so rounding here is exact and never
// drops precision. math.Round (not truncation) is used so that e.g. 15.5 * 100
// == 1549.9999999... rounds to 1550 rather than truncating to 1549.
func PctToBasisPoints(pct float64) int64 {
	return int64(math.Round(pct * 100))
}

// commissionBasisPointDivisor is the basis-point denominator: 100% == 10000 bp.
const commissionBasisPointDivisor = 10000

// CalculateCommissionBasisPoints computes dealer commission in paisa using a
// pure-integer basis-point rate. This is the canonical money path: it never
// converts the paisa amount to float64, so it preserves the codebase's
// paisa-integer invariant and is free of float multiplication drift.
//
// Formula: paymentAmountPaisa * basisPoints / 10000.
// The multiplication is done with math/big so it cannot overflow int64 — a
// plain int64 product would wrap for amounts above ~2^53 paisa and yield a
// negative payout. Division truncates toward zero (big.Int.Quo), the
// conventional rounding for commission/payout splits, and is deterministic
// across platforms.
func CalculateCommissionBasisPoints(paymentAmountPaisa, basisPoints int64) int64 {
	product := new(big.Int).Mul(big.NewInt(paymentAmountPaisa), big.NewInt(basisPoints))
	product.Quo(product, big.NewInt(commissionBasisPointDivisor))
	return product.Int64()
}

// CalculateCommission computes dealer commission in paisa for a payment.
// Formula: paymentAmountPaisa * (dealerPct / 100).
//
// dealerPct is a percentage (e.g. 15 for 15%). It is converted to integer
// basis points and the commission is computed in pure integer arithmetic, so
// the result matches an integer basis-point calculation exactly rather than
// drifting by a paisa from float64 multiplication of the (large) paisa amount.
func CalculateCommission(paymentAmountPaisa int64, dealerPct float64) int64 {
	return CalculateCommissionBasisPoints(paymentAmountPaisa, PctToBasisPoints(dealerPct))
}
