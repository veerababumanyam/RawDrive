package service

import (
	"strings"
	"testing"
	"time"
)

func TestParseFinancialYear(t *testing.T) {
	start, end, label, err := ParseFinancialYear("2026-27")
	if err != nil {
		t.Fatalf("ParseFinancialYear returned error: %v", err)
	}
	if label != "2026-27" {
		t.Fatalf("label = %q, want 2026-27", label)
	}
	if !start.Equal(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("start = %s", start)
	}
	if !end.Equal(time.Date(2027, time.April, 1, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("end = %s", end)
	}
}

func TestClassifyGSTR1Supply(t *testing.T) {
	if got := ClassifyGSTR1Supply("27AABCU9603R1ZM"); got != "B2B" {
		t.Fatalf("GSTIN classification = %q, want B2B", got)
	}
	if got := ClassifyGSTR1Supply(""); got != "B2C" {
		t.Fatalf("empty GSTIN classification = %q, want B2C", got)
	}
	if got := ClassifyGSTR1Supply("   "); got != "B2C" {
		t.Fatalf("blank GSTIN classification = %q, want B2C", got)
	}
}

func TestGSTR1ReportCSV(t *testing.T) {
	report := GSTR1Report{
		FinancialYear: "2026-27",
		Entries: []GSTR1Entry{
			{
				InvoiceNumber: "INV-2026-27-000001",
				InvoiceDate:   "02-04-2026",
				ClientName:    "Asha Weddings",
				ClientGSTIN:   "29AABCU9603R1ZM",
				PlaceOfSupply: "Karnataka",
				SACCode:       DefaultPhotographySAC,
				TaxableValue:  100000,
				CGSTPaisa:     0,
				SGSTPaisa:     0,
				IGSTPaisa:     18000,
				TotalPaisa:    118000,
				SupplyType:    "B2B",
			},
			{
				InvoiceNumber: "CN-2026-27-000001",
				InvoiceDate:   "04-04-2026",
				ClientName:    "Walk-in Client",
				PlaceOfSupply: "Telangana",
				SACCode:       DefaultPhotographySAC,
				TaxableValue:  -50000,
				CGSTPaisa:     -4500,
				SGSTPaisa:     -4500,
				TotalPaisa:    -59000,
				SupplyType:    "B2C",
			},
		},
	}
	report.RecalculateTotals()

	if report.B2BCount != 1 || report.B2CCount != 1 || report.TotalTaxablePaisa != 50000 || report.TotalPaisa != 59000 {
		t.Fatalf("unexpected totals: %#v", report)
	}

	csv, err := report.CSV()
	if err != nil {
		t.Fatalf("CSV returned error: %v", err)
	}
	if !strings.Contains(csv, "Invoice No,Date,Client Name,Client GSTIN,Place of Supply,SAC Code,Taxable Value,CGST,SGST,IGST,Total,Supply Type") {
		t.Fatalf("CSV header missing: %s", csv)
	}
	if !strings.Contains(csv, "INV-2026-27-000001,02-04-2026,Asha Weddings,29AABCU9603R1ZM,Karnataka,998386,1000.00,0.00,0.00,180.00,1180.00,B2B") {
		t.Fatalf("B2B row missing: %s", csv)
	}
	if !strings.Contains(csv, "CN-2026-27-000001,04-04-2026,Walk-in Client,,Telangana,998386,-500.00,-45.00,-45.00,0.00,-590.00,B2C") {
		t.Fatalf("credit note row missing: %s", csv)
	}
}
