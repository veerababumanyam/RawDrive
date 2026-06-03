package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
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
	lastPayment repository.Payment
}

func (f *fakePaymentRepo) Create(_ context.Context, p *repository.Payment) error {
	f.createCalls++
	if p != nil {
		f.lastPayment = *p
	}
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

// fakeSettingsResolver implements settingsResolver for tests, backed by a map
// keyed "category/key". Mirrors *repository.PlatformSettingsRepo.GetByKey.
type fakeSettingsResolver struct {
	values map[string]string
}

func (f *fakeSettingsResolver) GetByKey(_ context.Context, category, key string) (*repository.PlatformSetting, error) {
	v, ok := f.values[category+"/"+key]
	if !ok {
		return nil, errors.New("not found")
	}
	return &repository.PlatformSetting{Category: category, Key: key, Value: v}, nil
}

// Compile-time assertion: the concrete repo must satisfy the resolver interface
// so it can be wired in production without an adapter.
var _ settingsResolver = (*repository.PlatformSettingsRepo)(nil)

// paymentLinkRequest builds a GeneratePaymentLink request carrying workspace
// context (via the typed key getWorkspaceID reads) and the invoice id as a chi
// URL param, matching the real route wiring this handler depends on.
func paymentLinkRequest(invoiceID uuid.UUID) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/payments/link", nil)
	ctx := middleware.WithWorkspaceID(req.Context(), uuid.New().String())
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", invoiceID.String())
	ctx = context.WithValue(ctx, chi.RouteCtxKey, rctx)
	return req.WithContext(ctx)
}

func recordPaymentRequest(invoiceID, workspaceID uuid.UUID, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/payments", strings.NewReader(body))
	ctx := middleware.WithWorkspaceID(req.Context(), workspaceID.String())
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", invoiceID.String())
	ctx = context.WithValue(ctx, chi.RouteCtxKey, rctx)
	return req.WithContext(ctx)
}

// readPaymentLink decodes the "payment_link" field from a JSON response body.
func readPaymentLink(t *testing.T, body []byte) string {
	t.Helper()
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v (body=%s)", err, string(body))
	}
	link, _ := resp["payment_link"].(string)
	return link
}

func paymentLinkQuery(t *testing.T, body []byte) url.Values {
	t.Helper()
	link := readPaymentLink(t, body)
	parsed, err := url.Parse(link)
	if err != nil {
		t.Fatalf("parse payment link: %v", err)
	}
	return parsed.Query()
}

// TestF104UPIPayeeAddressFromSettings is the core regression for F-104: the UPI
// payee address must come from platform_settings (payments/upi_pa) and the
// previously hardcoded literal `rawdrive@upi` must never appear in the link.
func TestF104UPIPayeeAddressFromSettings(t *testing.T) {
	h := (&PaymentHandler{
		invoiceRepo: &fakeInvoiceRepo{invoice: repository.Invoice{
			InvoiceNumber: "INV-1",
			TotalPaisa:    15000,
		}},
	}).WithSettingsResolver(&fakeSettingsResolver{values: map[string]string{
		"payments/upi_pa": "studio@okhdfcbank",
	}})

	rr := httptest.NewRecorder()
	h.GeneratePaymentLink(rr, paymentLinkRequest(uuid.New()))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	query := paymentLinkQuery(t, rr.Body.Bytes())
	if query.Get("pa") != "studio@okhdfcbank" {
		t.Fatalf("expected configured PA in link, got %q", query.Get("pa"))
	}
	// Regression guard: the previously hardcoded literal must never appear.
	if strings.Contains(readPaymentLink(t, rr.Body.Bytes()), "rawdrive%40upi") {
		t.Fatalf("hardcoded UPI PA leaked into link: %q", readPaymentLink(t, rr.Body.Bytes()))
	}
	if query.Get("am") != "150.00" {
		t.Fatalf("expected formatted amount in link, got %q", query.Get("am"))
	}
}

