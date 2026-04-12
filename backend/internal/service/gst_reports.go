package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
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
	PlaceOfSupply string `json:"place_of_supply"`
	SACCode       string `json:"sac_code"`
	TaxableValue  int64  `json:"taxable_value_paisa"`
	CGSTPaisa     int64  `json:"cgst_paisa"`
	SGSTPaisa     int64  `json:"sgst_paisa"`
	IGSTPaisa     int64  `json:"igst_paisa"`
	TotalPaisa    int64  `json:"total_paisa"`
	SupplyType    string `json:"supply_type"` // B2B or B2C
}

// GSTR1Report is the financial-year level outward supply report.
type GSTR1Report struct {
	FinancialYear     string       `json:"financial_year"`
	Entries           []GSTR1Entry `json:"entries"`
	B2BCount          int          `json:"b2b_count"`
	B2CCount          int          `json:"b2c_count"`
	TotalTaxablePaisa int64        `json:"total_taxable_paisa"`
	TotalCGSTPaisa    int64        `json:"total_cgst_paisa"`
	TotalSGSTPaisa    int64        `json:"total_sgst_paisa"`
	TotalIGSTPaisa    int64        `json:"total_igst_paisa"`
	TotalPaisa        int64        `json:"total_paisa"`
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

// ParseFinancialYear parses labels like "2026-27" into the Indian financial
// year bounds: 1 Apr 2026 inclusive through 1 Apr 2027 exclusive.
func ParseFinancialYear(fy string) (time.Time, time.Time, string, error) {
	parts := strings.Split(strings.TrimSpace(fy), "-")
	if len(parts) != 2 || len(parts[0]) != 4 || len(parts[1]) != 2 {
		return time.Time{}, time.Time{}, "", fmt.Errorf("invalid financial year %q", fy)
	}
	startYear, err := strconv.Atoi(parts[0])
	if err != nil {
		return time.Time{}, time.Time{}, "", fmt.Errorf("invalid financial year %q", fy)
	}
	endSuffix, err := strconv.Atoi(parts[1])
	if err != nil {
		return time.Time{}, time.Time{}, "", fmt.Errorf("invalid financial year %q", fy)
	}
	if (startYear+1)%100 != endSuffix {
		return time.Time{}, time.Time{}, "", fmt.Errorf("invalid financial year sequence %q", fy)
	}
	start := time.Date(startYear, time.April, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(startYear+1, time.April, 1, 0, 0, 0, 0, time.UTC)
	return start, end, fmt.Sprintf("%d-%02d", startYear, endSuffix), nil
}

// CurrentFinancialYear returns the active Indian financial year for now.
func CurrentFinancialYear(now time.Time) string {
	year := now.Year()
	if now.Month() < time.April {
		year--
	}
	return fmt.Sprintf("%d-%02d", year, (year+1)%100)
}

func ClassifyGSTR1Supply(clientGSTIN string) string {
	if strings.TrimSpace(clientGSTIN) == "" {
		return "B2C"
	}
	return "B2B"
}

func (r *GSTR1Report) RecalculateTotals() {
	r.B2BCount = 0
	r.B2CCount = 0
	r.TotalTaxablePaisa = 0
	r.TotalCGSTPaisa = 0
	r.TotalSGSTPaisa = 0
	r.TotalIGSTPaisa = 0
	r.TotalPaisa = 0
	for i := range r.Entries {
		if r.Entries[i].SACCode == "" {
			r.Entries[i].SACCode = DefaultPhotographySAC
		}
		if r.Entries[i].SupplyType == "B2B" {
			r.B2BCount++
		} else {
			r.Entries[i].SupplyType = "B2C"
			r.B2CCount++
		}
		r.TotalTaxablePaisa += r.Entries[i].TaxableValue
		r.TotalCGSTPaisa += r.Entries[i].CGSTPaisa
		r.TotalSGSTPaisa += r.Entries[i].SGSTPaisa
		r.TotalIGSTPaisa += r.Entries[i].IGSTPaisa
		r.TotalPaisa += r.Entries[i].TotalPaisa
	}
}

func (r GSTR1Report) CSV() (string, error) {
	var b strings.Builder
	w := csv.NewWriter(&b)
	if err := w.Write([]string{
		"Invoice No", "Date", "Client Name", "Client GSTIN", "Place of Supply",
		"SAC Code", "Taxable Value", "CGST", "SGST", "IGST", "Total", "Supply Type",
	}); err != nil {
		return "", err
	}
	for _, e := range r.Entries {
		sac := e.SACCode
		if sac == "" {
			sac = DefaultPhotographySAC
		}
		if err := w.Write([]string{
			e.InvoiceNumber,
			e.InvoiceDate,
			e.ClientName,
			e.ClientGSTIN,
			e.PlaceOfSupply,
			sac,
			formatPaisaDecimal(e.TaxableValue),
			formatPaisaDecimal(e.CGSTPaisa),
			formatPaisaDecimal(e.SGSTPaisa),
			formatPaisaDecimal(e.IGSTPaisa),
			formatPaisaDecimal(e.TotalPaisa),
			e.SupplyType,
		}); err != nil {
			return "", err
		}
	}
	w.Flush()
	return b.String(), w.Error()
}

func formatPaisaDecimal(paisa int64) string {
	sign := ""
	if paisa < 0 {
		sign = "-"
		paisa = -paisa
	}
	return fmt.Sprintf("%s%d.%02d", sign, paisa/100, paisa%100)
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
		e.SACCode = DefaultPhotographySAC
		e.SupplyType = ClassifyGSTR1Supply(e.ClientGSTIN)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// GenerateGSTR1FinancialYear produces GSTR-1 outward supply data for a full
// Indian financial year. It includes tax invoices and credit notes only.
func (s *GSTReportService) GenerateGSTR1FinancialYear(ctx context.Context, workspaceID uuid.UUID, fy string) (GSTR1Report, error) {
	start, end, label, err := ParseFinancialYear(fy)
	if err != nil {
		return GSTR1Report{}, err
	}
	report := GSTR1Report{FinancialYear: label}

	rows, err := s.db.Query(ctx, `
		SELECT i.invoice_number, i.created_at, COALESCE(c.name, ''),
		       COALESCE(c.gstin, ''), COALESCE(i.place_of_supply_state, ''),
		       i.invoice_type, i.subtotal_paisa, i.cgst_paisa, i.sgst_paisa,
		       i.igst_paisa, i.total_paisa
		FROM invoices i
		LEFT JOIN contacts c ON i.contact_id = c.id AND c.workspace_id = i.workspace_id
		WHERE i.workspace_id = $1
		  AND i.created_at >= $2 AND i.created_at < $3
		  AND i.status != 'cancelled'
		  AND i.invoice_type IN ('service', 'credit_note')
		ORDER BY i.created_at ASC`,
		workspaceID, start, end)
	if err != nil {
		return report, fmt.Errorf("gstr1 fy query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var e GSTR1Entry
		var createdAt time.Time
		var invoiceType string
		if err := rows.Scan(&e.InvoiceNumber, &createdAt, &e.ClientName, &e.ClientGSTIN,
			&e.PlaceOfSupply, &invoiceType, &e.TaxableValue, &e.CGSTPaisa, &e.SGSTPaisa,
			&e.IGSTPaisa, &e.TotalPaisa); err != nil {
			return report, err
		}
		e.InvoiceDate = createdAt.Format("02-01-2006")
		e.SACCode = DefaultPhotographySAC
		e.SupplyType = ClassifyGSTR1Supply(e.ClientGSTIN)
		if invoiceType == InvoiceDocumentCreditNote.DBValue() {
			e.TaxableValue = ApplyCreditNoteSign(e.TaxableValue)
			e.CGSTPaisa = ApplyCreditNoteSign(e.CGSTPaisa)
			e.SGSTPaisa = ApplyCreditNoteSign(e.SGSTPaisa)
			e.IGSTPaisa = ApplyCreditNoteSign(e.IGSTPaisa)
			e.TotalPaisa = ApplyCreditNoteSign(e.TotalPaisa)
		}
		report.Entries = append(report.Entries, e)
	}
	if err := rows.Err(); err != nil {
		return report, err
	}
	report.RecalculateTotals()
	return report, nil
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
