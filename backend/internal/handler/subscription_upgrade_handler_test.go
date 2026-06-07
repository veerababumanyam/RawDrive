package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

// fakeOrderExecer drives markUpgradeOrderFailed without a real DB. It records
// the SQL/args it was called with and returns a configurable CommandTag/error,
// mirroring the fake-repo style used by payment_handler_test.go (F-014/F-026).
type fakeOrderExecer struct {
	tag     pgconn.CommandTag
	err     error
	called  bool
	gotSQL  string
	gotArgs []any
}

type fakePaymentSettings map[string]string

func (f fakePaymentSettings) Get(_ context.Context, category, key string) (string, bool, error) {
	v, ok := f[category+"."+key]
	return v, ok, nil
}

func (f *fakeOrderExecer) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.called = true
	f.gotSQL = sql
	f.gotArgs = args
	return f.tag, f.err
}

// Log capture for these tests reuses the shared captureLog helper defined in
// chunked_upload_refundlog_test.go (same package handler) — keeping one
// implementation avoids the redeclaration collision two agents introduced.

// TestF067UpgradeOrderFailureNotSwallowed is the regression test for F-067:
// before the fix the UPDATE that flips a failed PhonePe order to 'failed' was
// issued via `_, _ = h.db.Exec(...)`, discarding both the error and the
// rows-affected count, so a failed UPDATE (or a no-op match) silently left the
// order 'pending'. markUpgradeOrderFailed must now surface both conditions.
func TestF067UpgradeOrderFailureNotSwallowed(t *testing.T) {
	const orderID = "order-123"

	t.Run("exec error is logged, not swallowed", func(t *testing.T) {
		f := &fakeOrderExecer{err: errors.New("connection reset")}
		out := captureLog(func() {
			markUpgradeOrderFailed(context.Background(), f, orderID)
		})
		if !f.called {
			t.Fatal("expected Exec to be called")
		}
		if !strings.Contains(out, "failed to mark phonepe order "+orderID+" failed") {
			t.Fatalf("expected error to be logged, got %q", out)
		}
		if !strings.Contains(out, "connection reset") {
			t.Fatalf("expected underlying error in log, got %q", out)
		}
	})

	t.Run("zero rows affected is logged as a no-op warning", func(t *testing.T) {
		f := &fakeOrderExecer{tag: pgconn.NewCommandTag("UPDATE 0")}
		out := captureLog(func() {
			markUpgradeOrderFailed(context.Background(), f, orderID)
		})
		if !strings.Contains(out, "no pending row matched") {
			t.Fatalf("expected no-pending-row warning, got %q", out)
		}
	})

	t.Run("successful update logs nothing", func(t *testing.T) {
		f := &fakeOrderExecer{tag: pgconn.NewCommandTag("UPDATE 1")}
		out := captureLog(func() {
			markUpgradeOrderFailed(context.Background(), f, orderID)
		})
		if out != "" {
			t.Fatalf("expected no log output on success, got %q", out)
		}
		// Guard the WHERE clause that scopes the update to pending rows only.
		if !strings.Contains(f.gotSQL, "status = 'pending'") {
			t.Fatalf("update must only target pending rows, sql=%q", f.gotSQL)
		}
		if len(f.gotArgs) != 1 || f.gotArgs[0] != orderID {
			t.Fatalf("expected order id as sole arg, got %v", f.gotArgs)
		}
	})
}

func TestSubscriptionUpgradeRejectsSameAndLowerTiers(t *testing.T) {
	tests := []struct {
		name string
		from string
		to   string
		want bool
	}{
		{name: "free to creator", from: "free", to: "creator", want: true},
		{name: "creator to pro photographer", from: "creator", to: "pro_photographer", want: true},
		{name: "same tier", from: "creator", to: "creator", want: false},
		{name: "downgrade", from: "pro_photographer", to: "creator", want: false},
		{name: "unknown target", from: "creator", to: "unknown", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isStrictUpgrade(tt.from, tt.to); got != tt.want {
				t.Fatalf("isStrictUpgrade(%q, %q) = %v, want %v", tt.from, tt.to, got, tt.want)
			}
		})
	}
}

