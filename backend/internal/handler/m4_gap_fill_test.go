package handler

// Tests for M4 gap-fill work: NotificationDispatcher, InvoiceHandler.DownloadPDF,
// ContractHandler.DownloadPDF. These tests follow the httptest + chi pattern
// from backend/internal/ai/handler_test.go — they cover the non-DB code paths
// (validation, nil-safety, wiring) and skip cases that would require a real
// database connection.

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ─── fakeNotifStore implements service.NotificationPersister for tests ───

type fakeNotifStore struct {
	createCalls int
	lastRecord  *repository.Notification
}

func (f *fakeNotifStore) Create(_ context.Context, n *repository.Notification) error {
	f.createCalls++
	f.lastRecord = n
	return nil
}

func (f *fakeNotifStore) GetPreferences(_ context.Context, _ uuid.UUID) ([]repository.NotificationPreference, error) {
	// Return nil — delivery service falls back to defaults (email + push + in-app enabled).
	return nil, nil
}

// ─── NotificationDispatcher tests ───

// TestNotificationDispatcher_NilReceiver_IsNoOp verifies that calling Notify
// on a nil *NotificationDispatcher is safe. The lead handlers rely on this
// to avoid guarding every call site.
func TestNotificationDispatcher_NilReceiver_IsNoOp(t *testing.T) {
	var d *NotificationDispatcher // nil
	// Must not panic.
	d.Notify(context.Background(), uuid.New(), "bookings", "t", "b", "/")
}

// TestNewNotificationDispatcher_NilInputs_ReturnsNil verifies the constructor
// treats nil delivery or nil lookup as "no dispatcher — disable notifications".
func TestNewNotificationDispatcher_NilInputs_ReturnsNil(t *testing.T) {
	if got := NewNotificationDispatcher(nil, nil); got != nil {
		t.Errorf("expected nil when both inputs nil, got %v", got)
	}
	fakeLookup := func(ctx context.Context, id uuid.UUID) (OwnerLookupResult, error) {
		return OwnerLookupResult{}, nil
	}
	if got := NewNotificationDispatcher(nil, fakeLookup); got != nil {
		t.Errorf("expected nil when delivery nil, got %v", got)
	}
	delivery := service.NewNotificationDeliveryService(&fakeNotifStore{})
	if got := NewNotificationDispatcher(delivery, nil); got != nil {
		t.Errorf("expected nil when lookup nil, got %v", got)
	}
}

// TestNotificationDispatcher_HappyPath_CallsDelivery verifies that a
// constructed dispatcher resolves the owner, constructs the intent, and
// forwards to the delivery service — which persists an in-app record via
// the fake store.
func TestNotificationDispatcher_HappyPath_CallsDelivery(t *testing.T) {
	store := &fakeNotifStore{}
	delivery := service.NewNotificationDeliveryService(store)
	wsID := uuid.New()
	ownerID := uuid.New()
	var lookedUp uuid.UUID
	lookup := func(_ context.Context, id uuid.UUID) (OwnerLookupResult, error) {
		lookedUp = id
		return OwnerLookupResult{UserID: ownerID, Email: "owner@example.com"}, nil
	}
	d := NewNotificationDispatcher(delivery, lookup)
	if d == nil {
		t.Fatal("expected non-nil dispatcher")
	}

	d.Notify(context.Background(), wsID, "bookings", "New lead", "Body text", "/crm/leads/x")

	if lookedUp != wsID {
		t.Errorf("lookup called with wrong workspace: want %s got %s", wsID, lookedUp)
	}
	if store.createCalls != 1 {
		t.Errorf("expected 1 in-app create, got %d", store.createCalls)
	}
	if store.lastRecord == nil {
		t.Fatal("expected record to be persisted")
	}
	if store.lastRecord.UserID != ownerID {
		t.Errorf("record user_id mismatch: want %s got %s", ownerID, store.lastRecord.UserID)
	}
	if store.lastRecord.Title != "New lead" {
		t.Errorf("record title: want 'New lead' got %q", store.lastRecord.Title)
	}
	if store.lastRecord.Channel != "in_app" {
		t.Errorf("record channel: want in_app got %q", store.lastRecord.Channel)
	}
}

