package repository

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Dealer represents a state dealership partner.
type Dealer struct {
	ID                uuid.UUID  `json:"id"`
	UserID            uuid.UUID  `json:"user_id"`
	StateID           int        `json:"state_id"`
	BusinessName      string     `json:"business_name"`
	TerritoryType     string     `json:"territory_type"`
	Status            string     `json:"status"`
	CommissionRatePct *float64   `json:"commission_rate_pct"`
	BankAccount       *string    `json:"bank_account"` // JSONB stored as string
	PANNumber         string     `json:"pan_number"`
	GSTIN             *string    `json:"gstin"`
	ReferralCode      *string    `json:"referral_code"`
	ApprovedAt        *time.Time `json:"approved_at"`
	ApprovedBy        *uuid.UUID `json:"approved_by"`
	DeletedAt         *time.Time `json:"deleted_at,omitempty"` // M39 E7-S2: soft-delete sentinel
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// DealerFilter drives DealerRepo.List.
//
// M39 E7-S2:
//   - Q applies case-insensitive substring match across business_name,
//     users.email (via JOIN), and phone. Empty Q is a no-op.
//   - IncludeDeleted defaults to false; deleted_at IS NOT NULL rows are
//     excluded from admin listings unless explicitly requested.
type DealerFilter struct {
	Status         string
	StateID        *int
	Q              string
	IncludeDeleted bool
	Limit          int
	Cursor         *time.Time
}

type DealerRepo struct {
	DB *pgxpool.Pool
}

func NewDealerRepo(db *pgxpool.Pool) *DealerRepo {
	return &DealerRepo{DB: db}
}

const dealerCols = `id, user_id, state_id, business_name, territory_type, status, commission_rate_pct, bank_account, pan_number, gstin, referral_code, approved_at, approved_by, deleted_at, created_at, updated_at`

func scanDealer(row pgx.Row) (Dealer, error) {
	var d Dealer
	err := row.Scan(&d.ID, &d.UserID, &d.StateID, &d.BusinessName, &d.TerritoryType,
		&d.Status, &d.CommissionRatePct, &d.BankAccount, &d.PANNumber, &d.GSTIN,
		&d.ReferralCode, &d.ApprovedAt, &d.ApprovedBy, &d.DeletedAt, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *DealerRepo) Create(ctx context.Context, d *Dealer) error {
	d.ID = uuid.New()
	now := time.Now().UTC()
	d.CreatedAt = now
	d.UpdatedAt = now
	if d.Status == "" {
		d.Status = "pending"
	}
	// Use nil for empty referral code to avoid UNIQUE constraint on ""
	var refCode *string
	if d.ReferralCode != nil && *d.ReferralCode != "" {
		refCode = d.ReferralCode
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO dealers (`+dealerCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		d.ID, d.UserID, d.StateID, d.BusinessName, d.TerritoryType,
		d.Status, d.CommissionRatePct, d.BankAccount, d.PANNumber, d.GSTIN,
		refCode, d.ApprovedAt, d.ApprovedBy, d.DeletedAt, d.CreatedAt, d.UpdatedAt,
	)
	return err
}

func (r *DealerRepo) GetByID(ctx context.Context, id uuid.UUID) (Dealer, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+dealerCols+` FROM dealers WHERE id=$1`, id)
	return scanDealer(row)
}

func (r *DealerRepo) GetByUserID(ctx context.Context, userID uuid.UUID) (Dealer, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+dealerCols+` FROM dealers WHERE user_id=$1`, userID)
	return scanDealer(row)
}

func (r *DealerRepo) GetByReferralCode(ctx context.Context, code string) (Dealer, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+dealerCols+` FROM dealers WHERE referral_code=$1`, code)
	return scanDealer(row)
}

func (r *DealerRepo) List(ctx context.Context, f DealerFilter) ([]Dealer, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 20
	}
	// M39 E7-S2: always alias the dealers table so the optional users JOIN
	// (driven by Q) can reference users.email without ambiguity.
	selectCols := "d.id, d.user_id, d.state_id, d.business_name, d.territory_type, d.status, d.commission_rate_pct, d.bank_account, d.pan_number, d.gstin, d.referral_code, d.approved_at, d.approved_by, d.deleted_at, d.created_at, d.updated_at"
	fromClause := "FROM dealers d"
	if strings.TrimSpace(f.Q) != "" {
		fromClause = "FROM dealers d LEFT JOIN users u ON u.id = d.user_id"
	}
	query := "SELECT " + selectCols + " " + fromClause + " WHERE 1=1"
	args := []any{}
	idx := 1
	if !f.IncludeDeleted {
		query += ` AND d.deleted_at IS NULL`
	}
	if f.Status != "" {
		query += fmt.Sprintf(` AND d.status = $%d`, idx)
		args = append(args, f.Status)
		idx++
	}
	if f.StateID != nil {
		query += fmt.Sprintf(` AND d.state_id = $%d`, idx)
		args = append(args, *f.StateID)
		idx++
	}
	if q := strings.TrimSpace(f.Q); q != "" {
		pattern := "%" + q + "%"
		query += fmt.Sprintf(` AND (d.business_name ILIKE $%d OR u.email ILIKE $%d OR COALESCE(d.pan_number,'') ILIKE $%d)`, idx, idx, idx)
		args = append(args, pattern)
		idx++
	}
	if f.Cursor != nil {
		query += fmt.Sprintf(` AND d.created_at < $%d`, idx)
		args = append(args, *f.Cursor)
		idx++
	}
	query += fmt.Sprintf(` ORDER BY d.created_at DESC LIMIT $%d`, idx)
	args = append(args, f.Limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dealers []Dealer
	for rows.Next() {
		var d Dealer
		if err := rows.Scan(&d.ID, &d.UserID, &d.StateID, &d.BusinessName, &d.TerritoryType,
			&d.Status, &d.CommissionRatePct, &d.BankAccount, &d.PANNumber, &d.GSTIN,
			&d.ReferralCode, &d.ApprovedAt, &d.ApprovedBy, &d.DeletedAt, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		dealers = append(dealers, d)
	}
	return dealers, rows.Err()
}

// SoftDelete marks a dealer as deleted by setting deleted_at=now() (M39 E7-S2).
// Returns (deleted bool, err error):
//   - deleted=true when the row was updated.
//   - deleted=false when no row matched OR the row was already soft-deleted
//     (handler maps the latter to HTTP 409 via a second GetByID check).
func (r *DealerRepo) SoftDelete(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := r.DB.Exec(ctx, `UPDATE dealers SET deleted_at=now(), updated_at=now() WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *DealerRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, approvedBy *uuid.UUID, rejectReason *string) error {
	now := time.Now().UTC()
	var approvedAt *time.Time
	if status == "approved" {
		approvedAt = &now
	}
	_, err := r.DB.Exec(ctx, `
		UPDATE dealers SET status=$2, approved_by=$3, approved_at=$4, updated_at=$5 WHERE id=$1`,
		id, status, approvedBy, approvedAt, now)
	return err
}

func (r *DealerRepo) SetReferralCode(ctx context.Context, id uuid.UUID, code string) error {
	_, err := r.DB.Exec(ctx, `UPDATE dealers SET referral_code=$2, updated_at=now() WHERE id=$1`, id, code)
	return err
}

func (r *DealerRepo) ReferralCodeExists(ctx context.Context, code string) (bool, error) {
	var exists bool
	err := r.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM dealers WHERE referral_code=$1)`, code).Scan(&exists)
	return exists, err
}

// GenerateReferralCode creates a unique 8-char uppercase alphanumeric code.
func (r *DealerRepo) GenerateReferralCode(ctx context.Context) (string, error) {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	for attempt := 0; attempt < 10; attempt++ {
		var sb strings.Builder
		for i := 0; i < 8; i++ {
			n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
			if err != nil {
				return "", err
			}
			sb.WriteByte(charset[n.Int64()])
		}
		code := sb.String()
		exists, err := r.ReferralCodeExists(ctx, code)
		if err != nil {
			return "", err
		}
		if !exists {
			return code, nil
		}
	}
	return "", fmt.Errorf("failed to generate unique referral code after 10 attempts")
}
