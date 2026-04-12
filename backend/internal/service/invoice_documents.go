package service

// InvoiceDocumentType is the domain name for the user-facing invoice document
// variants. The invoices table stores legacy "service" for tax invoices.
type InvoiceDocumentType string

const (
	InvoiceDocumentTaxInvoice InvoiceDocumentType = "tax_invoice"
	InvoiceDocumentProforma   InvoiceDocumentType = "proforma"
	InvoiceDocumentQuotation  InvoiceDocumentType = "quotation"
	InvoiceDocumentCreditNote InvoiceDocumentType = "credit_note"
)

// NormalizeInvoiceDocumentType accepts legacy and UI aliases and returns the
// canonical user-facing document type.
func NormalizeInvoiceDocumentType(raw string) InvoiceDocumentType {
	switch raw {
	case "proforma":
		return InvoiceDocumentProforma
	case "quotation", "estimate":
		return InvoiceDocumentQuotation
	case "credit_note":
		return InvoiceDocumentCreditNote
	default:
		return InvoiceDocumentTaxInvoice
	}
}

// DBValue returns the value accepted by the existing invoices.invoice_type
// CHECK constraint.
func (t InvoiceDocumentType) DBValue() string {
	switch t {
	case InvoiceDocumentProforma:
		return "proforma"
	case InvoiceDocumentQuotation:
		return "quotation"
	case InvoiceDocumentCreditNote:
		return "credit_note"
	default:
		return "service"
	}
}

// PDFTitle returns the title shown at the top of generated PDFs.
func (t InvoiceDocumentType) PDFTitle() string {
	switch t {
	case InvoiceDocumentProforma:
		return "PROFORMA INVOICE"
	case InvoiceDocumentQuotation:
		return "QUOTATION"
	case InvoiceDocumentCreditNote:
		return "CREDIT NOTE"
	default:
		return "Tax Invoice"
	}
}

// HasGSTFilingImpact is true only for documents that belong in outward supply
// filing. Proforma invoices and quotations are commercial documents, not GST
// return rows.
func (t InvoiceDocumentType) HasGSTFilingImpact() bool {
	return t == InvoiceDocumentTaxInvoice || t == InvoiceDocumentCreditNote
}

// RequiresNegativeAmounts identifies credit-note documents whose totals should
// reduce GSTR-1 outward supply totals.
func (t InvoiceDocumentType) RequiresNegativeAmounts() bool {
	return t == InvoiceDocumentCreditNote
}

// ApplyCreditNoteSign forces credit-note monetary fields negative while leaving
// zero values unchanged.
func ApplyCreditNoteSign(amount int64) int64 {
	if amount > 0 {
		return -amount
	}
	return amount
}
