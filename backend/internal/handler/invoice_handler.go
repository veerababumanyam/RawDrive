package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

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
	return fmt.Sprintf("%sINR %d.%02d", neg, rupees, remainder)
}
