package service

// PDFService generates PDFs for contracts, invoices, receipts, GSTR reports,
// payout statements, audit log exports, and DSR export packages.
//
// This implementation writes minimal valid PDF 1.4 documents using only the
// standard library — no cgo, no external binaries, no network calls. It uses
// the Helvetica standard Type 1 font (guaranteed present in every PDF reader)
// so no font embedding is required.
//
// Document model is intentionally simple: a sequence of text lines rendered
// one per line, wrapped into pages of ~56 lines each. For richer output
// (tables, images, signatures) a future renderer can swap in without changing
// the service surface — callers depend on the method set, not the bytes.

import (
	"bytes"
	"fmt"
	"strings"
	"text/template"
)

// PDFService renders PDF documents.
type PDFService struct{}

// NewPDFService creates a new PDFService. It holds no state.
func NewPDFService() *PDFService {
	return &PDFService{}
}

// Receipt captures the fields rendered on a payment receipt PDF.
type Receipt struct {
	Title         string
	ReceiptNumber string
	ClientName    string
	DatePaid      string
	AmountText    string
	Method        string
	Notes         string
}

// Invoice captures the fields rendered on an invoice PDF. Line items are
// rendered sequentially below the header.
type Invoice struct {
	Title         string
	InvoiceNumber string
	IssueDate     string
	DueDate       string
	ClientName    string
	ClientGSTIN   string
	Lines         []InvoiceLine
	SubtotalText  string
	CGSTText      string
	SGSTText      string
	IGSTText      string
	TotalText     string
	Notes         string
}

// InvoiceLine is one row on an invoice.
type InvoiceLine struct {
	Description string
	QuantityText string
	UnitText     string
	AmountText   string
}

// Contract captures the fields rendered on a contract PDF.
type Contract struct {
	Title       string
	ContractID  string
	PartyA      string
	PartyB      string
	EffectiveOn string
	Body        string
}

// RenderText renders a plain-text document. Newlines become new lines in the
// PDF. Special PDF metacharacters are escaped.
func (s *PDFService) RenderText(text string) ([]byte, error) {
	lines := strings.Split(text, "\n")
	return buildPDF("RawDrive Document", lines)
}

// RenderTemplate executes a Go text/template with the given data and renders
// the result as a plain-text PDF.
func (s *PDFService) RenderTemplate(tpl string, data any) ([]byte, error) {
	t, err := template.New("pdf").Parse(tpl)
	if err != nil {
		return nil, fmt.Errorf("pdf template parse: %w", err)
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return nil, fmt.Errorf("pdf template execute: %w", err)
	}
	return s.RenderText(buf.String())
}

// RenderReceipt produces a payment-receipt PDF.
func (s *PDFService) RenderReceipt(r Receipt) ([]byte, error) {
	if r.Title == "" {
		r.Title = "Payment Receipt"
	}
	lines := []string{
		r.Title,
		"",
		"Receipt No: " + r.ReceiptNumber,
		"Date Paid:  " + r.DatePaid,
		"",
		"Received From: " + r.ClientName,
		"Amount:        " + r.AmountText,
		"Method:        " + r.Method,
	}
	if r.Notes != "" {
		lines = append(lines, "", "Notes:", r.Notes)
	}
	lines = append(lines, "", "This is a system-generated receipt.")
	return buildPDF(r.Title, lines)
}

// RenderInvoice produces an invoice PDF.
func (s *PDFService) RenderInvoice(inv Invoice) ([]byte, error) {
	if inv.Title == "" {
		inv.Title = "Tax Invoice"
	}
	lines := []string{
		inv.Title,
		"",
		"Invoice No: " + inv.InvoiceNumber,
		"Issue Date: " + inv.IssueDate,
		"Due Date:   " + inv.DueDate,
		"",
		"Billed To: " + inv.ClientName,
	}
	if inv.ClientGSTIN != "" {
		lines = append(lines, "GSTIN:     "+inv.ClientGSTIN)
	}
	lines = append(lines, "", "Items:")
	for _, l := range inv.Lines {
		lines = append(lines, fmt.Sprintf("  %-40s %6s %-6s %12s",
			truncate(l.Description, 40), l.QuantityText, l.UnitText, l.AmountText))
	}
	lines = append(lines, "")
	if inv.SubtotalText != "" {
		lines = append(lines, "Subtotal: "+inv.SubtotalText)
	}
	if inv.CGSTText != "" {
		lines = append(lines, "CGST:     "+inv.CGSTText)
	}
	if inv.SGSTText != "" {
		lines = append(lines, "SGST:     "+inv.SGSTText)
	}
	if inv.IGSTText != "" {
		lines = append(lines, "IGST:     "+inv.IGSTText)
	}
	lines = append(lines, "TOTAL:    "+inv.TotalText)
	if inv.Notes != "" {
		lines = append(lines, "", "Notes:", inv.Notes)
	}
	return buildPDF(inv.Title, lines)
}

// RenderContract produces a contract PDF with a header block and free-form
// body text.
func (s *PDFService) RenderContract(c Contract) ([]byte, error) {
	if c.Title == "" {
		c.Title = "Service Agreement"
	}
	lines := []string{
		c.Title,
		"",
		"Contract ID:   " + c.ContractID,
		"Effective On:  " + c.EffectiveOn,
		"",
		"Between: " + c.PartyA,
		"And:     " + c.PartyB,
		"",
	}
	lines = append(lines, strings.Split(c.Body, "\n")...)
	return buildPDF(c.Title, lines)
}

