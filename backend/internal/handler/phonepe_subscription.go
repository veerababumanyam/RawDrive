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
// OAuth flow:    POST {authBase}/v1/oauth/token
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
//
// Asymmetric base URLs (PhonePe quirk, learned the hard way in prod 2026-05-19):
//   Sandbox / UAT collapses both endpoints under a single base:
//     https://api-preprod.phonepe.com/apis/pg-sandbox
//   Production splits them:
//     auth: https://api.phonepe.com/apis/identity-manager
//     pay:  https://api.phonepe.com/apis/pg
//   Using a single BaseURL = .../apis/pg in prod produces a 400
//   "Api Mapping Not Found" on the token call because no
//   /apis/pg/v1/oauth/token mapping exists at PhonePe's gateway.
//   AuthBaseURL (PHONEPE_AUTH_BASE_URL env var) overrides the host
//   used for the OAuth token call. When empty it falls back to
//   BaseURL — preserves sandbox + dev-environment behavior.

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
	BaseURL       string // pay+status host:
	//                       https://api.phonepe.com/apis/pg (prod)
	//                       https://api-preprod.phonepe.com/apis/pg-sandbox (test)
	// AuthBaseURL overrides the OAuth-token host. Production splits
	// auth onto identity-manager; sandbox shares BaseURL. Leave empty
	// in sandbox/dev to reuse BaseURL. In prod set to:
	//   https://api.phonepe.com/apis/identity-manager
	AuthBaseURL string
	HTTPClient  *http.Client
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
	authBase := c.cfg.AuthBaseURL
	if authBase == "" {
		authBase = c.cfg.BaseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(authBase, "/")+"/v1/oauth/token", form)
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
	Type         string              `json:"type"`
	Message      string              `json:"message,omitempty"`
	MerchantURLs phonepeMerchantURLs `json:"merchantUrls"`
}

// phonepeMetaInfo — user-defined fields PhonePe surfaces back in
// webhooks + status responses. Per the official Python SDK example
// (StandardCheckoutPayRequest.build_request with meta_info=MetaInfo(...)),
// providing this is expected for the checkout UI to render functional
// payment instruments. Without it the merchant's checkout page can
// fall through to a degraded "placeholder QR" render.
type phonepeMetaInfo struct {
	UDF1 string `json:"udf1,omitempty"`
	UDF2 string `json:"udf2,omitempty"`
	UDF3 string `json:"udf3,omitempty"`
}

// phonepePrefillUserLoginDetails seeds the user's mobile number on
// PhonePe's checkout page. The Python SDK's PrefillUserLoginDetails
// model always includes this field. When the merchant config requires
// a user identity for UPI Collect to render, the absence of this field
// breaks the QR widget (verified 2026-05-19 — checkout page rendered
// placeholder QR with paymentDetails:[] across multiple orders).
type phonepePrefillUserLoginDetails struct {
	PhoneNumber string `json:"phoneNumber"`
}

type phonepePayRequest struct {
	MerchantOrderID         string                          `json:"merchantOrderId"`
	Amount                  int64                           `json:"amount"`      // paise
	ExpireAfter             int                             `json:"expireAfter"` // seconds; SDK default 3600
	MetaInfo                *phonepeMetaInfo                `json:"metaInfo,omitempty"`
	PaymentFlow             phonepePaymentFlow              `json:"paymentFlow"`
	PrefillUserLoginDetails *phonepePrefillUserLoginDetails `json:"prefillUserLoginDetails,omitempty"`
	DisablePaymentRetry     bool                            `json:"disablePaymentRetry,omitempty"`
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

// CreateOrderInput is the input bundle for /checkout/v2/pay. Mirrors
// the field set the official PhonePe Python SDK's
// StandardCheckoutPayRequest.build_request() accepts — keeping our
// wire format matched to what PhonePe expects from a "standard"
// SDK-shaped request, which is what the merchant config is tested
// against. UDF1/UDF2/PhoneNumber are optional from the caller's
// perspective but are always serialized into the request body
// (empty-string for PhoneNumber when unknown — required-present per
// the SDK shape).
type CreateOrderInput struct {
	MerchantOrderID string
	AmountPaise     int64
	RedirectURL     string
	Message         string
	WorkspaceID     string // surfaces as udf1
	ToTier          string // surfaces as udf2
	PhoneNumber     string // empty string is acceptable; PhonePe asks user on the page
}

// CreateOrder calls /checkout/v2/pay and returns the redirect URL.
// merchantOrderID must be unique per workspace+order and is the key we
// use to look up our subscription_upgrade_orders row on callback.
func (c *PhonePeV2Client) CreateOrder(ctx context.Context, in CreateOrderInput) (*PhonePeOrderResult, error) {
	token, err := c.fetchToken(ctx)
	if err != nil {
		return nil, err
	}
	message := in.Message
	if message == "" {
		message = "RawDrive plan upgrade"
	}
	reqBody := phonepePayRequest{
		MerchantOrderID: in.MerchantOrderID,
		Amount:          in.AmountPaise,
		// 1 hour — matches the PhonePe Python SDK's default
		// expire_after=3600. Shorter windows (we used 1200 previously)
		// can correlate with degraded checkout-UI renders on some
		// merchant configs; the SDK ships with 3600 for a reason.
		ExpireAfter: 3600,
		MetaInfo: &phonepeMetaInfo{
			UDF1: in.WorkspaceID,
			UDF2: in.ToTier,
		},
		PaymentFlow: phonepePaymentFlow{
			Type:    "PG_CHECKOUT",
			Message: message,
			MerchantURLs: phonepeMerchantURLs{
				RedirectURL: in.RedirectURL,
			},
		},
		// Always include — the Python SDK does. Empty phoneNumber is
		// acceptable; PhonePe prompts the user on their page when
		// blank. The presence of the field itself is what matters.
		PrefillUserLoginDetails: &phonepePrefillUserLoginDetails{
			PhoneNumber: in.PhoneNumber,
		},
		DisablePaymentRetry: true,
	}
	payload, _ := json.Marshal(reqBody)
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
		MerchantOrderID: in.MerchantOrderID,
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
