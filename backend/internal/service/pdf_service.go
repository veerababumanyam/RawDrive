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

// Invoice captures the fields rendered on an invoice PDF. The renderer
// produces a professional multi-section layout:
//
//   1. Studio header block (name, address, GSTIN, phone, email, website)
//   2. "TAX INVOICE" title + invoice meta (number, date, due)
//   3. Bill-to block (client name, address, GSTIN, place of supply)
//   4. Itemized table (S.No / Description / HSN / Qty / Rate / Amount)
//   5. GST breakup (Subtotal / CGST / SGST / IGST / Total)
//   6. Amount in words
//   7. Bank details (name / account holder / account / IFSC / branch)
//   8. Terms + footer + signature line
//
// All studio-branding fields are optional — callers should pass what they
// have, empty strings collapse gracefully. The legacy two-field signature
// (ClientName + ClientGSTIN) still works; new fields are additive.
type Invoice struct {
	Title         string
	InvoiceNumber string
	IssueDate     string
	DueDate       string

	// Studio branding block (from workspaces table).
	StudioName        string
	StudioAddressL1   string
	StudioAddressL2   string
	StudioCity        string
	StudioPostalCode  string
	StudioGSTIN       string
	StudioPhone       string
	StudioEmail       string
	StudioWebsite     string

	// Bill-to block.
	ClientName        string
	ClientAddressL1   string
	ClientAddressL2   string
	ClientCity        string
	ClientPostalCode  string
	ClientGSTIN       string
	ClientPhone       string
	PlaceOfSupply     string

	// Itemized table + totals.
	Lines         []InvoiceLine
	SubtotalText  string
	CGSTText      string
	SGSTText      string
	IGSTText      string
	DiscountText  string
	TotalText     string
	AmountInWords string

	// Bank + payment details.
	BankName          string
	BankAccountHolder string
	BankAccountNumber string
	BankIFSC          string
	BankBranch        string

	// Footer.
	Terms         string
	Notes         string
	SignatureName string
	Footer        string
}

