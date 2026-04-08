package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Payout struct {
	ID                     uuid.UUID       `json:"id"`
	DealerID               uuid.UUID       `json:"dealer_id"`
	StateID                *int            `json:"state_id"`
	PeriodStart            time.Time       `json:"period_start"`
	PeriodEnd              time.Time       `json:"period_end"`
	GrossAttributedRevenue int64           `json:"gross_attributed_revenue"`
	CommissionEarned       int64           `json:"commission_earned"`
	TDSWithheld            int64           `json:"tds_withheld"`
	Adjustments            int64           `json:"adjustments"`
	NetPayable             int64           `json:"net_payable"`
	Status                 string          `json:"status"`
	ApprovedBy             *uuid.UUID      `json:"approved_by"`
	PaidAt                 *time.Time      `json:"paid_at"`
	PaymentReference       *string         `json:"payment_reference"`
	MarginRatioSnapshot    json.RawMessage `json:"margin_ratio_snapshot"`
	LineItems              json.RawMessage `json:"line_items"`
	CreatedAt              time.Time       `json:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

type PayoutFilter struct {
	DealerID uuid.UUID
	Status   *string
	FromDate *time.Time
	ToDate   *time.Time
	Cursor   *uuid.UUID
	Limit    int
}

type PayoutRepo struct {
	DB *pgxpool.Pool
}

func NewPayoutRepo(db *pgxpool.Pool) *PayoutRepo {
	return &PayoutRepo{DB: db}
}

const payoutCols = `id, dealer_id, state_id, period_start, period_end, gross_attributed_revenue, commission_earned, tds_withheld, adjustments, net_payable, status, approved_by, paid_at, payment_reference, margin_ratio_snapshot, line_items, created_at, updated_at`

func scanPayout(row pgx.Row) (Payout, error) {
	var p Payout
	err := row.Scan(&p.ID, &p.DealerID, &p.StateID, &p.PeriodStart, &p.PeriodEnd,
		&p.GrossAttributedRevenue, &p.CommissionEarned, &p.TDSWithheld, &p.Adjustments,
		&p.NetPayable, &p.Status, &p.ApprovedBy, &p.PaidAt, &p.PaymentReference,
		&p.MarginRatioSnapshot, &p.LineItems, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (r *PayoutRepo) Create(ctx context.Context, p *Payout) error {
	p.ID = uuid.New()
	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now
	if p.Status == "" {
		p.Status = "draft"
	}
	if p.MarginRatioSnapshot == nil {
		p.MarginRatioSnapshot = json.RawMessage(`{}`)
	}
	if p.LineItems == nil {
		p.LineItems = json.RawMessage(`[]`)
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO payouts (`+payoutCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
		p.ID, p.DealerID, p.StateID, p.PeriodStart, p.PeriodEnd,
		p.GrossAttributedRevenue, p.CommissionEarned, p.TDSWithheld, p.Adjustments,
		p.NetPayable, p.Status, p.ApprovedBy, p.PaidAt, p.PaymentReference,
		p.MarginRatioSnapshot, p.LineItems, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (r *PayoutRepo) GetByID(ctx context.Context, id uuid.UUID) (Payout, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+payoutCols+` FROM payouts WHERE id=$1`, id)
	return scanPayout(row)
}

func (r *PayoutRepo) List(ctx context.Context, f PayoutFilter) ([]Payout, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 20
	}
	query := `SELECT ` + payoutCols + ` FROM payouts WHERE dealer_id = $1`
	args := []any{f.DealerID}
	idx := 2
	if f.Status != nil {
		query += fmt.Sprintf(` AND status = $%d`, idx)
		args = append(args, *f.Status)
		idx++
	}
	if f.FromDate != nil {
		query += fmt.Sprintf(` AND period_start >= $%d`, idx)
		args = append(args, *f.FromDate)
		idx++
	}
	if f.ToDate != nil {
		query += fmt.Sprintf(` AND period_end <= $%d`, idx)
		args = append(args, *f.ToDate)
		idx++
	}
	query += fmt.Sprintf(` ORDER BY period_start DESC LIMIT $%d`, idx)
	args = append(args, f.Limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var payouts []Payout
	for rows.Next() {
		p, err := scanPayout(rows)
		if err != nil {
			return nil, err
		}
		payouts = append(payouts, p)
	}
	return payouts, rows.Err()
}

func (r *PayoutRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, approvedBy *uuid.UUID) error {
	_, err := r.DB.Exec(ctx, `UPDATE payouts SET status=$2, approved_by=$3, updated_at=now() WHERE id=$1`,
		id, status, approvedBy)
	return err
}

func (r *PayoutRepo) MarkPaid(ctx context.Context, id uuid.UUID, paymentRef string) error {
	now := time.Now().UTC()
	_, err := r.DB.Exec(ctx, `UPDATE payouts SET status='paid', paid_at=$2, payment_reference=$3, updated_at=now() WHERE id=$1`,
		id, now, paymentRef)
	return err
}

func (r *PayoutRepo) GetForPeriod(ctx context.Context, dealerID uuid.UUID, periodStart, periodEnd time.Time) (Payout, error) {
	row := r.DB.QueryRow(ctx, `
		SELECT `+payoutCols+` FROM payouts WHERE dealer_id=$1 AND period_start=$2 AND period_end=$3`,
		dealerID, periodStart, periodEnd)
	return scanPayout(row)
}
