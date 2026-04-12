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
	docType := service.NormalizeInvoiceDocumentType(inv.InvoiceType)
	inv.InvoiceType = docType.DBValue()
	if docType == service.InvoiceDocumentCreditNote {
		if inv.CreditNoteInvoiceID == nil {
			http.Error(w, `{"error":"credit_note_invoice_id required for credit notes"}`, http.StatusBadRequest)
			return
		}
		if inv.CreditNoteReason == nil || strings.TrimSpace(*inv.CreditNoteReason) == "" {
			http.Error(w, `{"error":"credit_note_reason required for credit notes"}`, http.StatusBadRequest)
			return
		}
		inv.SubtotalPaisa = service.ApplyCreditNoteSign(inv.SubtotalPaisa)
		inv.CGSTPaisa = service.ApplyCreditNoteSign(inv.CGSTPaisa)
		inv.SGSTPaisa = service.ApplyCreditNoteSign(inv.SGSTPaisa)
		inv.IGSTPaisa = service.ApplyCreditNoteSign(inv.IGSTPaisa)
		inv.TotalPaisa = service.ApplyCreditNoteSign(inv.TotalPaisa)
		inv.DiscountPaisa = service.ApplyCreditNoteSign(inv.DiscountPaisa)
	}

	// M23: Compute amount-in-words for the invoice total.
	if inv.TotalPaisa > 0 {
		inv.AmountInWords = service.AmountInWords(inv.TotalPaisa)
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

// ConvertQuotation clones a quotation into a draft tax invoice. The original
// quotation remains unchanged for auditability.
func (h *InvoiceHandler) ConvertQuotation(w http.ResponseWriter, r *http.Request) {
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
	quotation, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if service.NormalizeInvoiceDocumentType(quotation.InvoiceType) != service.InvoiceDocumentQuotation {
		http.Error(w, `{"error":"only quotations can be converted"}`, http.StatusBadRequest)
		return
	}
	num, err := h.repo.GetNextInvoiceNumber(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"failed to generate invoice number"}`, http.StatusInternalServerError)
		return
	}
	converted := quotation
	converted.ID = uuid.Nil
	converted.InvoiceNumber = num
	converted.InvoiceType = service.InvoiceDocumentTaxInvoice.DBValue()
	converted.Status = "draft"
	converted.AmountPaidPaisa = 0
	converted.PaidAt = nil
	converted.QuotationValidUntil = nil
	converted.CreditNoteInvoiceID = nil
	converted.CreditNoteReason = nil
	if converted.TotalPaisa > 0 {
		converted.AmountInWords = service.AmountInWords(converted.TotalPaisa)
	}
	if err := h.repo.Create(r.Context(), &converted); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"convert quotation failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, converted)
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
		wsPhone, wsEmail, wsWebsite                           string
		wsBankName, wsBankHolder, wsBankAcc, wsIFSC, wsBranch string
		wsSigName, wsTerms, wsFooter                          string
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
		Title:         service.NormalizeInvoiceDocumentType(inv.InvoiceType).PDFTitle(),
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
		AmountInWords: service.AmountInWords(inv.TotalPaisa),
		PlaceOfSupply: inv.PlaceOfSupplyState,
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

// amountInWords was previously defined locally here but has been removed
// in favour of the canonical service.AmountInWords to avoid divergence.
// See backend/internal/service/amount_in_words.go.
