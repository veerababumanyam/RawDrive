package handler

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// Compile-time assertions: the concrete repositories must satisfy the narrow
// interfaces the handler now depends on. If a repo method signature drifts,
// these fail to compile (a fast, DB-free regression guard).
var (
	_ paymentRepository = (*repository.PaymentRepo)(nil)
	_ invoiceRepository = (*repository.InvoiceRepo)(nil)
)

// fakePaymentRepo implements paymentRepository for tests.
type fakePaymentRepo struct {
	createErr   error
	totalPaid   int64
	totalErr    error
	listResult  []repository.Payment
	listErr     error
	createCalls int
}

func (f *fakePaymentRepo) Create(_ context.Context, _ *repository.Payment) error {
	f.createCalls++
	return f.createErr
}

func (f *fakePaymentRepo) ListByInvoice(_ context.Context, _, _ uuid.UUID) ([]repository.Payment, error) {
	return f.listResult, f.listErr
}

func (f *fakePaymentRepo) GetTotalPaidForInvoice(_ context.Context, _, _ uuid.UUID) (int64, error) {
	return f.totalPaid, f.totalErr
}

// fakeInvoiceRepo implements invoiceRepository for tests.
type fakeInvoiceRepo struct {
	invoice         repository.Invoice
	getErr          error
	updateErr       error
	updateCalls     int
	lastStatus      string
	lastAmountPaisa int64
}

func (f *fakeInvoiceRepo) GetByID(_ context.Context, _, _ uuid.UUID) (repository.Invoice, error) {
	return f.invoice, f.getErr
}

func (f *fakeInvoiceRepo) UpdateStatusAndPaid(_ context.Context, _, _ uuid.UUID, status string, amountPaidPaisa int64) error {
	f.updateCalls++
	f.lastStatus = status
	f.lastAmountPaisa = amountPaidPaisa
	return f.updateErr
}

// TestF014ComputeInvoiceStatus locks the status-threshold rule that feeds
// UpdateStatusAndPaid. Before F-014/F-026 this logic ran inside an
// `if err == nil` block whose write error was discarded; the rule itself
// must stay correct so the now-checked update writes the right status.
func TestF014ComputeInvoiceStatus(t *testing.T) {
	cases := []struct {
		name      string
		totalPaid int64
		total     int64
		want      string
	}{
		{"under pays partially_paid", 4000, 10000, "partially_paid"},
		{"exact total is paid", 10000, 10000, "paid"},
		{"over pays still paid", 12000, 10000, "paid"},
		{"zero paid partially_paid", 0, 10000, "partially_paid"},
		{"zero total invoice is paid", 0, 0, "paid"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := computeInvoiceStatus(tc.totalPaid, tc.total); got != tc.want {
				t.Fatalf("computeInvoiceStatus(%d,%d)=%q want %q", tc.totalPaid, tc.total, got, tc.want)
			}
		})
	}
}

// TestF026StatusSyncErrorIsNotSwallowed is the core regression for F-026 (and
// the swallowed-error half of F-014): the invoice status sync that runs after
// a payment row is created must surface its errors instead of discarding them
// with `_ =`. We drive the handler's post-create sync sequence
// (GetTotalPaidForInvoice -> GetByID -> UpdateStatusAndPaid) via the same
// interface seam RecordPayment uses, and assert each failure is propagated.
func TestF026StatusSyncErrorIsNotSwallowed(t *testing.T) {
	ctx := context.Background()
	ws := uuid.New()
	inv := uuid.New()

	t.Run("update error propagates", func(t *testing.T) {
		pr := &fakePaymentRepo{totalPaid: 10000}
		ir := &fakeInvoiceRepo{
			invoice:   repository.Invoice{TotalPaisa: 10000, Status: "sent"},
			updateErr: errors.New("db down"),
		}
		if err := syncInvoiceFromPayments(ctx, pr, ir, ws, inv); err == nil {
			t.Fatal("expected UpdateStatusAndPaid error to propagate, got nil (regression: error swallowed)")
		}
		if ir.updateCalls != 1 {
			t.Fatalf("UpdateStatusAndPaid calls = %d, want 1", ir.updateCalls)
		}
		if ir.lastStatus != "paid" {
			t.Fatalf("synced status = %q, want paid", ir.lastStatus)
		}
	})

	t.Run("get total error propagates and skips update", func(t *testing.T) {
		pr := &fakePaymentRepo{totalErr: errors.New("sum failed")}
		ir := &fakeInvoiceRepo{invoice: repository.Invoice{TotalPaisa: 10000}}
		if err := syncInvoiceFromPayments(ctx, pr, ir, ws, inv); err == nil {
			t.Fatal("expected GetTotalPaidForInvoice error to propagate, got nil")
		}
		if ir.updateCalls != 0 {
			t.Fatalf("UpdateStatusAndPaid should not run after total error; calls = %d", ir.updateCalls)
		}
	})

	t.Run("get invoice error propagates and skips update", func(t *testing.T) {
		pr := &fakePaymentRepo{totalPaid: 5000}
		ir := &fakeInvoiceRepo{getErr: errors.New("not found")}
		if err := syncInvoiceFromPayments(ctx, pr, ir, ws, inv); err == nil {
			t.Fatal("expected GetByID error to propagate, got nil")
		}
		if ir.updateCalls != 0 {
			t.Fatalf("UpdateStatusAndPaid should not run after get error; calls = %d", ir.updateCalls)
		}
	})

	t.Run("happy path writes recomputed total and status", func(t *testing.T) {
		pr := &fakePaymentRepo{totalPaid: 6000}
		ir := &fakeInvoiceRepo{invoice: repository.Invoice{TotalPaisa: 10000, Status: "sent"}}
		if err := syncInvoiceFromPayments(ctx, pr, ir, ws, inv); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ir.updateCalls != 1 {
			t.Fatalf("UpdateStatusAndPaid calls = %d, want 1", ir.updateCalls)
		}
		if ir.lastStatus != "partially_paid" || ir.lastAmountPaisa != 6000 {
			t.Fatalf("synced (%q,%d), want (partially_paid,6000)", ir.lastStatus, ir.lastAmountPaisa)
		}
	})
}
