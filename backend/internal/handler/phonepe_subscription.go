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
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	phonepemodels "github.com/PhonePe/phonepe-pg-sdk-go/common/models"
	phonepetypes "github.com/PhonePe/phonepe-pg-sdk-go/common/types"
	phoneperequest "github.com/PhonePe/phonepe-pg-sdk-go/payments/v2/models/request"
	"github.com/PhonePe/phonepe-pg-sdk-go/payments/v2/standardcheckout"
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
// The official SDK owns OAuth token refresh, request headers, response
// parsing, and callback validation semantics; this wrapper keeps RawDrive's
// env/platform_settings resolution isolated from the rest of the handler.
type PhonePeV2Client struct {
	cfg      PhonePeV2Config
	checkout *standardcheckout.StandardCheckoutClient
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
	clientVersion, err := strconv.Atoi(strings.TrimSpace(cfg.ClientVersion))
	if err != nil || clientVersion <= 0 {
		return nil
	}
	checkout, err := standardcheckout.GetInstance(
		strings.TrimSpace(cfg.ClientID),
		strings.TrimSpace(cfg.ClientSecret),
		clientVersion,
		phonePeSDKEnv(cfg),
		false,
	)
	if err != nil {
		return nil
	}
	if cfg.HTTPClient != nil {
		checkout.HttpClient = cfg.HTTPClient
		if checkout.TokenService != nil {
			checkout.TokenService.HttpClient = cfg.HTTPClient
		}
	}
	return &PhonePeV2Client{cfg: cfg, checkout: checkout}
}

func phonePeSDKEnv(cfg PhonePeV2Config) phonepetypes.Env {
	pgBase := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	authBase := strings.TrimRight(strings.TrimSpace(cfg.AuthBaseURL), "/")
	if authBase == "" {
		authBase = pgBase
	}
	eventsBase := "http://localhost"
	return phonepetypes.Env{
		PgHostURL:     pgBase,
		OAuthHostURL:  authBase,
		EventsHostURL: eventsBase,
	}
}

// ── Create Order ────────────────────────────────────────────────────────────

// PhonePeOrderResult is what the handler returns to the frontend so it
// can window.location.assign() to PhonePe.
type PhonePeOrderResult struct {
	MerchantOrderID string `json:"merchant_order_id"` // our id (mirrored back via redirect)
	PhonePeOrderID  string `json:"phonepe_order_id"`  // PhonePe's order id
	RedirectURL     string `json:"redirect_url"`      // hosted checkout url
	ExpireAt        int64  `json:"expire_at"`         // epoch seconds
}

// CreateOrderInput is the input bundle for PhonePe Standard Checkout v2.
// UDF1/UDF2 are included when present so callbacks/status responses carry
// useful routing context. PhoneNumber is optional and omitted when unknown,
// matching the official SDK's pointer field behavior.
type CreateOrderInput struct {
	MerchantOrderID string
	AmountPaise     int64
	RedirectURL     string
	Message         string
	WorkspaceID     string // surfaces as udf1
	ToTier          string // surfaces as udf2
	PhoneNumber     string
}

// CreateOrder calls /checkout/v2/pay and returns the redirect URL.
// merchantOrderID must be unique per workspace+order and is the key we
// use to look up our subscription_upgrade_orders row on callback.
func (c *PhonePeV2Client) CreateOrder(ctx context.Context, in CreateOrderInput) (*PhonePeOrderResult, error) {
	if c == nil || c.checkout == nil {
		return nil, fmt.Errorf("phonepe: checkout client not configured")
	}
	message := in.Message
	if message == "" {
		message = "RawDrive plan upgrade"
	}
	expireAfter := int64(3600)
	redirectURL := strings.TrimSpace(in.RedirectURL)
	metaInfo := &phonepemodels.MetaInfo{
		Udf1: in.WorkspaceID,
		Udf2: in.ToTier,
	}
	var prefill *phoneperequest.PrefillUserLoginDetails
	if strings.TrimSpace(in.PhoneNumber) != "" {
		prefill = phoneperequest.NewPrefillUserLoginDetails(strings.TrimSpace(in.PhoneNumber))
	}
	payRequest := phoneperequest.NewStandardCheckoutPayRequest(
		in.MerchantOrderID,
		in.AmountPaise,
		&redirectURL,
		metaInfo,
		&message,
		&expireAfter,
		nil,
		nil,
		prefill,
	)
	out, err := c.checkout.Pay(ctx, payRequest)
	if err != nil {
		return nil, fmt.Errorf("phonepe: pay: %w", err)
	}
	if out.RedirectURL == "" {
		return nil, fmt.Errorf("phonepe: pay empty redirect: state=%q", out.State)
	}
	return &PhonePeOrderResult{
		MerchantOrderID: in.MerchantOrderID,
		PhonePeOrderID:  out.OrderID,
		RedirectURL:     out.RedirectURL,
		ExpireAt:        out.ExpireAt,
	}, nil
}

// ── Status ──────────────────────────────────────────────────────────────────

// PhonePeStatus is the normalised view of an order's payment state.
type PhonePeStatus struct {
	State                           string // COMPLETED | FAILED | PENDING (PhonePe's canonical values)
	Amount                          int64
	ErrorCode                       string
	DetailedErrorCode               string
	PrimaryTransaction              string // first paymentDetails[].transactionId — what we persist as provider_payment_id
	PrimaryTransactionState         string
	PrimaryTransactionErrorCode     string
	PrimaryTransactionDetailedError string
}

// FetchOrderStatus calls /checkout/v2/order/{merchantOrderId}/status.
// Returns the canonical state plus the primary transaction id (if any).
func (c *PhonePeV2Client) FetchOrderStatus(ctx context.Context, merchantOrderID string) (*PhonePeStatus, error) {
	if c == nil || c.checkout == nil {
		return nil, fmt.Errorf("phonepe: checkout client not configured")
	}
	out, err := c.checkout.GetOrderStatus(ctx, merchantOrderID, true)
	if err != nil {
		return nil, fmt.Errorf("phonepe: status: %w", err)
	}
	res := &PhonePeStatus{
		State:             strings.ToUpper(strings.TrimSpace(out.State)),
		Amount:            out.Amount,
		ErrorCode:         strings.TrimSpace(out.ErrorCode),
		DetailedErrorCode: strings.TrimSpace(out.DetailedErrorCode),
	}
	if len(out.PaymentDetails) > 0 {
		res.PrimaryTransaction = strings.TrimSpace(out.PaymentDetails[0].TransactionID)
		res.PrimaryTransactionState = strings.ToUpper(strings.TrimSpace(out.PaymentDetails[0].State))
		res.PrimaryTransactionErrorCode = strings.TrimSpace(out.PaymentDetails[0].ErrorCode)
		res.PrimaryTransactionDetailedError = strings.TrimSpace(out.PaymentDetails[0].DetailedErrorCode)
		if res.ErrorCode == "" {
			res.ErrorCode = res.PrimaryTransactionErrorCode
		}
		if res.DetailedErrorCode == "" {
			res.DetailedErrorCode = res.PrimaryTransactionDetailedError
		}
	}
	return res, nil
}