func TestSubscriptionUpgradeValidTierRequiresSelfServePaidPlan(t *testing.T) {
	tests := []struct {
		tier string
		want bool
	}{
		{tier: "creator", want: true},
		{tier: "pro_photographer", want: true},
		{tier: "studio", want: true},
		{tier: "free", want: false},
		{tier: "pay_per_event", want: false},
		{tier: "elite_studio", want: false},
		{tier: "unknown", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.tier, func(t *testing.T) {
			if got := validUpgradeTier(tt.tier); got != tt.want {
				t.Fatalf("validUpgradeTier(%q) = %v, want %v", tt.tier, got, tt.want)
			}
		})
	}
}

func TestSubscriptionUpgradeConfigReadsPlatformSettings(t *testing.T) {
	h := NewSubscriptionUpgradeHandlerFromSettings(context.Background(), nil, fakePaymentSettings{
		"payments.razorpay_key_id":          "rzp-key",
		"payments.razorpay_key_secret":      "rzp-secret",
		"payments.razorpay_webhook_secret":  "rzp-webhook",
		"payments.razorpay_base_url":        "https://razorpay.test",
		"payments.phonepe_client_id":        "pp-client",
		"payments.phonepe_client_secret":    "pp-secret",
		"payments.phonepe_client_version":   "2",
		"payments.phonepe_v2_base_url":      "https://phonepe.test/apis/pg",
		"payments.phonepe_v2_auth_base_url": "https://phonepe.test/apis/auth",
		"payments.phonepe_webhook_username": "pp-webhook-user",
		"payments.phonepe_webhook_password": "pp-webhook-password",
		"payments.public_base_url":          "https://app.rawdrive.test",
	})
	if h.rzp.KeyID != "rzp-key" || h.rzp.KeySecret != "rzp-secret" || h.rzp.WebhookSecret != "rzp-webhook" {
		t.Fatalf("razorpay config not read from settings: %#v", h.rzp)
	}
	if h.rzp.BaseURL != "https://razorpay.test" {
		t.Fatalf("razorpay base url = %q", h.rzp.BaseURL)
	}
	if h.phonepe == nil {
		t.Fatal("phonepe client should be configured from settings")
	}
	if h.publicBaseURL != "https://app.rawdrive.test" {
		t.Fatalf("publicBaseURL = %q", h.publicBaseURL)
	}
	if !h.phonepeWebhookConfigured() {
		t.Fatal("phonepe webhook credentials should be configured from settings")
	}
}

func TestSubscriptionPaymentProvidersReflectConfiguration(t *testing.T) {
	h := NewSubscriptionUpgradeHandler(nil, RazorpayUpgradeConfig{
		KeyID:         "rzp-key",
		KeySecret:     "rzp-secret",
		WebhookSecret: "rzp-webhook",
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/subscription/payment-providers", nil)
	h.PaymentProviders(rec, req)

	var body paymentProvidersResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode providers response: %v", err)
	}
	if body.DefaultProvider != "razorpay" {
		t.Fatalf("default provider = %q, want razorpay", body.DefaultProvider)
	}
	got := map[string]bool{}
	for _, p := range body.Providers {
		got[p.ID] = p.Configured
	}
	if !got["razorpay"] {
		t.Fatal("razorpay should be configured")
	}
	if got["phonepe"] {
		t.Fatal("phonepe should be unavailable without v2 client + callback settings")
	}

	h.phonepe = NewPhonePeV2Client(PhonePeV2Config{
		ClientID:     "pp-client",
		ClientSecret: "pp-secret",
		BaseURL:      "https://phonepe.test/apis/pg",
	})
	h.publicBaseURL = "https://app.rawdrive.test"

	rec = httptest.NewRecorder()
	h.PaymentProviders(rec, req)
	body = paymentProvidersResponse{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode providers response: %v", err)
	}
	got = map[string]bool{}
	for _, p := range body.Providers {
		got[p.ID] = p.Configured
	}
	if !got["phonepe"] {
		t.Fatal("phonepe checkout should be configured when v2 client and public base URL are present")
	}
}

func TestSubscriptionPaymentProvidersReflectLivePlatformSettingChanges(t *testing.T) {
	settings := fakePaymentSettings{
		"payments.razorpay_key_id":         "rzp-key",
		"payments.razorpay_key_secret":     "rzp-secret",
		"payments.razorpay_webhook_secret": "rzp-webhook",
	}
	h := NewSubscriptionUpgradeHandlerFromSettings(context.Background(), nil, settings)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/subscription/payment-providers", nil)
	rec := httptest.NewRecorder()
	h.PaymentProviders(rec, req)

	var body paymentProvidersResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode providers response: %v", err)
	}
	got := map[string]bool{}
	for _, p := range body.Providers {
		got[p.ID] = p.Configured
	}
	if got["phonepe"] {
		t.Fatal("phonepe should start disabled without credentials")
	}

	settings["payments.phonepe_client_id"] = "pp-client"
	settings["payments.phonepe_client_secret"] = "pp-secret"
	settings["payments.public_base_url"] = "https://app.rawdrive.test"

	rec = httptest.NewRecorder()
	h.PaymentProviders(rec, req)
	body = paymentProvidersResponse{}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode providers response after settings change: %v", err)
	}
	got = map[string]bool{}
	for _, p := range body.Providers {
		got[p.ID] = p.Configured
	}
	if !got["phonepe"] {
		t.Fatal("phonepe should become available from updated platform settings without rebuilding handler")
	}
}

