package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestPhonePeV2ClientUsesEncodedOAuthAndBearerToken(t *testing.T) {
	var sawTokenForm bool
	var sawPayAuth bool
	var sawStatusAuth bool
	var sawStatusPath bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/auth/v1/oauth/token":
			if r.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
				t.Fatalf("token content-type = %q", r.Header.Get("Content-Type"))
			}
			rawBody, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read token body: %v", err)
			}
			form, err := url.ParseQuery(string(rawBody))
			if err != nil {
				t.Fatalf("parse token form: %v", err)
			}
			if form.Get("client_id") != "client&with=symbols" {
				t.Fatalf("client_id form value = %q", form.Get("client_id"))
			}
			if form.Get("client_secret") != "secret+with=symbols&more" {
				t.Fatalf("client_secret form value = %q", form.Get("client_secret"))
			}
			if form.Get("client_version") != "2" || form.Get("grant_type") != "client_credentials" {
				t.Fatalf("unexpected token form: %v", form)
			}
			sawTokenForm = true
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "phonepe-token",
				"token_type":   "O-Bearer",
				"expires_at":   time.Now().Add(time.Hour).Unix(),
			})
		case r.URL.Path == "/pg/checkout/v2/pay":
			if r.Header.Get("Authorization") != "O-Bearer phonepe-token" {
				t.Fatalf("pay auth header = %q", r.Header.Get("Authorization"))
			}
			if r.Header.Get("Source") != "INTEGRATION" || r.Header.Get("x-source-version") != "V2" {
				t.Fatalf("pay source headers missing: Source=%q x-source-version=%q", r.Header.Get("Source"), r.Header.Get("x-source-version"))
			}
			sawPayAuth = true
			_ = json.NewEncoder(w).Encode(map[string]any{
				"orderId":     "phonepe-order",
				"redirectUrl": "https://mercury-uat.phonepe.com/transact/uat_v2?token=abc",
				"expireAt":    time.Now().Add(time.Hour).Unix(),
				"state":       "PENDING",
			})
		case strings.HasPrefix(r.URL.EscapedPath(), "/pg/checkout/v2/order/"):
			if r.Header.Get("Authorization") != "O-Bearer phonepe-token" {
				t.Fatalf("status auth header = %q", r.Header.Get("Authorization"))
			}
			if r.Header.Get("Source") != "INTEGRATION" || r.Header.Get("x-source-version") != "V2" {
				t.Fatalf("status source headers missing: Source=%q x-source-version=%q", r.Header.Get("Source"), r.Header.Get("x-source-version"))
			}
			sawStatusAuth = true
			sawStatusPath = r.URL.EscapedPath() == "/pg/checkout/v2/order/order-123/status"
			_ = json.NewEncoder(w).Encode(map[string]any{
				"orderId": "phonepe-order",
				"state":   "COMPLETED",
				"amount":  12345,
				"paymentDetails": []map[string]any{
					{"transactionId": "txn-1", "state": "COMPLETED", "amount": 12345},
				},
			})
		default:
			t.Fatalf("unexpected request path: %s", r.URL.EscapedPath())
		}
	}))
	defer server.Close()

	client := NewPhonePeV2Client(PhonePeV2Config{
		ClientID:      "client&with=symbols",
		ClientSecret:  "secret+with=symbols&more",
		ClientVersion: "2",
		BaseURL:       server.URL + "/pg",
		AuthBaseURL:   server.URL + "/auth",
		HTTPClient:    server.Client(),
	})
	if client == nil {
		t.Fatal("expected client")
	}

	order, err := client.CreateOrder(context.Background(), CreateOrderInput{
		MerchantOrderID: "order-123",
		AmountPaise:     12345,
		RedirectURL:     "https://rawdrive.test/settings/plans/payment-callback?provider=phonepe&order_id=order",
		WorkspaceID:     "workspace-1",
		ToTier:          "pro_photographer",
	})
	if err != nil {
		t.Fatalf("CreateOrder: %v", err)
	}
	if order.RedirectURL == "" {
		t.Fatal("expected redirect URL")
	}

	status, err := client.FetchOrderStatus(context.Background(), "order-123")
	if err != nil {
		t.Fatalf("FetchOrderStatus: %v", err)
	}
	if status.State != "COMPLETED" || status.PrimaryTransaction != "txn-1" {
		t.Fatalf("unexpected status: %#v", status)
	}
	if !sawTokenForm || !sawPayAuth || !sawStatusAuth || !sawStatusPath {
		t.Fatalf("missing expected checks: token=%v pay=%v status=%v path=%v", sawTokenForm, sawPayAuth, sawStatusAuth, sawStatusPath)
	}
}
