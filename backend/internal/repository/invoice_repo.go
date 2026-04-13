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

// Invoice represents a GST-compliant invoice. All amounts in paisa.
type Invoice struct {
	ID              uuid.UUID       `json:"id"`
	WorkspaceID     uuid.UUID       `json:"workspace_id"`
	StateID         int             `json:"state_id"`
	ContactID       *uuid.UUID      `json:"contact_id"`
	ProjectID       *uuid.UUID      `json:"project_id,omitempty"`
	InvoiceNumber   string          `json:"invoice_number"`
	InvoiceType     string          `json:"invoice_type"`
	Status          string          `json:"status"`
	Currency        string          `json:"currency"`
	SubtotalPaisa   int64           `json:"subtotal_paisa"`
	CGSTPaisa       int64           `json:"cgst_paisa"`
	SGSTPaisa       int64           `json:"sgst_paisa"`
	IGSTPaisa       int64           `json:"igst_paisa"`
	TotalPaisa      int64           `json:"total_paisa"`
	AmountPaidPaisa int64           `json:"amount_paid_paisa"`
	DiscountPaisa   int64           `json:"discount_paisa"`
	LineItems       json.RawMessage `json:"line_items"`
	DueDate         *time.Time      `json:"due_date"`
	PaidAt          *time.Time      `json:"paid_at"`
	Notes           *string         `json:"notes"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
	// M23: GST compliance fields (migration 073)
	PlaceOfSupplyState string `json:"place_of_supply_state,omitempty"`
	PlaceOfSupplyCode  string `json:"place_of_supply_code,omitempty"`
	AmountInWords      string `json:"amount_in_words,omitempty"`
	RoundOffPaisa      int64  `json:"round_off_paisa,omitempty"`
	// M24: document-type metadata and package origin.
	QuotationValidUntil *time.Time `json:"quotation_valid_until,omitempty"`
	CreditNoteInvoiceID *uuid.UUID `json:"credit_note_invoice_id,omitempty"`
	CreditNoteReason    *string    `json:"credit_note_reason,omitempty"`
	SourcePackageID     *uuid.UUID `json:"source_package_id,omitempty"`
}

// InvoiceLineItem represents a line item on an invoice.
type InvoiceLineItem struct {
	Description    string  `json:"description"`
	Quantity       int     `json:"quantity"`
	UnitPricePaisa int64   `json:"unit_price_paisa"`
	HSNCode        string  `json:"hsn_code"`
	TaxRate        float64 `json:"tax_rate"`
}

type InvoiceFilter struct {
	WorkspaceID uuid.UUID
	Status      string
	ContactID   *uuid.UUID
	ProjectID   *uuid.UUID
	Limit       int
	Cursor      *time.Time
}

type InvoiceRepo struct {
	DB *pgxpool.Pool
}

func NewInvoiceRepo(db *pgxpool.Pool) *InvoiceRepo {
	return &InvoiceRepo{DB: db}
}

const invoiceCols = `id, workspace_id, state_id, contact_id, project_id, invoice_number, invoice_type, status, currency, subtotal_paisa, cgst_paisa, sgst_paisa, igst_paisa, total_paisa, amount_paid_paisa, discount_paisa, line_items, due_date, paid_at, notes, created_at, updated_at, place_of_supply_state, place_of_supply_code, amount_in_words, round_off_paisa, quotation_valid_until, credit_note_invoice_id, credit_note_reason, source_package_id`

func scanInvoice(row pgx.Row) (Invoice, error) {
	var inv Invoice
	err := row.Scan(
		&inv.ID, &inv.WorkspaceID, &inv.StateID, &inv.ContactID, &inv.ProjectID,
		&inv.InvoiceNumber, &inv.InvoiceType, &inv.Status, &inv.Currency,
		&inv.SubtotalPaisa, &inv.CGSTPaisa, &inv.SGSTPaisa, &inv.IGSTPaisa,
		&inv.TotalPaisa, &inv.AmountPaidPaisa, &inv.DiscountPaisa,
		&inv.LineItems, &inv.DueDate, &inv.PaidAt, &inv.Notes,
		&inv.CreatedAt, &inv.UpdatedAt,
		&inv.PlaceOfSupplyState, &inv.PlaceOfSupplyCode, &inv.AmountInWords, &inv.RoundOffPaisa,
		&inv.QuotationValidUntil, &inv.CreditNoteInvoiceID, &inv.CreditNoteReason, &inv.SourcePackageID,
	)
	return inv, err
}

func (r *InvoiceRepo) Create(ctx context.Context, inv *Invoice) error {
	inv.ID = uuid.New()
	now := time.Now().UTC()
	inv.CreatedAt = now
	inv.UpdatedAt = now
	_, err := r.DB.Exec(ctx, `
		INSERT INTO invoices (`+invoiceCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
		inv.ID, inv.WorkspaceID, inv.StateID, inv.ContactID, inv.ProjectID,
		inv.InvoiceNumber, inv.InvoiceType, inv.Status, inv.Currency,
		inv.SubtotalPaisa, inv.CGSTPaisa, inv.SGSTPaisa, inv.IGSTPaisa,
		inv.TotalPaisa, inv.AmountPaidPaisa, inv.DiscountPaisa,
		inv.LineItems, inv.DueDate, inv.PaidAt, inv.Notes,
		inv.CreatedAt, inv.UpdatedAt,
		inv.PlaceOfSupplyState, inv.PlaceOfSupplyCode, inv.AmountInWords, inv.RoundOffPaisa,
		inv.QuotationValidUntil, inv.CreditNoteInvoiceID, inv.CreditNoteReason, inv.SourcePackageID,
	)
	return err
}

func (r *InvoiceRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (Invoice, error) {
	row := r.DB.QueryRow(ctx,
		`SELECT `+invoiceCols+` FROM invoices WHERE id=$1 AND workspace_id=$2`, id, workspaceID)
	return scanInvoice(row)
}

func (r *InvoiceRepo) List(ctx context.Context, f InvoiceFilter) ([]Invoice, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	query := `SELECT ` + invoiceCols + ` FROM invoices WHERE workspace_id = $1`
	args := []any{f.WorkspaceID}
	idx := 2
	if f.Status != "" {
		query += fmt.Sprintf(` AND status = $%d`, idx)
		args = append(args, f.Status)
		idx++
	}
	if f.ContactID != nil {
		query += fmt.Sprintf(` AND contact_id = $%d`, idx)
		args = append(args, *f.ContactID)
		idx++
	}
	if f.ProjectID != nil {
		query += fmt.Sprintf(` AND project_id = $%d`, idx)
		args = append(args, *f.ProjectID)
		idx++
	}
	if f.Cursor != nil {
		query += fmt.Sprintf(` AND created_at < $%d`, idx)
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
	var out []Invoice
	for rows.Next() {
		var inv Invoice
		if err := rows.Scan(
			&inv.ID, &inv.WorkspaceID, &inv.StateID, &inv.ContactID, &inv.ProjectID,
			&inv.InvoiceNumber, &inv.InvoiceType, &inv.Status, &inv.Currency,
			&inv.SubtotalPaisa, &inv.CGSTPaisa, &inv.SGSTPaisa, &inv.IGSTPaisa,
			&inv.TotalPaisa, &inv.AmountPaidPaisa, &inv.DiscountPaisa,
			&inv.LineItems, &inv.DueDate, &inv.PaidAt, &inv.Notes,
			&inv.CreatedAt, &inv.UpdatedAt,
			&inv.PlaceOfSupplyState, &inv.PlaceOfSupplyCode, &inv.AmountInWords, &inv.RoundOffPaisa,
			&inv.QuotationValidUntil, &inv.CreditNoteInvoiceID, &inv.CreditNoteReason, &inv.SourcePackageID,
		); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

func (r *InvoiceRepo) UpdateStatus(ctx context.Context, workspaceID, id uuid.UUID, status string) error {
	_, err := r.DB.Exec(ctx, `
		UPDATE invoices SET status=$1, updated_at=$2 WHERE id=$3 AND workspace_id=$4`,
		status, time.Now().UTC(), id, workspaceID)
	return err
}

// UpdateStatusAndPaid atomically updates both status and amount_paid_paisa.
func (r *InvoiceRepo) UpdateStatusAndPaid(ctx context.Context, workspaceID, id uuid.UUID, status string, amountPaidPaisa int64) error {
	_, err := r.DB.Exec(ctx, `
		UPDATE invoices SET status=$1, amount_paid_paisa=$2, updated_at=$3
		WHERE id=$4 AND workspace_id=$5`,
		status, amountPaidPaisa, time.Now().UTC(), id, workspaceID)
	return err
}

// GetNextInvoiceNumber generates sequential invoice number: INV-{FY}-{SEQ}
func (r *InvoiceRepo) GetNextInvoiceNumber(ctx context.Context, workspaceID uuid.UUID) (string, error) {
	now := time.Now().UTC()
	year := now.Year()
	if now.Month() < time.April {
		year--
	}
	fy := fmt.Sprintf("%d-%02d", year, (year+1)%100)
	fyStart := time.Date(year, time.April, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(year+1, time.April, 1, 0, 0, 0, 0, time.UTC)

	var count int64
	err := r.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM invoices
		WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3`,
		workspaceID, fyStart, fyEnd).Scan(&count)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("INV-%s-%06d", fy, count+1), nil
}
