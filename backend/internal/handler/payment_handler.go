package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// PaymentHandler handles payment recording and payment link generation.
type PaymentHandler struct {
	paymentRepo *repository.PaymentRepo
	invoiceRepo *repository.InvoiceRepo
}

func NewPaymentHandler(paymentRepo *repository.PaymentRepo, invoiceRepo *repository.InvoiceRepo) *PaymentHandler {
	return &PaymentHandler{paymentRepo: paymentRepo, invoiceRepo: invoiceRepo}
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

	if p.AmountPaisa <= 0 {
		http.Error(w, `{"error":"amount must be positive"}`, http.StatusBadRequest)
		return
	}

	if err := h.paymentRepo.Create(r.Context(), &p); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Update invoice amount_paid
	totalPaid, err := h.paymentRepo.GetTotalPaidForInvoice(r.Context(), workspaceID, invoiceID)
	if err == nil {
		inv, err := h.invoiceRepo.GetByID(r.Context(), workspaceID, invoiceID)
		if err == nil {
			newStatus := "partially_paid"
			if totalPaid >= inv.TotalPaisa {
				newStatus = "paid"
			}
			_ = h.invoiceRepo.UpdateStatus(r.Context(), workspaceID, invoiceID, newStatus)
		}
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
