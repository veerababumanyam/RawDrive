package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// paymentRepository is the subset of *repository.PaymentRepo that this
// handler depends on. Declaring it as an interface (which the concrete
// repo already satisfies) lets RecordPayment's error paths be unit-tested
// with lightweight fakes — no DB and no new mock library required.
type paymentRepository interface {
	Create(ctx context.Context, p *repository.Payment) error
	ListByInvoice(ctx context.Context, workspaceID, invoiceID uuid.UUID) ([]repository.Payment, error)
	GetTotalPaidForInvoice(ctx context.Context, workspaceID, invoiceID uuid.UUID) (int64, error)
}

// invoiceRepository is the subset of *repository.InvoiceRepo this handler uses.
type invoiceRepository interface {
	GetByID(ctx context.Context, workspaceID, id uuid.UUID) (repository.Invoice, error)
	UpdateStatusAndPaid(ctx context.Context, workspaceID, id uuid.UUID, status string, amountPaidPaisa int64) error
}

// PaymentHandler handles payment recording and payment link generation.
type PaymentHandler struct {
	paymentRepo paymentRepository
	invoiceRepo invoiceRepository
}

func NewPaymentHandler(paymentRepo *repository.PaymentRepo, invoiceRepo *repository.InvoiceRepo) *PaymentHandler {
	return &PaymentHandler{paymentRepo: paymentRepo, invoiceRepo: invoiceRepo}
}

// computeInvoiceStatus derives the invoice status from the authoritative
// sum of recorded payments and the invoice total (both in paisa). An
// invoice is "paid" once recorded payments cover (or exceed) the total,
// otherwise "partially_paid". Extracted as a pure function so the
// threshold rule is unit-testable without a DB.
func computeInvoiceStatus(totalPaidPaisa, invoiceTotalPaisa int64) string {
	if totalPaidPaisa >= invoiceTotalPaisa {
		return "paid"
	}
	return "partially_paid"
}

// syncInvoiceFromPayments recomputes an invoice's amount_paid + status from
// the authoritative sum of its payment rows and persists the result. Every
// step's error is returned (never swallowed) so the caller can fail the
// request instead of silently leaving the invoice in a stale status — the
// root cause of F-014/F-026.
//
// NOTE: this is not yet atomic with respect to concurrent payments. Closing
// the lost-update race requires a single transaction with SELECT ... FOR
// UPDATE on the invoice row (repository-layer change tracked as the F-014
// follow-up).
func syncInvoiceFromPayments(ctx context.Context, paymentRepo paymentRepository, invoiceRepo invoiceRepository, workspaceID, invoiceID uuid.UUID) error {
	totalPaid, err := paymentRepo.GetTotalPaidForInvoice(ctx, workspaceID, invoiceID)
	if err != nil {
		return fmt.Errorf("recompute total paid: %w", err)
	}
	inv, err := invoiceRepo.GetByID(ctx, workspaceID, invoiceID)
	if err != nil {
		return fmt.Errorf("load invoice for status sync: %w", err)
	}
	newStatus := computeInvoiceStatus(totalPaid, inv.TotalPaisa)
	if err := invoiceRepo.UpdateStatusAndPaid(ctx, workspaceID, invoiceID, newStatus, totalPaid); err != nil {
		return fmt.Errorf("update invoice status: %w", err)
	}
	return nil
}

// RecordPayment handles POST /api/v1/billing/invoices/{id}/payments
func (h *PaymentHandler) RecordPayment(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	invoiceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid invoice id"}`, http.StatusBadRequest)
		return
	}

	var p repository.Payment
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	p.WorkspaceID = workspaceID
	p.InvoiceID = invoiceID
	if p.ProjectID == nil {
		if inv, invErr := h.invoiceRepo.GetByID(r.Context(), workspaceID, invoiceID); invErr == nil {
			p.ProjectID = inv.ProjectID
		}
	}

	if p.AmountPaisa <= 0 {
		http.Error(w, `{"error":"amount must be positive"}`, http.StatusBadRequest)
		return
	}

	// Default method when the client didn't send one. The DB
	// column is NOT NULL but has a default of 'cash'; Go's zero
	// value for string bypasses the default, so we normalize here.
	if p.Method == "" {
		p.Method = "cash"
	}

	if err := h.paymentRepo.Create(r.Context(), &p); err != nil {
		// Verbose error so UAT sees the actual cause of a failed
		// payment write (check constraint on method, FK to
		// invoice_id, RLS mismatch, etc.) instead of a generic
		// "internal error".
		http.Error(w, fmt.Sprintf(`{"error":"create payment failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Sync the invoice amount_paid + status from the authoritative sum of
	// payment rows. The payment row is already committed at this point, so a
	// failure here leaves a real inconsistency (invoice stuck in its old
	// status). Surface it as a 500 instead of silently swallowing the error
	// and returning 201 — billing reconciliation depends on this staying
	// consistent (F-014 / F-026).
	if err := syncInvoiceFromPayments(r.Context(), h.paymentRepo, h.invoiceRepo, workspaceID, invoiceID); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invoice status sync failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, p)
}

// ListByInvoice handles GET /api/v1/billing/invoices/{id}/payments
func (h *PaymentHandler) ListByInvoice(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	invoiceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid invoice id"}`, http.StatusBadRequest)
		return
	}
	payments, err := h.paymentRepo.ListByInvoice(r.Context(), workspaceID, invoiceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, payments)
}

// GeneratePaymentLink handles POST /api/v1/billing/invoices/{id}/payment-link
// For now, generates a stub UPI deep link. Razorpay integration is production-only.
func (h *PaymentHandler) GeneratePaymentLink(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	invoiceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid invoice id"}`, http.StatusBadRequest)
		return
	}

	inv, err := h.invoiceRepo.GetByID(r.Context(), workspaceID, invoiceID)
	if err != nil {
		http.Error(w, `{"error":"invoice not found"}`, http.StatusNotFound)
		return
	}

	outstanding := inv.TotalPaisa - inv.AmountPaidPaisa
	if outstanding <= 0 {
		http.Error(w, `{"error":"invoice already fully paid"}`, http.StatusBadRequest)
		return
	}

	// Generate UPI payment link (dev stub — production uses Razorpay)
	amountRupees := float64(outstanding) / 100.0
	log.Printf("[payment-link] Generated for invoice %s, amount: ₹%.2f", inv.InvoiceNumber, amountRupees)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"invoice_id":     invoiceID.String(),
		"invoice_number": inv.InvoiceNumber,
		"amount_paisa":   outstanding,
		"payment_link":   "upi://pay?pa=rawdrive@upi&pn=RawDrive&am=" + fmt.Sprintf("%.2f", amountRupees) + "&cu=INR&tn=" + inv.InvoiceNumber,
		"provider":       "upi_stub",
		"note":           "Production will use Razorpay payment links",
	})
}
