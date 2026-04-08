package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Payment represents a payment against an invoice.
type Payment struct {
	ID              uuid.UUID `json:"id"`
	WorkspaceID     uuid.UUID `json:"workspace_id"`
	InvoiceID       uuid.UUID `json:"invoice_id"`
	AmountPaisa     int64     `json:"amount_paisa"`
	Method          string    `json:"method"`
	ReferenceNumber *string   `json:"reference_number"`
	PaymentDate     time.Time `json:"payment_date"`
	Notes           *string   `json:"notes"`
	CreatedAt       time.Time `json:"created_at"`
}

type PaymentRepo struct {
	DB *pgxpool.Pool
}

func NewPaymentRepo(db *pgxpool.Pool) *PaymentRepo {
	return &PaymentRepo{DB: db}
}

func (r *PaymentRepo) Create(ctx context.Context, p *Payment) error {
	p.ID = uuid.New()
	p.CreatedAt = time.Now().UTC()
	if p.PaymentDate.IsZero() {
		p.PaymentDate = p.CreatedAt
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO payments (id, workspace_id, invoice_id, amount_paisa, method, reference_number, payment_date, notes, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		p.ID, p.WorkspaceID, p.InvoiceID, p.AmountPaisa, p.Method,
		p.ReferenceNumber, p.PaymentDate, p.Notes, p.CreatedAt,
	)
	return err
}

func (r *PaymentRepo) ListByInvoice(ctx context.Context, workspaceID, invoiceID uuid.UUID) ([]Payment, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, workspace_id, invoice_id, amount_paisa, method, reference_number, payment_date, notes, created_at
		FROM payments WHERE invoice_id=$1 AND workspace_id=$2 ORDER BY payment_date ASC`,
		invoiceID, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Payment
	for rows.Next() {
		var p Payment
		if err := rows.Scan(&p.ID, &p.WorkspaceID, &p.InvoiceID, &p.AmountPaisa,
			&p.Method, &p.ReferenceNumber, &p.PaymentDate, &p.Notes, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *PaymentRepo) GetTotalPaidForInvoice(ctx context.Context, workspaceID, invoiceID uuid.UUID) (int64, error) {
	var total int64
	err := r.DB.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_paisa), 0) FROM payments WHERE invoice_id=$1 AND workspace_id=$2`,
		invoiceID, workspaceID).Scan(&total)
	return total, err
}