// InvoiceLine is one row on an invoice.
type InvoiceLine struct {
	Description  string
	HSN          string
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

// RenderInvoice produces a professional tax invoice PDF with studio
// branding, itemized table, GST breakup, amount-in-words, bank details,
// terms, and a signature line. All branding fields are optional — callers
// should pass whatever is populated on the workspace, missing sections are
// simply skipped.
func (s *PDFService) RenderInvoice(inv Invoice) ([]byte, error) {
	if inv.Title == "" {
		inv.Title = "Tax Invoice"
	}
	const rule = "================================================================================"
	const sub = "--------------------------------------------------------------------------------"

	lines := []string{}

	// ── Studio header + invoice meta (two-column) ──────────────────────────
	studioName := inv.StudioName
	if studioName == "" {
		studioName = "RawDrive Studio"
	}
	studioHeader := []string{
		strings.ToUpper(studioName),
	}
	if inv.StudioAddressL1 != "" {
		studioHeader = append(studioHeader, inv.StudioAddressL1)
	}
	if inv.StudioAddressL2 != "" {
		studioHeader = append(studioHeader, inv.StudioAddressL2)
	}
	cityLine := strings.TrimSpace(strings.Join(nonEmpty([]string{inv.StudioCity, inv.StudioPostalCode}), " "))
	if cityLine != "" {
		studioHeader = append(studioHeader, cityLine)
	}
	if inv.StudioGSTIN != "" {
		studioHeader = append(studioHeader, "GSTIN: "+inv.StudioGSTIN)
	}
	if inv.StudioPhone != "" {
		studioHeader = append(studioHeader, "Phone: "+inv.StudioPhone)
	}
	if inv.StudioEmail != "" {
		studioHeader = append(studioHeader, "Email: "+inv.StudioEmail)
	}
	if inv.StudioWebsite != "" {
		studioHeader = append(studioHeader, inv.StudioWebsite)
	}

	invoiceMeta := []string{
		strings.ToUpper(inv.Title),
		"Invoice: " + inv.InvoiceNumber,
		"Date:    " + inv.IssueDate,
	}
	if inv.DueDate != "" {
		invoiceMeta = append(invoiceMeta, "Due:     "+inv.DueDate)
	}

	lines = append(lines, rule)
	lines = append(lines, twoColumn(studioHeader, invoiceMeta, 50, 30)...)
	lines = append(lines, rule)
	lines = append(lines, "")

	// ── Bill-to block ──────────────────────────────────────────────────────
	lines = append(lines, "BILL TO:")
	lines = append(lines, "  "+inv.ClientName)
	if inv.ClientAddressL1 != "" {
		lines = append(lines, "  "+inv.ClientAddressL1)
	}
	if inv.ClientAddressL2 != "" {
		lines = append(lines, "  "+inv.ClientAddressL2)
	}
	clientCityLine := strings.TrimSpace(strings.Join(nonEmpty([]string{inv.ClientCity, inv.ClientPostalCode}), " "))
	if clientCityLine != "" {
		lines = append(lines, "  "+clientCityLine)
	}
	if inv.ClientGSTIN != "" {
		lines = append(lines, "  GSTIN: "+inv.ClientGSTIN)
	}
	if inv.ClientPhone != "" {
		lines = append(lines, "  Phone: "+inv.ClientPhone)
	}
	if inv.PlaceOfSupply != "" {
		lines = append(lines, "  Place of Supply: "+inv.PlaceOfSupply)
	}
	lines = append(lines, "")

	// ── Itemized table ─────────────────────────────────────────────────────
	lines = append(lines, rule)
	lines = append(lines, fmt.Sprintf("%-4s  %-38s  %-8s  %5s  %10s  %12s",
		"S.No", "DESCRIPTION", "HSN", "QTY", "RATE", "AMOUNT"))
	lines = append(lines, sub)
	for i, l := range inv.Lines {
		lines = append(lines, fmt.Sprintf("%-4d  %-38s  %-8s  %5s  %10s  %12s",
			i+1,
			truncate(l.Description, 38),
			truncate(l.HSN, 8),
			l.QuantityText,
			l.UnitText,
			l.AmountText))
	}
	lines = append(lines, rule)
	lines = append(lines, "")

	// ── GST breakup (right-aligned summary) ────────────────────────────────
	if inv.SubtotalText != "" {
		lines = append(lines, padRight("Subtotal:", inv.SubtotalText))
	}
	if inv.DiscountText != "" {
		lines = append(lines, padRight("Discount:", inv.DiscountText))
	}
	if inv.CGSTText != "" {
		lines = append(lines, padRight("CGST:", inv.CGSTText))
	}
	if inv.SGSTText != "" {
		lines = append(lines, padRight("SGST:", inv.SGSTText))
	}
	if inv.IGSTText != "" {
		lines = append(lines, padRight("IGST:", inv.IGSTText))
	}
	lines = append(lines, padRight("", "------------"))
	lines = append(lines, padRight("TOTAL:", inv.TotalText))
	lines = append(lines, "")

	if inv.AmountInWords != "" {
		lines = append(lines, "Amount in words: "+inv.AmountInWords)
		lines = append(lines, "")
	}

	// ── Bank details + Terms (two-column) ──────────────────────────────────
	bankLines := []string{}
	if inv.BankName != "" || inv.BankAccountNumber != "" {
		bankLines = append(bankLines, "BANK DETAILS")
		if inv.BankName != "" {
			bankLines = append(bankLines, "Bank:     "+inv.BankName)
		}
		if inv.BankAccountHolder != "" {
			bankLines = append(bankLines, "A/C Name: "+inv.BankAccountHolder)
		}
		if inv.BankAccountNumber != "" {
			bankLines = append(bankLines, "A/C No.:  "+inv.BankAccountNumber)
		}
		if inv.BankIFSC != "" {
			bankLines = append(bankLines, "IFSC:     "+inv.BankIFSC)
		}
		if inv.BankBranch != "" {
			bankLines = append(bankLines, "Branch:   "+inv.BankBranch)
		}
	}

	termsLines := []string{}
	if inv.Terms != "" {
		termsLines = append(termsLines, "TERMS & CONDITIONS")
		// Wrap long term paragraphs at the right-column width
		// (38 chars) so the two-column layout stays readable.
		for _, t := range strings.Split(inv.Terms, "\n") {
			t = strings.TrimSpace(t)
			if t == "" {
				continue
			}
			termsLines = append(termsLines, wrapText(t, 38)...)
		}
	}

	if len(bankLines) > 0 || len(termsLines) > 0 {
		lines = append(lines, rule)
		lines = append(lines, twoColumn(bankLines, termsLines, 40, 40)...)
		lines = append(lines, rule)
		lines = append(lines, "")
	}

	// ── Notes ──────────────────────────────────────────────────────────────
	if inv.Notes != "" {
		lines = append(lines, "Notes:")
		for _, n := range strings.Split(inv.Notes, "\n") {
			lines = append(lines, "  "+n)
		}
		lines = append(lines, "")
	}

	// ── Signature block ────────────────────────────────────────────────────
	lines = append(lines, "")
	if inv.StudioName != "" {
		lines = append(lines, padRightFixed("", "For "+inv.StudioName, 80))
	}
	lines = append(lines, "")
	lines = append(lines, "")
	lines = append(lines, padRightFixed("", "_________________________", 80))
	sigName := inv.SignatureName
	if sigName == "" {
		sigName = "Authorized Signatory"
	}
	lines = append(lines, padRightFixed("", sigName, 80))
	lines = append(lines, "")
	lines = append(lines, rule)

	footer := inv.Footer
	if footer == "" {
		footer = "This is a computer-generated invoice and does not require a physical signature."
	}
	lines = append(lines, footer)

	return buildPDF(inv.Title, lines)
}

// nonEmpty filters empty strings out of a slice.
func nonEmpty(parts []string) []string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			out = append(out, p)
		}
	}
	return out
}