// TestF104UPIPayeeAddressFromEnv verifies the env fallback (UPI_PA) is used when
// no platform_settings resolver provides a value.
func TestF104UPIPayeeAddressFromEnv(t *testing.T) {
	t.Setenv("UPI_PA", "env@okaxis")
	h := &PaymentHandler{
		invoiceRepo: &fakeInvoiceRepo{invoice: repository.Invoice{
			InvoiceNumber: "INV-2",
			TotalPaisa:    5000,
		}},
	}

	rr := httptest.NewRecorder()
	h.GeneratePaymentLink(rr, paymentLinkRequest(uuid.New()))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	query := paymentLinkQuery(t, rr.Body.Bytes())
	if query.Get("pa") != "env@okaxis" {
		t.Fatalf("expected env PA in link, got %q", query.Get("pa"))
	}
	if strings.Contains(readPaymentLink(t, rr.Body.Bytes()), "rawdrive%40upi") {
		t.Fatalf("hardcoded UPI PA leaked into link: %q", readPaymentLink(t, rr.Body.Bytes()))
	}
}

// TestF104UPIPayeeAddressUnsetReturns503 verifies the handler disables the
// feature (503) instead of defaulting to a literal when no source provides a PA.
func TestF104UPIPayeeAddressUnsetReturns503(t *testing.T) {
	t.Setenv("UPI_PA", "")
	h := &PaymentHandler{
		invoiceRepo: &fakeInvoiceRepo{invoice: repository.Invoice{
			InvoiceNumber: "INV-3",
			TotalPaisa:    5000,
		}},
		// no settings resolver, env empty -> must disable
	}

	rr := httptest.NewRecorder()
	h.GeneratePaymentLink(rr, paymentLinkRequest(uuid.New()))

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when PA unset, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "rawdrive@upi") {
		t.Fatalf("hardcoded UPI PA leaked into response: %s", rr.Body.String())
	}
}

// TestF104SettingsPrecedesEnv verifies platform_settings wins over the env var
// when both are present, matching the project-wide resolution order.
func TestF104SettingsPrecedesEnv(t *testing.T) {
	t.Setenv("UPI_PA", "env@okaxis")
	h := (&PaymentHandler{
		invoiceRepo: &fakeInvoiceRepo{invoice: repository.Invoice{
			InvoiceNumber: "INV-4",
			TotalPaisa:    9900,
		}},
	}).WithSettingsResolver(&fakeSettingsResolver{values: map[string]string{
		"payments/upi_pa": "db@okicici",
	}})

	rr := httptest.NewRecorder()
	h.GeneratePaymentLink(rr, paymentLinkRequest(uuid.New()))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	query := paymentLinkQuery(t, rr.Body.Bytes())
	if query.Get("pa") != "db@okicici" {
		t.Fatalf("expected platform_settings PA to win, got %q", query.Get("pa"))
	}
}

func TestRecordPaymentRequiresWorkspaceOwnedInvoice(t *testing.T) {
	ws := uuid.New()
	invoiceID := uuid.New()
	payments := &fakePaymentRepo{}
	h := &PaymentHandler{
		paymentRepo: payments,
		invoiceRepo: &fakeInvoiceRepo{
			getErr: errors.New("not found in this workspace"),
		},
	}

	rr := httptest.NewRecorder()
	h.RecordPayment(rr, recordPaymentRequest(invoiceID, ws, `{"amount_paisa":1000}`))

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for non-owned invoice, got %d: %s", rr.Code, rr.Body.String())
	}
	if payments.createCalls != 0 {
		t.Fatalf("payment insert must not run for non-owned invoice; calls=%d", payments.createCalls)
	}
}

