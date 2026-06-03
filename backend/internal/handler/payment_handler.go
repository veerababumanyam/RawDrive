package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"

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

// settingsResolver is the minimal surface the payment handler needs to read
// admin-managed configuration from the platform_settings table. The concrete
// *repository.PlatformSettingsRepo already satisfies it (it exposes GetByKey),
// so it can be wired directly without an adapter. Declaring it as an interface
// keeps the handler DB-free-testable and keeps wiring optional.
type settingsResolver interface {
	GetByKey(ctx context.Context, category, key string) (*repository.PlatformSetting, error)
}

// PaymentHandler handles payment recording and payment link generation.
type PaymentHandler struct {
	paymentRepo paymentRepository
	invoiceRepo invoiceRepository
	// settings is optional. When set, configuration (e.g. the UPI payee
	// address) is resolved from platform_settings first; otherwise the
	// environment is used. It is never populated with a hardcoded fallback.
	settings settingsResolver
}

func NewPaymentHandler(paymentRepo *repository.PaymentRepo, invoiceRepo *repository.InvoiceRepo) *PaymentHandler {
	return &PaymentHandler{paymentRepo: paymentRepo, invoiceRepo: invoiceRepo}
}

// WithSettingsResolver wires a platform_settings resolver onto the handler so
// admin-managed config takes precedence over environment variables. It returns
// the handler for chaining and deliberately keeps NewPaymentHandler's signature
// stable so existing call sites compile unchanged (mirrors
// AssetHandler.WithValidation).
func (h *PaymentHandler) WithSettingsResolver(s settingsResolver) *PaymentHandler {
	h.settings = s
	return h
}

// resolveUPIPayeeAddress resolves the UPI payee address (PA) following the
// project-wide config order: platform_settings (payments/upi_pa) -> env
// (UPI_PA) -> empty (caller must disable the feature). It never returns a
// hardcoded literal — that would violate the no-hardcoded-credentials
// invariant. Production uses Razorpay payment links instead of this stub.
func (h *PaymentHandler) resolveUPIPayeeAddress(ctx context.Context) string {
	if h.settings != nil {
		if s, err := h.settings.GetByKey(ctx, "payments", "upi_pa"); err == nil && s != nil && s.Value != "" {
			return s.Value
		}
	}
	return os.Getenv("UPI_PA")
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
	if p.AmountPaisa <= 0 {
		http.Error(w, `{"error":"amount must be positive"}`, http.StatusBadRequest)
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
	if p.AmountPaisa > outstanding {
		http.Error(w, `{"error":"payment exceeds outstanding amount"}`, http.StatusBadRequest)
		return
	}

	p.WorkspaceID = workspaceID
	p.InvoiceID = invoiceID
	if p.ProjectID == nil {
		p.ProjectID = inv.ProjectID
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

	// Resolve the UPI payee address (PA) from config: platform_settings ->
	// env -> disable. Never fall back to a hardcoded literal (the previous
	// `pa=rawdrive@upi` violated the no-hardcoded-credentials invariant). When
	// no source provides a PA, disable the feature with a clear 503 rather than
	// emitting an unusable link.
	upiPA := h.resolveUPIPayeeAddress(r.Context())
	if upiPA == "" {
		log.Printf("[payment-link] UPI payee address not configured (set platform_settings payments/upi_pa or UPI_PA); feature disabled")
		http.Error(w, `{"error":"UPI payment link is not configured"}`, http.StatusServiceUnavailable)
		return
	}

	// Generate UPI payment link (dev stub — production uses Razorpay)
	amountRupees := float64(outstanding) / 100.0
	log.Printf("[payment-link] Generated for invoice %s, amount: ₹%.2f", inv.InvoiceNumber, amountRupees)
	query := url.Values{}
	query.Set("pa", upiPA)
	query.Set("pn", "RawDrive")
	query.Set("am", fmt.Sprintf("%.2f", amountRupees))
	query.Set("cu", "INR")
	query.Set("tn", inv.InvoiceNumber)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"invoice_id":     invoiceID.String(),
		"invoice_number": inv.InvoiceNumber,
		"amount_paisa":   outstanding,
		"payment_link":   "upi://pay?" + query.Encode(),
		"provider":       "upi_stub",
		"note":           "Production will use Razorpay payment links",
	})
}