// twoColumn lays out two blocks side-by-side with fixed widths and a
// two-space gutter. Short columns are padded with spaces; taller column
// wins the row count.
func twoColumn(left, right []string, leftWidth, rightWidth int) []string {
	n := len(left)
	if len(right) > n {
		n = len(right)
	}
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		var l, r string
		if i < len(left) {
			l = left[i]
		}
		if i < len(right) {
			r = right[i]
		}
		if len(l) > leftWidth {
			l = l[:leftWidth]
		}
		if len(r) > rightWidth {
			r = r[:rightWidth]
		}
		out = append(out, fmt.Sprintf("%-*s  %-*s", leftWidth, l, rightWidth, r))
	}
	return out
}

// padRight right-aligns the value column to column 80, placing the label
// ~20 chars to its left. Used for the GST breakup block.
func padRight(label, value string) string {
	leftFill := 80 - 20 - len(value) - 2
	if leftFill < 0 {
		leftFill = 0
	}
	return fmt.Sprintf("%*s%-20s%s", leftFill, "", label, value)
}

// padRightFixed right-aligns the value column to the given width.
func padRightFixed(label, value string, totalWidth int) string {
	leftFill := totalWidth - len(label) - len(value)
	if leftFill < 0 {
		leftFill = 0
	}
	return fmt.Sprintf("%s%*s%s", label, leftFill, "", value)
}

// wrapText breaks a long line into multiple lines each at most `width`
// characters wide, using a simple greedy word-wrap. Used to fit wide
// paragraphs (terms & conditions) inside a narrow two-column layout.
func wrapText(s string, width int) []string {
	if width <= 0 || len(s) <= width {
		return []string{s}
	}
	words := strings.Fields(s)
	var out []string
	var current string
	for _, w := range words {
		if current == "" {
			current = w
			continue
		}
		if len(current)+1+len(w) > width {
			out = append(out, current)
			current = w
		} else {
			current += " " + w
		}
	}
	if current != "" {
		out = append(out, current)
	}
	return out
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
