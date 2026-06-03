// PhonePe Standard Checkout adapter.
//
// Reference: https://developer.phonepe.com/v1/reference/pay-api
//
// Request signing (X-VERIFY):
//   X-VERIFY = SHA256(<base64-payload> + "/pg/v1/pay" + saltKey) + "###" + saltIndex
//
// Webhook signature:
//   X-VERIFY = SHA256(<base64-response-body> + saltKey) + "###" + saltIndex
//   (Note: webhook variant has no path component — only the base64 body + saltKey.)

package recharge

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// PhonePeConfig is the config snapshot for a single InitiateOrder call.
// All fields are loaded from platform_settings['payments.phonepe_*'] by
// the recharge handler; PhonePe itself never reads env or DB.
type PhonePeConfig struct {
	MerchantID string
	SaltKey    string
	SaltIndex  string // typically "1"
	BaseURL    string // e.g. https://api.phonepe.com/apis/hermes
	HTTPClient *http.Client
}

// PhonePeProvider implements Provider for PhonePe Standard Checkout.
type PhonePeProvider struct {
	cfg PhonePeConfig
}

// NewPhonePeProvider constructs a PhonePeProvider. Returns ErrProviderUnavailable
// if required config is missing.
func NewPhonePeProvider(cfg PhonePeConfig) (*PhonePeProvider, error) {
	if cfg.MerchantID == "" || cfg.SaltKey == "" || cfg.SaltIndex == "" || cfg.BaseURL == "" {
		return nil, ErrProviderUnavailable
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &PhonePeProvider{cfg: cfg}, nil
}

// Name returns NamePhonePe.
func (p *PhonePeProvider) Name() Name { return NamePhonePe }

// pay-api request body.
type phonePePayRequest struct {
	MerchantID            string                 `json:"merchantId"`
	MerchantTransactionID string                 `json:"merchantTransactionId"`
	MerchantUserID        string                 `json:"merchantUserId"`
	Amount                int64                  `json:"amount"` // paise
	RedirectURL           string                 `json:"redirectUrl"`
	RedirectMode          string                 `json:"redirectMode"` // "REDIRECT"
	CallbackURL           string                 `json:"callbackUrl"`
	MobileNumber          string                 `json:"mobileNumber,omitempty"`
	PaymentInstrument     map[string]interface{} `json:"paymentInstrument"`
}

type phonePePayResponse struct {
	Success bool   `json:"success"`
	Code    string `json:"code"`
	Message string `json:"message"`
	Data    struct {
		MerchantID            string `json:"merchantId"`
		MerchantTransactionID string `json:"merchantTransactionId"`
		InstrumentResponse    struct {
			Type         string `json:"type"`
			RedirectInfo struct {
				URL    string `json:"url"`
				Method string `json:"method"`
			} `json:"redirectInfo"`
		} `json:"instrumentResponse"`
	} `json:"data"`
}

// InitiateOrder calls /pg/v1/pay and returns the hosted-checkout URL.
func (p *PhonePeProvider) InitiateOrder(ctx context.Context, in InitiateInput) (*InitiateResult, error) {
	body := phonePePayRequest{
		MerchantID:            p.cfg.MerchantID,
		MerchantTransactionID: in.OrderID,
		MerchantUserID:        in.WorkspaceID,
		Amount:                in.AmountPaise,
		RedirectURL:           in.RedirectURL,
		RedirectMode:          "REDIRECT",
		CallbackURL:           in.CallbackURL,
		MobileNumber:          in.CustomerPhone,
		PaymentInstrument:     map[string]interface{}{"type": "PAY_PAGE"},
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("phonepe: marshal pay body: %w", err)
	}
	b64 := base64.StdEncoding.EncodeToString(bodyJSON)
	checksum := SignPhonePePay(b64, p.cfg.SaltKey, p.cfg.SaltIndex)

	wrapped, err := json.Marshal(map[string]string{"request": b64})
	if err != nil {
		return nil, fmt.Errorf("phonepe: marshal wrapper: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(p.cfg.BaseURL, "/")+"/pg/v1/pay", bytes.NewReader(wrapped))
	if err != nil {
		return nil, fmt.Errorf("phonepe: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-VERIFY", checksum)
	req.Header.Set("Accept", "application/json")

	resp, err := p.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("phonepe: pay http: %w", err)
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("phonepe: pay http %d: %s", resp.StatusCode, string(respBytes))
	}

	var parsed phonePePayResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return nil, fmt.Errorf("phonepe: parse pay response: %w", err)
	}
	if !parsed.Success || parsed.Data.InstrumentResponse.RedirectInfo.URL == "" {
		return nil, fmt.Errorf("phonepe: pay rejected: code=%s message=%s", parsed.Code, parsed.Message)
	}

	return &InitiateResult{
		CheckoutURL:     parsed.Data.InstrumentResponse.RedirectInfo.URL,
		ProviderOrderID: parsed.Data.MerchantTransactionID,
		Raw:             respBytes,
	}, nil
}

// VerifyWebhookSignature checks the X-VERIFY header.
//
//	X-VERIFY = SHA256(base64(rawBody) + saltKey) + "###" + saltIndex
func (p *PhonePeProvider) VerifyWebhookSignature(rawBody []byte, headers map[string]string) error {
	xVerify := strings.TrimSpace(getHeaderInsensitive(headers, "X-VERIFY"))
	if xVerify == "" {
		return ErrInvalidSignature
	}
	expected := SignPhonePeCallback(base64.StdEncoding.EncodeToString(rawBody), p.cfg.SaltKey, p.cfg.SaltIndex)
	if !constantTimeEqual(xVerify, expected) {
		return ErrInvalidSignature
	}
	return nil
}

// PhonePe webhook body.
type phonePeWebhookBody struct {
	Response string `json:"response"` // base64-encoded JSON
}

type phonePeWebhookData struct {
	Success bool   `json:"success"`
	Code    string `json:"code"`
	Message string `json:"message"`
	Data    struct {
		MerchantID            string `json:"merchantId"`
		MerchantTransactionID string `json:"merchantTransactionId"`
		TransactionID         string `json:"transactionId"`
		Amount                int64  `json:"amount"`
		State                 string `json:"state"` // 'COMPLETED' | 'FAILED' | 'PENDING'
		ResponseCode          string `json:"responseCode"`
	} `json:"data"`
}

// ParseCallback decodes the wrapped base64 PhonePe webhook envelope.
func (p *PhonePeProvider) ParseCallback(rawBody []byte) (*CallbackPayload, error) {
	var wrap phonePeWebhookBody
	if err := json.Unmarshal(rawBody, &wrap); err != nil || wrap.Response == "" {
		return nil, ErrUnparseableCallback
	}
	inner, err := base64.StdEncoding.DecodeString(wrap.Response)
	if err != nil {
		return nil, ErrUnparseableCallback
	}
	var data phonePeWebhookData
	if err := json.Unmarshal(inner, &data); err != nil {
		return nil, ErrUnparseableCallback
	}

	status := CallbackPending
	switch strings.ToUpper(data.Data.State) {
	case "COMPLETED":
		status = CallbackSuccess
	case "FAILED":
		status = CallbackFailed
	}

	return &CallbackPayload{
		ProviderOrderID:   data.Data.MerchantTransactionID,
		ProviderPaymentID: data.Data.TransactionID,
		AmountPaise:       data.Data.Amount,
		Status:            status,
		Raw:               inner,
	}, nil
}

// SignPhonePePay computes the X-VERIFY for the /pg/v1/pay request.
// Exposed for handler-level retries and webhook tests.
func SignPhonePePay(base64Body, saltKey, saltIndex string) string {
	h := sha256.Sum256([]byte(base64Body + "/pg/v1/pay" + saltKey))
	return hex.EncodeToString(h[:]) + "###" + saltIndex
}

// SignPhonePeCallback computes the X-VERIFY for callback bodies.
// Note: callback variant DOES NOT include a URL path — only base64body+saltKey.
func SignPhonePeCallback(base64Body, saltKey, saltIndex string) string {
	h := sha256.Sum256([]byte(base64Body + saltKey))
	return hex.EncodeToString(h[:]) + "###" + saltIndex
}

func getHeaderInsensitive(h map[string]string, key string) string {
	for k, v := range h {
		if strings.EqualFold(k, key) {
			return v
		}
	}
	return ""
}

func constantTimeEqual(a, b string) bool {
	// Avoid early-return on length mismatch leaking timing info; cheapness >>
	// security here so a simple ConstantTimeCompare is fine.
	if len(a) != len(b) {
		return false
	}
	var diff byte
	for i := 0; i < len(a); i++ {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}