func TestRecordPaymentRejectsOverpaymentAndFullyPaidInvoice(t *testing.T) {
	ws := uuid.New()
	invoiceID := uuid.New()

	t.Run("overpayment", func(t *testing.T) {
		payments := &fakePaymentRepo{}
		h := &PaymentHandler{
			paymentRepo: payments,
			invoiceRepo: &fakeInvoiceRepo{
				invoice: repository.Invoice{TotalPaisa: 10000, AmountPaidPaisa: 7500},
			},
		}
		rr := httptest.NewRecorder()
		h.RecordPayment(rr, recordPaymentRequest(invoiceID, ws, `{"amount_paisa":3000}`))
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for overpayment, got %d: %s", rr.Code, rr.Body.String())
		}
		if payments.createCalls != 0 {
			t.Fatalf("payment insert must not run for overpayment; calls=%d", payments.createCalls)
		}
	})

	t.Run("already paid", func(t *testing.T) {
		payments := &fakePaymentRepo{}
		h := &PaymentHandler{
			paymentRepo: payments,
			invoiceRepo: &fakeInvoiceRepo{
				invoice: repository.Invoice{TotalPaisa: 10000, AmountPaidPaisa: 10000},
			},
		}
		rr := httptest.NewRecorder()
		h.RecordPayment(rr, recordPaymentRequest(invoiceID, ws, `{"amount_paisa":100}`))
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for paid invoice, got %d: %s", rr.Code, rr.Body.String())
		}
		if payments.createCalls != 0 {
			t.Fatalf("payment insert must not run for paid invoice; calls=%d", payments.createCalls)
		}
	})
}

func TestRecordPaymentUsesOwnedInvoiceProjectAndSyncs(t *testing.T) {
	ws := uuid.New()
	invoiceID := uuid.New()
	projectID := uuid.New()
	payments := &fakePaymentRepo{totalPaid: 10000}
	invoices := &fakeInvoiceRepo{
		invoice: repository.Invoice{
			ProjectID:       &projectID,
			TotalPaisa:      10000,
			AmountPaidPaisa: 1000,
		},
	}
	h := &PaymentHandler{paymentRepo: payments, invoiceRepo: invoices}

	rr := httptest.NewRecorder()
	h.RecordPayment(rr, recordPaymentRequest(invoiceID, ws, `{"amount_paisa":9000}`))

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
	}
	if payments.createCalls != 1 {
		t.Fatalf("payment insert calls=%d, want 1", payments.createCalls)
	}
	if payments.lastPayment.ProjectID == nil || *payments.lastPayment.ProjectID != projectID {
		t.Fatalf("payment project_id = %v, want invoice project %s", payments.lastPayment.ProjectID, projectID)
	}
	if invoices.lastStatus != "paid" || invoices.lastAmountPaisa != 10000 {
		t.Fatalf("invoice sync = (%q,%d), want (paid,10000)", invoices.lastStatus, invoices.lastAmountPaisa)
	}
}

func TestPaymentLinkEncodesUPIQueryValues(t *testing.T) {
	invoiceNumber := "INV 2026/27 #001"
	h := (&PaymentHandler{
		invoiceRepo: &fakeInvoiceRepo{invoice: repository.Invoice{
			InvoiceNumber: invoiceNumber,
			TotalPaisa:    12345,
		}},
	}).WithSettingsResolver(&fakeSettingsResolver{values: map[string]string{
		"payments/upi_pa": "studio@okhdfcbank",
	}})

	rr := httptest.NewRecorder()
	h.GeneratePaymentLink(rr, paymentLinkRequest(uuid.New()))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	link := readPaymentLink(t, rr.Body.Bytes())
	parsed, err := url.Parse(link)
	if err != nil {
		t.Fatalf("parse payment link: %v", err)
	}
	if got := parsed.Query().Get("tn"); got != invoiceNumber {
		t.Fatalf("tn query decoded to %q, want %q (link=%q)", got, invoiceNumber, link)
	}
	if strings.Contains(link, " ") || strings.Contains(link, "#001") {
		t.Fatalf("payment link query must be encoded, got %q", link)
	}
}