// ─── Minimal PDF 1.4 writer ──────────────────────────────────────────────
//
// The writer builds a PDF with:
//   1. Catalog → Pages
//   2. Pages → Kids [...page refs]
//   3. Font → Helvetica (Type 1 standard 14)
//   4. N Page objects, each with its own Contents stream
//   5. A single xref table + trailer
//
// Coordinates are in PDF points (72 DPI). Page size is US Letter (612×792).
// We reserve 72pt margins and use 12pt font, giving ~56 lines/page.

const (
	pdfPageWidth  = 612
	pdfPageHeight = 792
	pdfMarginX    = 72
	pdfMarginTop  = 72
	pdfFontSize   = 12
	pdfLineHeight = 14
	pdfLinesPerPage = 48
	pdfMaxCharsPerLine = 80
)

func buildPDF(title string, lines []string) ([]byte, error) {
	// Wrap long lines and paginate.
	wrapped := make([]string, 0, len(lines))
	for _, l := range lines {
		if len(l) <= pdfMaxCharsPerLine {
			wrapped = append(wrapped, l)
			continue
		}
		// naive character-count wrap; callers can pre-wrap for prettier output
		for len(l) > pdfMaxCharsPerLine {
			wrapped = append(wrapped, l[:pdfMaxCharsPerLine])
			l = l[pdfMaxCharsPerLine:]
		}
		if l != "" {
			wrapped = append(wrapped, l)
		}
	}

	// Split into pages.
	var pages [][]string
	for i := 0; i < len(wrapped); i += pdfLinesPerPage {
		end := i + pdfLinesPerPage
		if end > len(wrapped) {
			end = len(wrapped)
		}
		pages = append(pages, wrapped[i:end])
	}
	if len(pages) == 0 {
		pages = [][]string{{""}}
	}

	// Object layout:
	// 1: Catalog
	// 2: Pages
	// 3: Font
	// 4..4+N-1: Page objects
	// 4+N..: Content streams
	numPages := len(pages)
	pageObjStart := 4
	contentObjStart := pageObjStart + numPages

	var buf bytes.Buffer
	offsets := []int{0} // obj 0 is the free entry

	writeObj := func(body string) {
		offsets = append(offsets, buf.Len())
		buf.WriteString(body)
	}

	// Header
	buf.WriteString("%PDF-1.4\n")
	// Binary marker so tools treat this as binary (per PDF spec recommendation)
	buf.WriteString("%\xFF\xFF\xFF\xFF\n")

	// Build page refs string for /Kids
	var kids strings.Builder
	for i := 0; i < numPages; i++ {
		if i > 0 {
			kids.WriteByte(' ')
		}
		fmt.Fprintf(&kids, "%d 0 R", pageObjStart+i)
	}

	// Obj 1: Catalog
	writeObj(fmt.Sprintf("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"))

	// Obj 2: Pages
	writeObj(fmt.Sprintf("2 0 obj\n<< /Type /Pages /Kids [%s] /Count %d /MediaBox [0 0 %d %d] >>\nendobj\n",
		kids.String(), numPages, pdfPageWidth, pdfPageHeight))

	// Obj 3: Font (Helvetica)
	writeObj("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n")

	// Obj 4..: Page objects
	for i := 0; i < numPages; i++ {
		contentRef := contentObjStart + i
		writeObj(fmt.Sprintf("%d 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>\nendobj\n",
			pageObjStart+i, contentRef))
	}

	// Content streams, one per page
	for i, pageLines := range pages {
		var sb strings.Builder
		sb.WriteString("BT\n")
		fmt.Fprintf(&sb, "/F1 %d Tf\n", pdfFontSize)
		fmt.Fprintf(&sb, "%d %d Td\n", pdfMarginX, pdfPageHeight-pdfMarginTop)
		fmt.Fprintf(&sb, "%d TL\n", pdfLineHeight)
		for j, l := range pageLines {
			if j == 0 {
				fmt.Fprintf(&sb, "(%s) Tj\n", escapePDFString(l))
			} else {
				fmt.Fprintf(&sb, "(%s) '\n", escapePDFString(l)) // ' = next-line show
			}
		}
		sb.WriteString("ET\n")
		stream := sb.String()
		writeObj(fmt.Sprintf("%d 0 obj\n<< /Length %d >>\nstream\n%sendstream\nendobj\n",
			contentObjStart+i, len(stream), stream))
	}

	// xref
	xrefOffset := buf.Len()
	totalObjs := 1 + 3 + numPages + numPages // obj0 free + catalog/pages/font + pages + streams
	fmt.Fprintf(&buf, "xref\n0 %d\n", totalObjs)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i < totalObjs; i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}

	// trailer
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF",
		totalObjs, xrefOffset)

	// Silence unused warning for `title` — currently we do not write a
	// document info dict, but callers pass it so we can add /Info in a
	// future iteration without changing the signature.
	_ = title

	return buf.Bytes(), nil
}

// escapePDFString escapes the three PDF literal-string metacharacters.
// Per PDF 1.4 section 3.2.3: backslash, left paren, right paren must be
// escaped inside a (...) literal string.
func escapePDFString(s string) string {
	var sb strings.Builder
	sb.Grow(len(s))
	for _, r := range s {
		switch r {
		case '\\':
			sb.WriteString(`\\`)
		case '(':
			sb.WriteString(`\(`)
		case ')':
			sb.WriteString(`\)`)
		case '\r':
			// strip carriage returns; the ' operator already advances a line
		default:
			if r < 0x20 {
				continue // skip other control bytes
			}
			if r > 0xFF {
				// WinAnsiEncoding is single-byte; substitute a placeholder
				// for non-Latin-1 characters. Rich Unicode support would
				// require font embedding.
				sb.WriteByte('?')
				continue
			}
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	if n <= 3 {
		return s[:n]
	}
	return s[:n-3] + "..."
}
