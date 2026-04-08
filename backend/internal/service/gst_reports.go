package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GSTR1Entry represents a single outward supply entry for GSTR-1 filing.
type GSTR1Entry struct {
	InvoiceNumber string `json:"invoice_number"`
	InvoiceDate   string `json:"invoice_date"`
	ClientName    string `json:"client_name"`
	ClientGSTIN   string `json:"client_gstin,omitempty"`
	HSNCode       string `json:"hsn_code"`
	TaxableValue  int64  `json:"taxable_value_paisa"`
	CGSTPaisa     int64  `json:"cgst_paisa"`
	SGSTPaisa     int64  `json:"sgst_paisa"`
	IGSTPaisa     int64  `json:"igst_paisa"`
	TotalPaisa    int64  `json:"total_paisa"`
	SupplyType    string `json:"supply_type"` // B2B or B2CS
}

// GSTR3BSummary represents the GSTR-3B summary totals.
type GSTR3BSummary struct {
	Period            string `json:"period"` // e.g. "April 2026"
	TotalTaxable      int64  `json:"total_taxable_paisa"`
	TotalCGST         int64  `json:"total_cgst_paisa"`
	TotalSGST         int64  `json:"total_sgst_paisa"`
	TotalIGST         int64  `json:"total_igst_paisa"`
	TotalTax          int64  `json:"total_tax_paisa"`
	TotalInvoiceCount int    `json:"total_invoice_count"`
}

// RevenueSummary holds revenue data for a time period.
type RevenueSummary struct {
	Period        string `json:"period"`
	TotalRevenue  int64  `json:"total_revenue_paisa"`
	TotalTax      int64  `json:"total_tax_paisa"`
	TotalReceived int64  `json:"total_received_paisa"`
	Outstanding   int64  `json:"outstanding_paisa"`
	InvoiceCount  int    `json:"invoice_count"`
}

// GSTReportService generates GST return data and financial reports.
type GSTReportService struct {
	db *pgxpool.Pool
}

func NewGSTReportService(db *pgxpool.Pool) *GSTReportService {
	return &GSTReportService{db: db}
}

// GenerateGSTR1 produces GSTR-1 outward supply data for a workspace and month.
func (s *GSTReportService) GenerateGSTR1(ctx context.Context, workspaceID uuid.UUID, year int, month time.Month) ([]GSTR1Entry, error) {
	start := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)

	rows, err := s.db.Query(ctx, `
		SELECT i.invoice_number, i.created_at, COALESCE(c.name, ''), COALESCE(c.company, ''),
		       i.subtotal_paisa, i.cgst_paisa, i.sgst_paisa, i.igst_paisa, i.total_paisa
		FROM invoices i
		LEFT JOIN contacts c ON i.contact_id = c.id
		WHERE i.workspace_id = $1 AND i.created_at >= $2 AND i.created_at < $3
		  AND i.status != 'cancelled'
		ORDER BY i.created_at ASC`,
		workspaceID, start, end)
	if err != nil {
		return nil, fmt.Errorf("gstr1 query: %w", err)
	}
	defer rows.Close()

	var entries []GSTR1Entry
	for rows.Next() {
		var e GSTR1Entry
		var createdAt time.Time
		var clientName, clientCompany string
		if err := rows.Scan(&e.InvoiceNumber, &createdAt, &clientName, &clientCompany,
			&e.TaxableValue, &e.CGSTPaisa, &e.SGSTPaisa, &e.IGSTPaisa, &e.TotalPaisa); err != nil {
			return nil, err
		}
		e.InvoiceDate = createdAt.Format("02-01-2006")
		e.ClientName = clientName
		e.HSNCode = "998395"
		if e.IGSTPaisa > 0 {
			e.SupplyType = "B2B"
		} else {
			e.SupplyType = "B2CS"
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// GenerateGSTR3B produces GSTR-3B summary for a workspace and month.
func (s *GSTReportService) GenerateGSTR3B(ctx context.Context, workspaceID uuid.UUID, year int, month time.Month) (GSTR3BSummary, error) {
	start := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	period := start.Format("January 2006")

	var summary GSTR3BSummary
	summary.Period = period

	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(subtotal_paisa), 0), COALESCE(SUM(cgst_paisa), 0),
		       COALESCE(SUM(sgst_paisa), 0), COALESCE(SUM(igst_paisa), 0), COUNT(*)
		FROM invoices
		WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3
		  AND status != 'cancelled'`,
		workspaceID, start, end).Scan(
		&summary.TotalTaxable, &summary.TotalCGST, &summary.TotalSGST,
		&summary.TotalIGST, &summary.TotalInvoiceCount)
	if err != nil {
		return summary, fmt.Errorf("gstr3b query: %w", err)
	}
	summary.TotalTax = summary.TotalCGST + summary.TotalSGST + summary.TotalIGST
	return summary, nil
}

// GetRevenueSummary returns revenue data for a workspace within a date range.
func (s *GSTReportService) GetRevenueSummary(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) (RevenueSummary, error) {
	var rs RevenueSummary
	rs.Period = fmt.Sprintf("%s to %s", from.Format("02 Jan 2006"), to.Format("02 Jan 2006"))

	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(total_paisa), 0),
		       COALESCE(SUM(cgst_paisa + sgst_paisa + igst_paisa), 0),
		       COALESCE(SUM(amount_paid_paisa), 0),
		       COALESCE(SUM(total_paisa - amount_paid_paisa), 0),
		       COUNT(*)
		FROM invoices
		WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3
		  AND status != 'cancelled'`,
		workspaceID, from, to).Scan(
		&rs.TotalRevenue, &rs.TotalTax, &rs.TotalReceived, &rs.Outstanding, &rs.InvoiceCount)
	if err != nil {
		return rs, fmt.Errorf("revenue summary: %w", err)
	}
	return rs, nil
}
