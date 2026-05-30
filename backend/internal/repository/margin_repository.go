package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type MarginRatio struct {
	ID               uuid.UUID  `json:"id"`
	StateID          *int       `json:"state_id"`
	PlanID           *uuid.UUID `json:"plan_id"`
	ProductType      string     `json:"product_type"`
	Channel          string     `json:"channel"`
	DealerPct        float64    `json:"dealer_pct"`
	PlatformPct      float64    `json:"platform_pct"`
	CalculationBasis string     `json:"calculation_basis"`
	// FixedIncentivePaise is the flat per-attribution incentive in integer
	// paisa (BIGINT column fixed_incentive_paise), matching the BIGINT-paisa
	// money convention used across billing. Renamed from FixedIncentiveINR /
	// fixed_incentive_inr DECIMAL(10,2) by migration 124. (F-065)
	FixedIncentivePaise int64      `json:"fixed_incentive_paise"`
	EffectiveFrom       time.Time  `json:"effective_from"`
	EffectiveUntil      *time.Time `json:"effective_until"`
	CreatedBy           uuid.UUID  `json:"created_by"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type MarginRepo struct {
	DB *pgxpool.Pool
}

func NewMarginRepo(db *pgxpool.Pool) *MarginRepo {
	return &MarginRepo{DB: db}
}

const marginCols = `id, state_id, plan_id, product_type, channel, dealer_pct, platform_pct, calculation_basis, fixed_incentive_paise, effective_from, effective_until, created_by, created_at, updated_at`

func scanMargin(row pgx.Row) (MarginRatio, error) {
	var m MarginRatio
	err := row.Scan(&m.ID, &m.StateID, &m.PlanID, &m.ProductType, &m.Channel,
		&m.DealerPct, &m.PlatformPct, &m.CalculationBasis, &m.FixedIncentivePaise,
		&m.EffectiveFrom, &m.EffectiveUntil, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

func (r *MarginRepo) Create(ctx context.Context, m *MarginRatio) error {
	m.ID = uuid.New()
	now := time.Now().UTC()
	m.CreatedAt = now
	m.UpdatedAt = now
	if m.CalculationBasis == "" {
		m.CalculationBasis = "net_of_gst"
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO margin_ratios (`+marginCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		m.ID, m.StateID, m.PlanID, m.ProductType, m.Channel,
		m.DealerPct, m.PlatformPct, m.CalculationBasis, m.FixedIncentivePaise,
		m.EffectiveFrom, m.EffectiveUntil, m.CreatedBy, m.CreatedAt, m.UpdatedAt,
	)
	return err
}

func (r *MarginRepo) GetGlobalDefault(ctx context.Context, channel, productType string, asOf time.Time) (MarginRatio, error) {
	row := r.DB.QueryRow(ctx, `
		SELECT `+marginCols+` FROM margin_ratios
		WHERE state_id IS NULL AND channel=$1 AND product_type=$2
		AND effective_from <= $3 AND (effective_until IS NULL OR effective_until > $3)
		ORDER BY effective_from DESC LIMIT 1`, channel, productType, asOf)
	return scanMargin(row)
}

func (r *MarginRepo) GetByState(ctx context.Context, stateID int, channel, productType string, asOf time.Time) (MarginRatio, error) {
	row := r.DB.QueryRow(ctx, `
		SELECT `+marginCols+` FROM margin_ratios
		WHERE state_id=$1 AND channel=$2 AND product_type=$3
		AND effective_from <= $4 AND (effective_until IS NULL OR effective_until > $4)
		ORDER BY effective_from DESC LIMIT 1`, stateID, channel, productType, asOf)
	return scanMargin(row)
}

func (r *MarginRepo) ListCurrent(ctx context.Context, stateID *int) ([]MarginRatio, error) {
	now := time.Now().UTC()
	query := `SELECT ` + marginCols + ` FROM margin_ratios WHERE effective_from <= $1 AND (effective_until IS NULL OR effective_until > $1)`
	args := []any{now}
	if stateID != nil {
		query += fmt.Sprintf(` AND state_id = $2`)
		args = append(args, *stateID)
	}
	query += ` ORDER BY effective_from DESC`

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ratios []MarginRatio
	for rows.Next() {
		m, err := scanMargin(rows)
		if err != nil {
			return nil, err
		}
		ratios = append(ratios, m)
	}
	return ratios, rows.Err()
}

// ListAll returns all margin ratios including expired ones (full version history).
func (r *MarginRepo) ListAll(ctx context.Context, stateID *int) ([]MarginRatio, error) {
	query := `SELECT ` + marginCols + ` FROM margin_ratios WHERE 1=1`
	args := []any{}
	if stateID != nil {
		query += ` AND state_id = $1`
		args = append(args, *stateID)
	}
	query += ` ORDER BY created_at DESC`

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ratios []MarginRatio
	for rows.Next() {
		m, err := scanMargin(rows)
		if err != nil {
			return nil, err
		}
		ratios = append(ratios, m)
	}
	return ratios, rows.Err()
}

func (r *MarginRepo) UpdateEffectiveUntil(ctx context.Context, id uuid.UUID, until time.Time) error {
	_, err := r.DB.Exec(ctx, `UPDATE margin_ratios SET effective_until=$2, updated_at=now() WHERE id=$1`, id, until)
	return err
}
