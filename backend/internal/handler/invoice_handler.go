package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type InvoiceHandler struct {
	repo *repository.InvoiceRepo
	pdf  *service.PDFService
}

func NewInvoiceHandler(repo *repository.InvoiceRepo) *InvoiceHandler {
	return &InvoiceHandler{repo: repo}
}

// WithPDFService wires the PDF renderer used by DownloadPDF. Safe to call
// with nil — DownloadPDF responds 503 when the renderer is not wired.
func (h *InvoiceHandler) WithPDFService(p *service.PDFService) *InvoiceHandler {
	h.pdf = p
	return h
}

func (h *InvoiceHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var inv repository.Invoice
	if err := json.NewDecoder(r.Body).Decode(&inv); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	inv.WorkspaceID = workspaceID
	if inv.Status == "" {
		inv.Status = "draft"
	}
	if inv.Currency == "" {
		inv.Currency = "INR"
	}
	// Map friendly GST-document invoice_type values the frontend
	// uses to the CHECK-constraint values the invoices table
	// actually allows. The DB check is {subscription,addon,service,
	// credit_note}; the UI naturally sends tax_invoice/proforma/
	// advance_receipt because that's how Indian accountants talk
	// about invoices. Rather than migrate the check constraint
	// (which would risk existing data), we normalize at the handler
	// boundary: everything that is essentially a billable service
	// collapses to "service".
	switch inv.InvoiceType {
	case "", "tax_invoice", "proforma", "advance_receipt":
		inv.InvoiceType = "service"
	case "credit_note":
		// already valid
	case "subscription", "addon":
		// already valid
	default:
		inv.InvoiceType = "service"
	}

	// Default the state_id from the caller's JWT state claim when
	// the client didn't send one. The invoices.state_id column is
	// NOT NULL with an FK to states, so zero (the Go default) is
	// never a valid value and was producing a raw 500 from the DB
	// FK check — a client that knows its user's state gets to
	// override, otherwise we borrow it from the session.
	if inv.StateID == 0 {
		if sid := middleware.StateIDFromContext(r.Context()); sid != "" {
			if n, convErr := strconv.Atoi(sid); convErr == nil && n > 0 {
				inv.StateID = n
			}
		}
	}
	if inv.StateID == 0 {
		http.Error(w, `{"error":"state_id required: complete onboarding or send explicit state_id"}`, http.StatusBadRequest)
		return
	}

	// Generate sequential invoice number
	num, err := h.repo.GetNextInvoiceNumber(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"failed to generate invoice number"}`, http.StatusInternalServerError)
		return
	}
	inv.InvoiceNumber = num

	if err := h.repo.Create(r.Context(), &inv); err != nil {
		// Surface the actual DB error so UAT and callers can see
		// the underlying reason instead of the old opaque
		// "internal error" body. Previously this path returned
		// just "internal error" which silently buried FK failures
		// (e.g. contact_id pointing at a deleted row) and CHECK
		// constraint violations on status/type.
		http.Error(w, fmt.Sprintf(`{"error":"create invoice failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, inv)
}

func (h *InvoiceHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	invoices, err := h.repo.List(r.Context(), repository.InvoiceFilter{
		WorkspaceID: workspaceID,
		Status:      r.URL.Query().Get("status"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, invoices)
}

func (h *InvoiceHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid invoice id"}`, http.StatusBadRequest)
		return
	}
	inv, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, inv)
}

// DownloadPDF renders the invoice as a PDF document and streams it to the
// caller. The frontend uses this for the "Download invoice" button and for
// email attachments. Requires the PDF service to be wired at construction.
func (h *InvoiceHandler) DownloadPDF(w http.ResponseWriter, r *http.Request) {
	if h.pdf == nil {
		http.Error(w, `{"error":"pdf service not configured"}`, http.StatusServiceUnavailable)
		return
	}
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid invoice id"}`, http.StatusBadRequest)
		return
	}
	inv, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	// Fetch studio branding from workspaces row (migration 068 adds
	// address/phone/email/GSTIN/bank/terms/signature columns). All
	// fields are optional — missing values collapse gracefully in
	// the PDF layout.
	var (
		wsName, wsAddr1, wsAddr2, wsCity, wsPostal, wsGSTIN   string
		wsPhone, wsEmail, wsWebsite                            string
		wsBankName, wsBankHolder, wsBankAcc, wsIFSC, wsBranch  string
		wsSigName, wsTerms, wsFooter                           string
	)
	_ = h.repo.DB.QueryRow(r.Context(), `
		SELECT
			COALESCE(name, ''),
			COALESCE(address_line1, ''),
			COALESCE(address_line2, ''),
			COALESCE(city, ''),
			COALESCE(postal_code, ''),
			COALESCE(gstin, ''),
			COALESCE(phone, ''),
			COALESCE(email, ''),
			COALESCE(website, ''),
			COALESCE(bank_name, ''),
			COALESCE(bank_account_holder, ''),
			COALESCE(bank_account_number, ''),
			COALESCE(bank_ifsc, ''),
			COALESCE(bank_branch, ''),
			COALESCE(signature_name, ''),
			COALESCE(invoice_terms, ''),
			COALESCE(invoice_footer, '')
		FROM workspaces WHERE id = $1`, workspaceID).Scan(
		&wsName, &wsAddr1, &wsAddr2, &wsCity, &wsPostal, &wsGSTIN,
		&wsPhone, &wsEmail, &wsWebsite,
		&wsBankName, &wsBankHolder, &wsBankAcc, &wsIFSC, &wsBranch,
		&wsSigName, &wsTerms, &wsFooter,
	)

	// Fetch bill-to client details from contacts row (if the invoice
	// has a contact_id). The contacts table has a single free-form
	// `address` field plus `company`/`phone`/`email`; we split the
	// address on newlines for the two-line layout. Richer structured
	// billing fields (gstin/city/postal) are a future extension.
	var (
		cName, cEmail, cPhone, cCompany, cAddress string
	)
	if inv.ContactID != nil {
		_ = h.repo.DB.QueryRow(r.Context(), `
			SELECT
				COALESCE(name, ''),
				COALESCE(email, ''),
				COALESCE(phone, ''),
				COALESCE(company, ''),
				COALESCE(address, '')
			FROM contacts WHERE id = $1 AND workspace_id = $2`,
			*inv.ContactID, workspaceID,
		).Scan(&cName, &cEmail, &cPhone, &cCompany, &cAddress)
	}
	cAddrLines := splitNonEmpty(cAddress, "\n")
	var cAddr1, cAddr2 string
	if len(cAddrLines) > 0 {
		cAddr1 = cAddrLines[0]
	}
	if len(cAddrLines) > 1 {
		cAddr2 = strings.Join(cAddrLines[1:], ", ")
	}

	// Build the PDF payload from the repository Invoice. Amounts in the DB
	// are stored in paisa; convert to rupees for display.
	payload := service.Invoice{
		Title:         "Tax Invoice",
		InvoiceNumber: inv.InvoiceNumber,
		IssueDate:     inv.CreatedAt.Format("2 Jan 2006"),
		SubtotalText:  formatINR(inv.SubtotalPaisa),
		CGSTText:      formatINR(inv.CGSTPaisa),
		SGSTText:      formatINR(inv.SGSTPaisa),
		IGSTText:      formatINR(inv.IGSTPaisa),
		TotalText:     formatINR(inv.TotalPaisa),

		StudioName:       wsName,
		StudioAddressL1:  wsAddr1,
		StudioAddressL2:  wsAddr2,
		StudioCity:       wsCity,
		StudioPostalCode: wsPostal,
		StudioGSTIN:      wsGSTIN,
		StudioPhone:      wsPhone,
		StudioEmail:      wsEmail,
		StudioWebsite:    wsWebsite,

		ClientName:      cName,
		ClientAddressL1: cAddr1,
		ClientAddressL2: cAddr2,
		ClientPhone:     cPhone,

		BankName:          wsBankName,
		BankAccountHolder: wsBankHolder,
		BankAccountNumber: wsBankAcc,
		BankIFSC:          wsIFSC,
		BankBranch:        wsBranch,

		SignatureName: wsSigName,
		Terms:         wsTerms,
		Footer:        wsFooter,
		AmountInWords: amountInWords(inv.TotalPaisa),
	}
	if inv.DueDate != nil {
		payload.DueDate = inv.DueDate.Format("2 Jan 2006")
	}
	if inv.Notes != nil {
		payload.Notes = *inv.Notes
	}
	// Decode line items (stored as JSON in the invoice row). If decoding
	// fails, we still render the header/totals — the PDF degrades gracefully.
	var items []repository.InvoiceLineItem
	if len(inv.LineItems) > 0 {
		_ = json.Unmarshal(inv.LineItems, &items)
	}
	for _, it := range items {
		payload.Lines = append(payload.Lines, service.InvoiceLine{
			Description:  it.Description,
			HSN:          it.HSNCode,
			QuantityText: fmt.Sprintf("%d", it.Quantity),
			UnitText:     formatINR(it.UnitPricePaisa),
			AmountText:   formatINR(int64(it.Quantity) * it.UnitPricePaisa),
		})
	}

	bytesOut, err := h.pdf.RenderInvoice(payload)
	if err != nil {
		http.Error(w, `{"error":"failed to render pdf"}`, http.StatusInternalServerError)
		return
	}

	filename := inv.InvoiceNumber + ".pdf"
	if filename == ".pdf" {
		filename = "invoice.pdf"
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(bytesOut)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(bytesOut)
}

// formatINR formats a paisa amount as "INR 1,234.56". Pure helper — no
// locale dependency, kept local so the handler file is self-contained.
func formatINR(paisa int64) string {
	neg := ""
	if paisa < 0 {
		neg = "-"
		paisa = -paisa
	}
	rupees := paisa / 100
	remainder := paisa % 100
	// Indian lakh/crore grouping: last 3 digits, then groups of 2.
	rupeeStr := fmt.Sprintf("%d", rupees)
	if len(rupeeStr) > 3 {
		// Split the last 3 digits, then group the rest in 2s.
		tail := rupeeStr[len(rupeeStr)-3:]
		head := rupeeStr[:len(rupeeStr)-3]
		var parts []string
		for len(head) > 2 {
			parts = append([]string{head[len(head)-2:]}, parts...)
			head = head[:len(head)-2]
		}
		if head != "" {
			parts = append([]string{head}, parts...)
		}
		rupeeStr = strings.Join(parts, ",") + "," + tail
	}
	return fmt.Sprintf("%sINR %s.%02d", neg, rupeeStr, remainder)
}

// splitNonEmpty splits s by sep and removes empty strings + trims each piece.
// Used by the PDF handler to parse multiline contact addresses into layout
// rows.
func splitNonEmpty(s, sep string) []string {
	parts := strings.Split(s, sep)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// amountInWords converts a paisa amount to the Indian-English words form
// (e.g. "One Lakh Forty-Seven Thousand Five Hundred rupees only") so the
// invoice PDF has the legally-required amount-in-words line.
func amountInWords(paisa int64) string {
	if paisa == 0 {
		return "Zero rupees only"
	}
	rupees := paisa / 100
	paise := paisa % 100
	text := indianNumberWords(rupees) + " rupees"
	if paise > 0 {
		text += " and " + indianNumberWords(paise) + " paise"
	}
	return text + " only"
}

// indianNumberWords spells a positive integer in Indian lakh/crore words.
func indianNumberWords(n int64) string {
	if n == 0 {
		return "Zero"
	}
	ones := []string{
		"", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
		"Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
		"Seventeen", "Eighteen", "Nineteen",
	}
	tens := []string{"", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"}
	under100 := func(x int64) string {
		if x < 20 {
			return ones[x]
		}
		t := ones[x%10]
		if t == "" {
			return tens[x/10]
		}
		return tens[x/10] + "-" + t
	}
	under1000 := func(x int64) string {
		if x == 0 {
			return ""
		}
		h := ""
		if x >= 100 {
			h = ones[x/100] + " Hundred"
			x = x % 100
			if x > 0 {
				h += " "
			}
		}
		return h + under100(x)
	}

	// Break into crore / lakh / thousand / remainder groups.
	crore := n / 10000000
	n %= 10000000
	lakh := n / 100000
	n %= 100000
	thousand := n / 1000
	n %= 1000
	rest := n

	parts := []string{}
	if crore > 0 {
		parts = append(parts, indianNumberWords(crore)+" Crore")
	}
	if lakh > 0 {
		parts = append(parts, under100(lakh)+" Lakh")
	}
	if thousand > 0 {
		parts = append(parts, under1000(thousand)+" Thousand")
	}
	if rest > 0 {
		parts = append(parts, under1000(rest))
	}
	return strings.TrimSpace(strings.Join(parts, " "))
}