func TestEventBillingProductCheckoutRequiresQuotaAndThirtyDayTerms(t *testing.T) {
	product := billingProductVersion{
		versionID:       uuid.New(),
		productCode:     "event_upload_standard",
		productType:     "event_upload",
		name:            "Event upload",
		description:     "One-off upload cycle.",
		currency:        "INR",
		pricePaise:      19900,
		billingInterval: "one_time",
		metadata: []byte(`{
			"active_days":30,
			"upload_window_days":30,
			"retention_days":30,
			"upload_credits":500,
			"quota_bytes":10737418240
		}`),
		rank: 10,
	}

	if err := validateBillingProductForCheckout(product); err != nil {
		t.Fatalf("valid event product rejected: %v", err)
	}
	snapshot, err := billingProductSnapshot(product, "event_upload")
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	var body map[string]any
	if err := json.Unmarshal(snapshot, &body); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	productBody := body["product"].(map[string]any)
	metadata := productBody["metadata"].(map[string]any)
	if got := metadata["quota_bytes"]; got != float64(10737418240) {
		t.Fatalf("snapshot quota_bytes = %v", got)
	}
	if got := metadata["retention_days"]; got != float64(30) {
		t.Fatalf("snapshot retention_days = %v", got)
	}

	product.metadata = []byte(`{"active_days":30,"upload_window_days":30,"retention_days":30}`)
	if err := validateBillingProductForCheckout(product); err == nil || !strings.Contains(err.Error(), "quota_bytes") {
		t.Fatalf("expected quota metadata error, got %v", err)
	}
}

func TestPhonePeWebhookAuthorizationUsesV2CallbackHash(t *testing.T) {
	h := &SubscriptionUpgradeHandler{
		phonepeWebhookUsername: "callback-user",
		phonepeWebhookPassword: "callback-password",
	}
	valid := phonePeCallbackHash("callback-user", "callback-password")
	if !h.verifyPhonePeWebhookAuthorization(valid) {
		t.Fatal("expected raw callback hash to validate")
	}
	if !h.verifyPhonePeWebhookAuthorization("SHA256 " + valid) {
		t.Fatal("expected SHA256-prefixed callback hash to validate")
	}
	if h.verifyPhonePeWebhookAuthorization("bad") {
		t.Fatal("invalid callback hash should be rejected")
	}
}

func TestPhonePeCallbackFallsBackToPayloadEnvelope(t *testing.T) {
	cb := phonePeSubscriptionCallback{
		Payload: phonePeSubscriptionCallbackData{
			MerchantOrderID: "upgrade-order-1",
			State:           "COMPLETED",
			Amount:          299000,
		},
	}
	data := cb.paymentData()
	if data.MerchantOrderID != "upgrade-order-1" || data.State != "COMPLETED" || data.Amount != 299000 {
		t.Fatalf("unexpected callback data: %#v", data)
	}
}
