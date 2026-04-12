package service

import "testing"

func TestNormalizeInvoiceDocumentType(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want InvoiceDocumentType
	}{
		{name: "empty defaults to tax invoice", in: "", want: InvoiceDocumentTaxInvoice},
		{name: "legacy service is tax invoice", in: "service", want: InvoiceDocumentTaxInvoice},
		{name: "tax invoice alias", in: "tax_invoice", want: InvoiceDocumentTaxInvoice},
		{name: "proforma", in: "proforma", want: InvoiceDocumentProforma},
		{name: "quotation", in: "quotation", want: InvoiceDocumentQuotation},
		{name: "credit note", in: "credit_note", want: InvoiceDocumentCreditNote},
		{name: "unknown falls back to tax invoice", in: "garbage", want: InvoiceDocumentTaxInvoice},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeInvoiceDocumentType(tt.in)
			if got != tt.want {
				t.Fatalf("NormalizeInvoiceDocumentType(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestInvoiceDocumentMetadata(t *testing.T) {
	tests := []struct {
		docType      InvoiceDocumentType
		wantDBValue  string
		wantPDFTitle string
		wantFiling   bool
		wantNegative bool
	}{
		{docType: InvoiceDocumentTaxInvoice, wantDBValue: "service", wantPDFTitle: "Tax Invoice", wantFiling: true},
		{docType: InvoiceDocumentProforma, wantDBValue: "proforma", wantPDFTitle: "PROFORMA INVOICE"},
		{docType: InvoiceDocumentQuotation, wantDBValue: "quotation", wantPDFTitle: "QUOTATION"},
		{docType: InvoiceDocumentCreditNote, wantDBValue: "credit_note", wantPDFTitle: "CREDIT NOTE", wantFiling: true, wantNegative: true},
	}

	for _, tt := range tests {
		t.Run(string(tt.docType), func(t *testing.T) {
			if got := tt.docType.DBValue(); got != tt.wantDBValue {
				t.Fatalf("DBValue() = %q, want %q", got, tt.wantDBValue)
			}
			if got := tt.docType.PDFTitle(); got != tt.wantPDFTitle {
				t.Fatalf("PDFTitle() = %q, want %q", got, tt.wantPDFTitle)
			}
			if got := tt.docType.HasGSTFilingImpact(); got != tt.wantFiling {
				t.Fatalf("HasGSTFilingImpact() = %v, want %v", got, tt.wantFiling)
			}
			if got := tt.docType.RequiresNegativeAmounts(); got != tt.wantNegative {
				t.Fatalf("RequiresNegativeAmounts() = %v, want %v", got, tt.wantNegative)
			}
		})
	}
}
