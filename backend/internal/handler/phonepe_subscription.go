package handler

// PhonePe Standard Checkout v2 client for the subscription-upgrade flow.
//
// This is a NEW v2 (OAuth-based) provider; it is intentionally separate
// from the existing v1 (X-VERIFY salt-based) `streaming/recharge`
// `PhonePeProvider` because (a) the user's credentials in
// .env.backend (PHONEPE_CLIENTID / PHONEPE_SECRET / PHONEPE_VERSION) are
// v2-only and (b) the v1 surface serves a different feature (upload
// credit recharge for the M41 stream-fund pipeline) which we don't want
// to disturb.
//
// API reference: https://developer.phonepe.com/v1/reference/checkout-v2-pay
// OAuth flow:    POST {base}/v1/oauth/token
//                  grant_type=client_credentials
//                  client_id, client_secret, client_version
//                returns {access_token, token_type=O-Bearer, expires_at}
// Pay:           POST {base}/checkout/v2/pay
//                  Authorization: O-Bearer <token>
//                  body: {merchantOrderId, amount, expireAfter,
//                         paymentFlow:{type:PG_CHECKOUT, message,
//                         merchantUrls:{redirectUrl}}}
//                returns {orderId, redirectUrl, expireAt}
// Status:        GET {base}/checkout/v2/order/{merchantOrderId}/status
//                  Authorization: O-Bearer <token>
//                returns {orderId, state: COMPLETED|FAILED|PENDING,
//                         amount, ...}

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// PhonePeV2Config holds the OAuth client credentials for the v2 API.
type PhonePeV2Config struct {
	ClientID      string
	ClientSecret  string
	ClientVersion string // "1" for current live; PhonePe rotates per merchant
	BaseURL       string // https://api.phonepe.com/apis/pg (live) or
	//                       https://api-preprod.phonepe.com/apis/pg-sandbox (test)
	HTTPClient *http.Client
}

// PhonePeV2Client is a thin client around PhonePe v2 Standard Checkout.
// Token is cached in-memory with TTL; per-instance only (multi-instance
// prod should swap in a Redis-backed cache).
type PhonePeV2Client struct {
	cfg PhonePeV2Config

	mu          sync.Mutex
	cachedToken string
	expiresAt   time.Time
}

// NewPhonePeV2Client constructs a client. Returns nil if any required
// field is missing — callers should check and skip the PhonePe code
// path gracefully (the handler returns 503 in that case).
func NewPhonePeV2Client(cfg PhonePeV2Config) *PhonePeV2Client {
	if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.BaseURL == "" {
		return nil
	}
	if cfg.ClientVersion == "" {
		cfg.ClientVersion = "1"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &PhonePeV2Client{cfg: cfg}
}

// ── OAuth ───────────────────────────────────────────────────────────────────

type phonepeTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	// PhonePe returns an absolute epoch timestamp (seconds) for expiry,
	// not a relative duration. We pin the cache slightly before that to
	// avoid edge-of-window failures.
	ExpiresAt int64 `json:"expires_at"`
	IssuedAt  int64 `json:"issued_at"`
	// Some envs return Expires (seconds) as an alternative — keep both
	// to be tolerant of either shape.
	Expires int64 `json:"expires_in"`
}

// fetchToken returns a cached or freshly-issued OAuth token. Refreshes
// 60s before declared expiry to absorb clock skew + retry budget.
func (c *PhonePeV2Client) fetchToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cachedToken != "" && time.Now().Before(c.expiresAt) {
		return c.cachedToken, nil
	}

	form := strings.NewReader(fmt.Sprintf(
		"client_id=%s&client_version=%s&client_secret=%s&grant_type=client_credentials",
		c.cfg.ClientID, c.cfg.ClientVersion, c.cfg.ClientSecret,
	))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(c.cfg.BaseURL, "/")+"/v1/oauth/token", form)
	if err != nil {
		return "", fmt.Errorf("phonepe: token build req: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("phonepe: token http: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("phonepe: token http %d: %s", resp.StatusCode, string(body))
	}
	var tok phonepeTokenResponse
	if err := json.Unmarshal(body, &tok); err != nil {
		return "", fmt.Errorf("phonepe: token parse: %w", err)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("phonepe: token empty: %s", string(body))
	}
	// Compute expiry: prefer ExpiresAt epoch, fall back to Expires
	// relative seconds, finally fall back to a conservative 30 min.
	var exp time.Time
	switch {
	case tok.ExpiresAt > 0:
		exp = time.Unix(tok.ExpiresAt, 0)
	case tok.Expires > 0:
		exp = time.Now().Add(time.Duration(tok.Expires) * time.Second)
	default:
		exp = time.Now().Add(30 * time.Minute)
	}
	// Refresh 60s early to avoid edge-of-window failures.
	c.cachedToken = tok.AccessToken
	c.expiresAt = exp.Add(-60 * time.Second)
	return c.cachedToken, nil
}

// ── Create Order ────────────────────────────────────────────────────────────