// TestNotificationDispatcher_LookupError_SwallowsError verifies that a
// failing owner lookup does not panic and does not call the delivery service.
func TestNotificationDispatcher_LookupError_SwallowsError(t *testing.T) {
	store := &fakeNotifStore{}
	delivery := service.NewNotificationDeliveryService(store)
	lookup := func(_ context.Context, _ uuid.UUID) (OwnerLookupResult, error) {
		return OwnerLookupResult{}, context.DeadlineExceeded
	}
	d := NewNotificationDispatcher(delivery, lookup)
	d.Notify(context.Background(), uuid.New(), "bookings", "t", "b", "/")

	if store.createCalls != 0 {
		t.Errorf("expected 0 create calls on lookup error, got %d", store.createCalls)
	}
}

// TestNotificationDispatcher_NilWorkspace_IsNoOp verifies uuid.Nil workspace
// short-circuits before any lookup.
func TestNotificationDispatcher_NilWorkspace_IsNoOp(t *testing.T) {
	store := &fakeNotifStore{}
	delivery := service.NewNotificationDeliveryService(store)
	calls := 0
	lookup := func(_ context.Context, _ uuid.UUID) (OwnerLookupResult, error) {
		calls++
		return OwnerLookupResult{UserID: uuid.New()}, nil
	}
	d := NewNotificationDispatcher(delivery, lookup)
	d.Notify(context.Background(), uuid.Nil, "bookings", "t", "b", "/")

	if calls != 0 {
		t.Errorf("expected 0 lookup calls for nil workspace, got %d", calls)
	}
	if store.createCalls != 0 {
		t.Errorf("expected 0 create calls, got %d", store.createCalls)
	}
}

// ─── InvoiceHandler.DownloadPDF tests ───

// TestInvoiceHandler_DownloadPDF_NoPDFService verifies 503 when the handler
// was constructed without WithPDFService.
func TestInvoiceHandler_DownloadPDF_NoPDFService(t *testing.T) {
	h := NewInvoiceHandler(nil) // nil repo is fine — we never reach it
	r := chi.NewRouter()
	r.Get("/api/v1/invoices/{id}/pdf", h.DownloadPDF)

	req := httptest.NewRequest("GET", "/api/v1/invoices/"+uuid.New().String()+"/pdf", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 without pdf service, got %d: %s", w.Code, w.Body.String())
	}
}

// TestInvoiceHandler_DownloadPDF_MissingWorkspace verifies 400 when workspace
// context is missing (which is the default for a raw httptest request).
func TestInvoiceHandler_DownloadPDF_MissingWorkspace(t *testing.T) {
	h := NewInvoiceHandler(nil).WithPDFService(service.NewPDFService())
	r := chi.NewRouter()
	r.Get("/api/v1/invoices/{id}/pdf", h.DownloadPDF)

	req := httptest.NewRequest("GET", "/api/v1/invoices/"+uuid.New().String()+"/pdf", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 without workspace, got %d", w.Code)
	}
}

// TestInvoiceHandler_DownloadPDF_RequiresDB documents that happy-path
// rendering needs a live database to fetch the invoice row.
func TestInvoiceHandler_DownloadPDF_RequiresDB(t *testing.T) {
	t.Skip("requires DB — covered at integration level")
}

// TestFormatINR verifies the small currency helper added for invoice PDFs.
func TestFormatINR(t *testing.T) {
	cases := []struct {
		paisa int64
		want  string
	}{
		{0, "INR 0.00"},
		{1, "INR 0.01"},
		{100, "INR 1.00"},
		{123456, "INR 1,234.56"},
		{-100, "-INR 1.00"},
	}
	for _, c := range cases {
		if got := formatINR(c.paisa); got != c.want {
			t.Errorf("formatINR(%d): want %q got %q", c.paisa, c.want, got)
		}
	}
}

