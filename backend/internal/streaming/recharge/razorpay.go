// Razorpay Orders + Webhooks adapter.
//
// Order creation: POST https://api.razorpay.com/v1/orders (Basic Auth = key:secret)
// Checkout URL is constructed client-side; backend returns order_id + amount.
// The frontend opens Razorpay Checkout with that order_id.
//
// Webhook signature: x-razorpay-signature = HMAC-SHA256(rawBody, webhookSecret)
package recharge

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// RazorpayConfig is the config snapshot for a Razorpay call.
type RazorpayConfig struct {
	KeyID         string
	KeySecret     string
	WebhookSecret string
	BaseURL       string // default: https://api.razorpay.com
	HTTPClient    *http.Client
}

// RazorpayProvider implements Provider for Razorpay.
type RazorpayProvider struct {
	cfg RazorpayConfig
}

// NewRazorpayProvider constructs a RazorpayProvider. Returns ErrProviderUnavailable
// if required config is missing.
func NewRazorpayProvider(cfg RazorpayConfig) (*RazorpayProvider, error) {
	if cfg.KeyID == "" || cfg.KeySecret == "" || cfg.WebhookSecret == "" {
		return nil, ErrProviderUnavailable
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.razorpay.com"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &RazorpayProvider{cfg: cfg}, nil
}

// Name returns NameRazorpay.
func (p *RazorpayProvider) Name() Name { return NameRazorpay }

type razorpayOrderRequest struct {
	Amount   int64             `json:"amount"`   // paise
	Currency string            `json:"currency"` // "INR"
	Receipt  string            `json:"receipt"`  // our recharge_order id
	Notes    map[string]string `json:"notes,omitempty"`
}

type razorpayOrderResponse struct {
	ID         string `json:"id"`     // order_id
	Amount     int64  `json:"amount"`
	Currency   string `json:"currency"`
	Status     string `json:"status"`
	Receipt    string `json:"receipt"`
	CreatedAt  int64  `json:"created_at"`
	ShortURL   string `json:"short_url"` // hosted-link URL when present
}

// InitiateOrder calls /v1/orders. CheckoutURL falls back to a placeholder
// frontend route since Razorpay Checkout is launched client-side; the
// caller is responsible for exposing order_id to the SDK.
func (p *RazorpayProvider) InitiateOrder(ctx context.Context, in InitiateInput) (*InitiateResult, error) {
	body, err := json.Marshal(razorpayOrderRequest{
		Amount:   in.AmountPaise,
		Currency: "INR",
		Receipt:  in.OrderID,
		Notes: map[string]string{
			"workspace_id": in.WorkspaceID,
			"order_id":     in.OrderID,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("razorpay: marshal order: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(p.cfg.BaseURL, "/")+"/v1/orders", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("razorpay: build request: %w", err)
	}
	req.SetBasicAuth(p.cfg.KeyID, p.cfg.KeySecret)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := p.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("razorpay: order http: %w", err)
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("razorpay: order http %d: %s", resp.StatusCode, string(respBytes))
	}

	var parsed razorpayOrderResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return nil, fmt.Errorf("razorpay: parse order: %w", err)
	}

	// short_url is non-empty for Standard Hosted Checkout; otherwise the
	// frontend opens the in-page Checkout SDK with key_id + order_id.
	checkoutURL := parsed.ShortURL
	if checkoutURL == "" {
		checkoutURL = fmt.Sprintf("razorpay://checkout?key_id=%s&order_id=%s",
			p.cfg.KeyID, parsed.ID)
	}

	return &InitiateResult{
		CheckoutURL:     checkoutURL,
		ProviderOrderID: parsed.ID,
		Raw:             respBytes,
	}, nil
}

// VerifyWebhookSignature checks x-razorpay-signature = HMAC-SHA256(rawBody, secret).
func (p *RazorpayProvider) VerifyWebhookSignature(rawBody []byte, headers map[string]string) error {
	sig := strings.TrimSpace(getHeaderInsensitive(headers, "X-Razorpay-Signature"))
	if sig == "" {
		return ErrInvalidSignature
	}
	expected := SignRazorpayWebhook(rawBody, p.cfg.WebhookSecret)
	if !constantTimeEqual(sig, expected) {
		return ErrInvalidSignature
	}
	return nil
}

// Razorpay webhook envelope (only the fields we read).
type razorpayWebhookBody struct {
	Event   string `json:"event"`   // "payment.captured" | "payment.failed" | ...
	Payload struct {
		Payment struct {
			Entity struct {
				ID       string `json:"id"`        // payment id (pay_xxx)
				OrderID  string `json:"order_id"`  // order id (order_xxx) — matches what we created
				Amount   int64  `json:"amount"`
				Status   string `json:"status"`    // "captured" | "failed"
				Currency string `json:"currency"`
			} `json:"entity"`
		} `json:"payment"`
	} `json:"payload"`
}

// ParseCallback decodes the verified Razorpay webhook event.
func (p *RazorpayProvider) ParseCallback(rawBody []byte) (*CallbackPayload, error) {
	var b razorpayWebhookBody
	if err := json.Unmarshal(rawBody, &b); err != nil {
		return nil, ErrUnparseableCallback
	}
	pe := b.Payload.Payment.Entity
	if pe.OrderID == "" {
		return nil, ErrUnparseableCallback
	}

	status := CallbackPending
	switch strings.ToLower(pe.Status) {
	case "captured", "authorized":
		status = CallbackSuccess
	case "failed":
		status = CallbackFailed
	}

	return &CallbackPayload{
		ProviderOrderID:   pe.OrderID,
		ProviderPaymentID: pe.ID,
		AmountPaise:       pe.Amount,
		Status:            status,
		Raw:               rawBody,
	}, nil
}

// SignRazorpayWebhook computes HMAC-SHA256(rawBody, webhookSecret) hex-encoded.
func SignRazorpayWebhook(rawBody []byte, webhookSecret string) string {
	h := hmac.New(sha256.New, []byte(webhookSecret))
	h.Write(rawBody)
	return hex.EncodeToString(h.Sum(nil))
}

// formatPaiseDebug — kept as a tiny helper to keep imports minimal in tests.
var _ = strconv.Itoa