type phonepeMerchantURLs struct {
	RedirectURL string `json:"redirectUrl"`
}

type phonepePaymentFlow struct {
	Type          string              `json:"type"`
	Message       string              `json:"message,omitempty"`
	MerchantURLs  phonepeMerchantURLs `json:"merchantUrls"`
}

type phonepePayRequest struct {
	MerchantOrderID string             `json:"merchantOrderId"`
	Amount          int64              `json:"amount"`      // paise
	ExpireAfter     int                `json:"expireAfter"` // seconds; PhonePe min 300
	PaymentFlow     phonepePaymentFlow `json:"paymentFlow"`
}

type phonepePayResponse struct {
	OrderID     string `json:"orderId"`
	RedirectURL string `json:"redirectUrl"`
	ExpireAt    int64  `json:"expireAt"`
	State       string `json:"state"`
	// Error shape — included when status>=400 to bubble up the message.
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

// PhonePeOrderResult is what the handler returns to the frontend so it
// can window.location.assign() to PhonePe.
type PhonePeOrderResult struct {
	MerchantOrderID string `json:"merchant_order_id"` // our id (mirrored back via redirect)
	PhonePeOrderID  string `json:"phonepe_order_id"`  // PhonePe's order id
	RedirectURL     string `json:"redirect_url"`      // hosted checkout url
	ExpireAt        int64  `json:"expire_at"`         // epoch seconds
}

// CreateOrder calls /checkout/v2/pay and returns the redirect URL.
// merchantOrderID must be unique per workspace+order and is the key we
// use to look up our subscription_upgrade_orders row on callback.
func (c *PhonePeV2Client) CreateOrder(ctx context.Context, merchantOrderID string, amountPaise int64, redirectURL, message string) (*PhonePeOrderResult, error) {
	token, err := c.fetchToken(ctx)
	if err != nil {
		return nil, err
	}
	if message == "" {
		message = "RawDrive plan upgrade"
	}
	payload, _ := json.Marshal(phonepePayRequest{
		MerchantOrderID: merchantOrderID,
		Amount:          amountPaise,
		// 20 minutes — comfortably above PhonePe's 300s minimum and
		// generous enough that users don't get expired-order errors
		// from idle tab time.
		ExpireAfter: 1200,
		PaymentFlow: phonepePaymentFlow{
			Type:    "PG_CHECKOUT",
			Message: message,
			MerchantURLs: phonepeMerchantURLs{
				RedirectURL: redirectURL,
			},
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(c.cfg.BaseURL, "/")+"/checkout/v2/pay", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("phonepe: pay build req: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "O-Bearer "+token)

	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("phonepe: pay http: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("phonepe: pay http %d: %s", resp.StatusCode, string(body))
	}
	var out phonepePayResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("phonepe: pay parse: %w", err)
	}
	if out.RedirectURL == "" {
		return nil, fmt.Errorf("phonepe: pay empty redirect: state=%q code=%q msg=%q", out.State, out.Code, out.Message)
	}
	return &PhonePeOrderResult{
		MerchantOrderID: merchantOrderID,
		PhonePeOrderID:  out.OrderID,
		RedirectURL:     out.RedirectURL,
		ExpireAt:        out.ExpireAt,
	}, nil
}

// ── Status ──────────────────────────────────────────────────────────────────

type phonepeStatusResponse struct {
	OrderID         string `json:"orderId"`
	State           string `json:"state"` // COMPLETED, FAILED, PENDING
	Amount          int64  `json:"amount"`
	PaymentDetails []struct {
		TransactionID string `json:"transactionId"`
		State         string `json:"state"`
		Amount        int64  `json:"amount"`
	} `json:"paymentDetails"`
	// Error shape
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

// PhonePeStatus is the normalised view of an order's payment state.
type PhonePeStatus struct {
	State              string // COMPLETED | FAILED | PENDING (PhonePe's canonical values)
	Amount             int64
	PrimaryTransaction string // first paymentDetails[].transactionId — what we persist as provider_payment_id
}

// FetchOrderStatus calls /checkout/v2/order/{merchantOrderId}/status.
// Returns the canonical state plus the primary transaction id (if any).
func (c *PhonePeV2Client) FetchOrderStatus(ctx context.Context, merchantOrderID string) (*PhonePeStatus, error) {
	token, err := c.fetchToken(ctx)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/checkout/v2/order/%s/status",
		strings.TrimRight(c.cfg.BaseURL, "/"), merchantOrderID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("phonepe: status build req: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "O-Bearer "+token)

	resp, err := c.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("phonepe: status http: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("phonepe: status http %d: %s", resp.StatusCode, string(body))
	}
	var out phonepeStatusResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("phonepe: status parse: %w", err)
	}
	res := &PhonePeStatus{State: strings.ToUpper(strings.TrimSpace(out.State)), Amount: out.Amount}
	if len(out.PaymentDetails) > 0 {
		res.PrimaryTransaction = out.PaymentDetails[0].TransactionID
	}
	return res, nil
}