// ─── ContractHandler.DownloadPDF tests ───

// TestContractHandler_DownloadPDF_NoPDFService verifies 503 when the handler
// was constructed without WithPDFService.
func TestContractHandler_DownloadPDF_NoPDFService(t *testing.T) {
	h := NewContractHandler(nil)
	r := chi.NewRouter()
	r.Get("/api/v1/contracts/{id}/pdf", h.DownloadPDF)

	req := httptest.NewRequest("GET", "/api/v1/contracts/"+uuid.New().String()+"/pdf", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 without pdf service, got %d", w.Code)
	}
}

// TestContractHandler_DownloadPDF_MissingWorkspace verifies 400 when the
// workspace context is not present. This is the first validation gate the
// handler hits, before the UUID parse.
func TestContractHandler_DownloadPDF_MissingWorkspace(t *testing.T) {
	h := NewContractHandler(nil).WithPDFService(service.NewPDFService())
	r := chi.NewRouter()
	r.Get("/api/v1/contracts/{id}/pdf", h.DownloadPDF)

	req := httptest.NewRequest("GET", "/api/v1/contracts/"+uuid.New().String()+"/pdf", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestContractHandler_DownloadPDF_RequiresDB documents that happy-path
// rendering needs a live database to fetch the contract row.
func TestContractHandler_DownloadPDF_RequiresDB(t *testing.T) {
	t.Skip("requires DB — covered at integration level")
}

// TestStripHTMLToText verifies the tiny HTML stripper used for contract PDFs.
func TestStripHTMLToText(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"<p>Hello</p><p>World</p>", "Hello\n\nWorld\n\n"},
		{"Line one<br>Line two", "Line one\nLine two"},
		{"<div><span>hi</span></div>", "hi\n"},
	}
	for _, c := range cases {
		if got := stripHTMLToText(c.in); got != c.want {
			t.Errorf("stripHTMLToText(%q): want %q got %q", c.in, c.want, got)
		}
	}
}

// ─── LeadHandler.Create notification wiring ───

// TestLeadHandler_Create_MissingWorkspace verifies 400 when workspace is
// not present in request context, before the dispatcher is consulted.
func TestLeadHandler_Create_MissingWorkspace(t *testing.T) {
	h := NewLeadHandler(nil) // nil repo — not reached
	body := `{"name":"Test"}`
	req := httptest.NewRequest("POST", "/api/v1/crm/leads", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.Create(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 without workspace, got %d", w.Code)
	}
}

// TestLeadHandler_Create_RequiresDB documents the happy-path scenario which
// needs a real DB plus workspace context to exercise lead insertion and
// subsequent dispatcher Notify call.
func TestLeadHandler_Create_RequiresDB(t *testing.T) {
	t.Skip("happy path requires DB + middleware-injected workspace context")
}

// TestLeadHandler_WithNotificationDispatcher_FluentChain verifies the
// builder method returns the same handler and stores the dispatcher.
func TestLeadHandler_WithNotificationDispatcher_FluentChain(t *testing.T) {
	h := NewLeadHandler(nil)
	store := &fakeNotifStore{}
	delivery := service.NewNotificationDeliveryService(store)
	lookup := func(_ context.Context, _ uuid.UUID) (OwnerLookupResult, error) {
		return OwnerLookupResult{UserID: uuid.New()}, nil
	}
	d := NewNotificationDispatcher(delivery, lookup)

	got := h.WithNotificationDispatcher(d)
	if got != h {
		t.Error("WithNotificationDispatcher should return the same handler for chaining")
	}
	if h.dispatcher != d {
		t.Error("dispatcher was not stored")
	}
}
