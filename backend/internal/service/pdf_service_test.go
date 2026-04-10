package service

import (
	"bytes"
	"strings"
	"testing"
)

// TestPDFService_RenderText_ValidPDFSignature verifies the renderer produces
// output that starts with the PDF magic number and ends with %%EOF.
func TestPDFService_RenderText_ValidPDFSignature(t *testing.T) {
	svc := NewPDFService()

	out, err := svc.RenderText("Hello, RawDrive!")
	if err != nil {
		t.Fatalf("RenderText returned error: %v", err)
	}
	if len(out) == 0 {
		t.Fatalf("RenderText produced zero bytes")
	}
	if !bytes.HasPrefix(out, []byte("%PDF-1.4")) {
		n := 16
		if len(out) < n {
			n = len(out)
		}
		t.Errorf("output does not start with %%PDF-1.4, got: %q", out[:n])
	}
	if !bytes.HasSuffix(bytes.TrimRight(out, "\n\r "), []byte("%%EOF")) {
		t.Errorf("output does not end with %%%%EOF")
	}
}

// TestPDFService_RenderTemplate_SubstitutesVariables verifies Go text/template
// substitution works for named fields.
func TestPDFService_RenderTemplate_SubstitutesVariables(t *testing.T) {
	svc := NewPDFService()

	tpl := `Receipt for {{.ClientName}}
Amount: {{.Amount}}
Invoice: {{.InvoiceNumber}}`

	data := map[string]any{
		"ClientName":    "Acme Studios",
		"Amount":        "Rs. 25,000",
		"InvoiceNumber": "INV-2026-0042",
	}

	out, err := svc.RenderTemplate(tpl, data)
	if err != nil {
		t.Fatalf("RenderTemplate returned error: %v", err)
	}

	// PDF text streams wrap content in parentheses after (Tj) operators.
	// The rendered bytes should contain our substituted values literally.
	s := string(out)
	for _, want := range []string{"Acme Studios", "Rs. 25,000", "INV-2026-0042"} {
		if !strings.Contains(s, want) {
			t.Errorf("rendered PDF missing substituted value %q", want)
		}
	}
}

// TestPDFService_RenderReceipt_HasExpectedFields checks the high-level
// receipt helper includes the core fields.
func TestPDFService_RenderReceipt_HasExpectedFields(t *testing.T) {
	svc := NewPDFService()

	r := Receipt{
		Title:         "Payment Receipt",
		ReceiptNumber: "RCP-0001",
		ClientName:    "Veera Photography",
		DatePaid:      "2026-04-10",
		AmountText:    "Rs. 50,000",
		Method:        "UPI",
	}

	out, err := svc.RenderReceipt(r)
	if err != nil {
		t.Fatalf("RenderReceipt returned error: %v", err)
	}
	s := string(out)
	for _, want := range []string{"RCP-0001", "Veera Photography", "Rs. 50,000", "UPI", "2026-04-10"} {
		if !strings.Contains(s, want) {
			t.Errorf("receipt PDF missing field %q", want)
		}
	}
	if !bytes.HasPrefix(out, []byte("%PDF-1.4")) {
		t.Errorf("receipt output is not a valid PDF (missing header)")
	}
}

// TestPDFService_RenderText_MultiLineWraps verifies that long multi-line
// content is preserved across lines in the PDF stream.
func TestPDFService_RenderText_MultiLineWraps(t *testing.T) {
	svc := NewPDFService()

	text := "Line one of content\nLine two of content\nLine three of content"
	out, err := svc.RenderText(text)
	if err != nil {
		t.Fatalf("RenderText returned error: %v", err)
	}
	s := string(out)
	for _, want := range []string{"Line one of content", "Line two of content", "Line three of content"} {
		if !strings.Contains(s, want) {
			t.Errorf("multi-line PDF missing line %q", want)
		}
	}
}

// TestPDFService_RenderText_EscapesSpecialChars verifies that PDF string
// metacharacters (parentheses, backslashes) are escaped rather than breaking
// the stream.
func TestPDFService_RenderText_EscapesSpecialChars(t *testing.T) {
	svc := NewPDFService()

	out, err := svc.RenderText("Deposit (50%) — ref \\2026")
	if err != nil {
		t.Fatalf("RenderText returned error: %v", err)
	}
	if len(out) == 0 {
		t.Fatal("empty output")
	}
	// Must still parse as a PDF (starts with header, ends with EOF)
	if !bytes.HasPrefix(out, []byte("%PDF-1.4")) {
		t.Error("escaping broke PDF header")
	}
	if !bytes.Contains(out, []byte("%%EOF")) {
		t.Error("escaping broke PDF trailer")
	}
}

// TestPDFService_RenderTemplate_InvalidTemplateReturnsError verifies template
// parse errors surface cleanly.
func TestPDFService_RenderTemplate_InvalidTemplateReturnsError(t *testing.T) {
	svc := NewPDFService()

	_, err := svc.RenderTemplate("{{.UnclosedAction", map[string]any{})
	if err == nil {
		t.Fatal("expected error for invalid template, got nil")
	}
}

