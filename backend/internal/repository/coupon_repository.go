package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Coupon struct {
	ID              uuid.UUID  `json:"id"`
	Code            string     `json:"code"`
	CreatedBy       uuid.UUID  `json:"created_by"`
	OwnerType       string     `json:"owner_type"`
	DealerID        *uuid.UUID `json:"dealer_id"`
	CouponType      string     `json:"coupon_type"`
	DiscountValue   int64      `json:"discount_value"`
	ScopeStateID    *int       `json:"scope_state_id"`
	ScopePlanID     *uuid.UUID `json:"scope_plan_id"`
	ScopeProduct    *string    `json:"scope_product"`
	ScopeCampaign   *string    `json:"scope_campaign"`
	MaxRedemptions  *int       `json:"max_redemptions"`
	PerUserLimit    int        `json:"per_user_limit"`
	RedemptionCount int        `json:"redemption_count"`
	ValidFrom       time.Time  `json:"valid_from"`
	ValidUntil      *time.Time `json:"valid_until"`
	IsActive        bool       `json:"is_active"`
	IsStackable     bool       `json:"is_stackable"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type CouponFilter struct {
	Status   *string
	DealerID *uuid.UUID
	Cursor   *uuid.UUID
	Limit    int
}

type CouponRepo struct {
	DB *pgxpool.Pool
}

func NewCouponRepo(db *pgxpool.Pool) *CouponRepo {
	return &CouponRepo{DB: db}
}

const couponCols = `id, code, created_by, owner_type, dealer_id, coupon_type, discount_value, scope_state_id, scope_plan_id, scope_product, scope_campaign, max_redemptions, per_user_limit, redemption_count, valid_from, valid_until, is_active, is_stackable, created_at, updated_at`

func scanCoupon(row pgx.Row) (Coupon, error) {
	var c Coupon
	err := row.Scan(&c.ID, &c.Code, &c.CreatedBy, &c.OwnerType, &c.DealerID,
		&c.CouponType, &c.DiscountValue, &c.ScopeStateID, &c.ScopePlanID,
		&c.ScopeProduct, &c.ScopeCampaign, &c.MaxRedemptions, &c.PerUserLimit,
		&c.RedemptionCount, &c.ValidFrom, &c.ValidUntil, &c.IsActive, &c.IsStackable,
		&c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (r *CouponRepo) Create(ctx context.Context, c *Coupon) error {
	c.ID = uuid.New()
	now := time.Now().UTC()
	c.CreatedAt = now
	c.UpdatedAt = now
	c.Code = strings.ToUpper(c.Code) // case-insensitive storage
	if c.PerUserLimit == 0 {
		c.PerUserLimit = 1
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO coupons (`+couponCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
		c.ID, c.Code, c.CreatedBy, c.OwnerType, c.DealerID,
		c.CouponType, c.DiscountValue, c.ScopeStateID, c.ScopePlanID,
		c.ScopeProduct, c.ScopeCampaign, c.MaxRedemptions, c.PerUserLimit,
		c.RedemptionCount, c.ValidFrom, c.ValidUntil, c.IsActive, c.IsStackable,
		c.CreatedAt, c.UpdatedAt,
	)
	return err
}

func (r *CouponRepo) GetByID(ctx context.Context, id uuid.UUID) (Coupon, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+couponCols+` FROM coupons WHERE id=$1`, id)
	return scanCoupon(row)
}

func (r *CouponRepo) GetByCode(ctx context.Context, code string) (Coupon, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+couponCols+` FROM coupons WHERE UPPER(code)=$1`, strings.ToUpper(code))
	return scanCoupon(row)
}

func (r *CouponRepo) GetByCodeActive(ctx context.Context, code string) (Coupon, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+couponCols+` FROM coupons WHERE UPPER(code)=$1 AND is_active=true`, strings.ToUpper(code))
	return scanCoupon(row)
}

func (r *CouponRepo) List(ctx context.Context, f CouponFilter) ([]Coupon, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 25
	}
	query := `SELECT ` + couponCols + ` FROM coupons WHERE 1=1`
	args := []any{}
	idx := 1
	if f.DealerID != nil {
		query += fmt.Sprintf(` AND dealer_id = $%d`, idx)
		args = append(args, *f.DealerID)
		idx++
	}
	if f.Cursor != nil {
		query += fmt.Sprintf(` AND id < $%d`, idx)
		args = append(args, *f.Cursor)
		idx++
	}
	query += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d`, idx)
	args = append(args, f.Limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var coupons []Coupon
	for rows.Next() {
		c, err := scanCoupon(rows)
		if err != nil {
			return nil, err
		}
		coupons = append(coupons, c)
	}
	return coupons, rows.Err()
}

func (r *CouponRepo) CountByDealer(ctx context.Context, dealerID uuid.UUID, stateID int) (int, error) {
	var count int
	err := r.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM coupons WHERE dealer_id=$1 AND scope_state_id=$2 AND is_active=true`,
		dealerID, stateID).Scan(&count)
	return count, err
}

// ErrCouponExhausted is returned when a coupon's redemption limit has been
// reached. It is surfaced when IncrementRedemption's guarded UPDATE matches no
// row, which happens when redemption_count has already hit max_redemptions.
var ErrCouponExhausted = errors.New("coupon redemption limit reached")

// LockCouponForUpdate selects a coupon row inside the supplied transaction with
// FOR UPDATE, serializing concurrent redemptions of the same coupon. Callers
// must run this before re-validating redemption limits so the check-then-
// increment sequence is atomic with respect to other transactions.
func (r *CouponRepo) LockCouponForUpdate(ctx context.Context, tx pgx.Tx, couponID uuid.UUID) (Coupon, error) {
	row := tx.QueryRow(ctx, `SELECT `+couponCols+` FROM coupons WHERE id=$1 FOR UPDATE`, couponID)
	return scanCoupon(row)
}

// IncrementRedemption atomically bumps redemption_count, but only while the
// coupon is still below its cap. The WHERE guard makes the limit check and the
// increment a single atomic statement, so two concurrent transactions can never
// both push the count past max_redemptions (TOCTOU over-redemption). When the
// guard matches no row the cap is already reached and ErrCouponExhausted is
// returned. A NULL max_redemptions means unlimited.
func (r *CouponRepo) IncrementRedemption(ctx context.Context, tx pgx.Tx, couponID uuid.UUID) error {
	tag, err := tx.Exec(ctx, `
		UPDATE coupons SET redemption_count = redemption_count + 1, updated_at = now()
		WHERE id = $1 AND (max_redemptions IS NULL OR redemption_count < max_redemptions)`, couponID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCouponExhausted
	}
	return nil
}

func (r *CouponRepo) GetUserRedemptionCount(ctx context.Context, couponID, userID uuid.UUID) (int, error) {
	var count int
	err := r.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id=$1 AND user_id=$2`,
		couponID, userID).Scan(&count)
	return count, err
}
