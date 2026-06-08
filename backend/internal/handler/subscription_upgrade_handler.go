package handler

// POST /api/v1/workspace/subscription/upgrade
//   Creates a Razorpay order for the requested plan tier and returns order
//   details so the frontend can open the Razorpay Checkout SDK modal.
//
// POST /api/v1/webhooks/razorpay/subscription  (no-auth, signature-verified)
//   Handles payment.captured events from Razorpay; upgrades workspaces.plan_tier
//   and inserts a subscriptions row on success.

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// validTierOrder defines the valid promotion path; a workspace can only move
// to a different paid tier (not free).
func validUpgradeTier(tier string) bool { return service.IsSelfServePaidPlanTier(tier) }

// RazorpayUpgradeConfig holds the credentials for the subscription upgrade flow.
// Populated from env vars: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
type RazorpayUpgradeConfig struct {
	KeyID         string
	KeySecret     string
	WebhookSecret string
	BaseURL       string // default: https://api.razorpay.com
}

type paymentSettingsReader interface {
	Get(ctx context.Context, category, key string) (string, bool, error)
}

// SubscriptionUpgradeHandler creates orders for plan-tier upgrades and
// processes the resulting payment confirmations. Supports two providers
// in parallel — Razorpay (modal-based Checkout SDK) and PhonePe v2
// Standard Checkout (redirect-based hosted page). The provider is
// chosen per-order via the request body; either can be missing creds
// and the other will still serve as long as the user picks the
// configured one.
type SubscriptionUpgradeHandler struct {
	db                     *pgxpool.Pool
	rzp                    RazorpayUpgradeConfig
	phonepe                *PhonePeV2Client // nil when PHONEPE_* env vars are unset
	publicBaseURL          string           // for building the PhonePe redirect-back URL
	phonepeWebhookUsername string
	phonepeWebhookPassword string
	paymentSettings        paymentSettingsReader
	storageAccounting      *service.StorageAccounting
	planCatalog            *service.PlanCatalogService
}

// NewSubscriptionUpgradeHandler always returns a handler. When credentials are
// absent the handler is still registered but responds with 503 so callers get
// a clear error instead of a 404.
func NewSubscriptionUpgradeHandler(db *pgxpool.Pool, cfg RazorpayUpgradeConfig) *SubscriptionUpgradeHandler {
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.razorpay.com"
	}
	return &SubscriptionUpgradeHandler{db: db, rzp: cfg}
}

// NewSubscriptionUpgradeHandlerFromEnv reads RAZORPAY_KEY_ID / _KEY_SECRET /
// _WEBHOOK_SECRET from the environment plus the PhonePe v2 OAuth creds
// (PHONEPE_CLIENT_ID / _SECRET / _VERSION / _BASE_URL). Always returns a
// non-nil handler; the handler itself returns 503 when the requested
// provider's credentials are missing.
func NewSubscriptionUpgradeHandlerFromEnv(db *pgxpool.Pool) *SubscriptionUpgradeHandler {
	h := NewSubscriptionUpgradeHandler(db, RazorpayUpgradeConfig{
		KeyID:         os.Getenv("RAZORPAY_KEY_ID"),
		KeySecret:     os.Getenv("RAZORPAY_KEY_SECRET"),
		WebhookSecret: os.Getenv("RAZORPAY_WEBHOOK_SECRET"),
	})
	// PhonePe v2 — env var resolution mirrors the convention the user
	// established in .env.backend (PHONEPE_CLIENTID/SECRET/VERSION) but
	// also accepts the underscored CLIENT_ID form some PhonePe docs
	// use, so a fresh deploy reading either spelling works.
	clientID := firstNonEmptyEnv("PHONEPE_CLIENT_ID", "PHONEPE_CLIENTID")
	clientSecret := firstNonEmptyEnv("PHONEPE_CLIENT_SECRET", "PHONEPE_SECRET")
	clientVersion := firstNonEmptyEnv("PHONEPE_CLIENT_VERSION", "PHONEPE_VERSION")
	baseURL := firstNonEmptyEnv("PHONEPE_V2_BASE_URL", "PHONEPE_BASE_URL")
	if baseURL == "" {
		baseURL = defaultPhonePeV2BaseURL()
	}
	// PhonePe production splits auth onto a separate host
	// (api.phonepe.com/apis/identity-manager) while pay+status stay on
	// api.phonepe.com/apis/pg. Sandbox shares one base. Empty here =
	// fall back to BaseURL inside the client (sandbox behavior).
	// Discovered live 2026-05-19 when prod returned 400
	// "Api Mapping Not Found" on the /v1/oauth/token call.
	authBaseURL := firstNonEmptyEnv("PHONEPE_V2_AUTH_BASE_URL", "PHONEPE_AUTH_BASE_URL")
	if authBaseURL == "" {
		authBaseURL = defaultPhonePeV2AuthBaseURL(baseURL)
	}
	h.phonepe = NewPhonePeV2Client(PhonePeV2Config{
		ClientID:      clientID,
		ClientSecret:  clientSecret,
		ClientVersion: clientVersion,
		BaseURL:       baseURL,
		AuthBaseURL:   authBaseURL,
	})
	h.publicBaseURL = firstNonEmptyEnv("PUBLIC_BASE_URL", "FRONTEND_URL")
	h.phonepeWebhookUsername = firstNonEmptyEnv("PHONEPE_WEBHOOK_USERNAME")
	h.phonepeWebhookPassword = firstNonEmptyEnv("PHONEPE_WEBHOOK_PASSWORD")
	return h
}

// NewSubscriptionUpgradeHandlerFromSettings reads payment configuration from
// platform_settings first, then environment variables. Missing credentials
// leave the relevant provider disabled; the request handler returns 503 for
// that provider instead of substituting fake defaults.
func NewSubscriptionUpgradeHandlerFromSettings(ctx context.Context, db *pgxpool.Pool, settings paymentSettingsReader) *SubscriptionUpgradeHandler {
	h := NewSubscriptionUpgradeHandler(db, RazorpayUpgradeConfig{})
	h.paymentSettings = settings
	cfg := h.currentPaymentConfig(ctx)
	h.rzp = cfg.rzp
	h.phonepe = cfg.phonepe
	h.publicBaseURL = cfg.publicBaseURL
	h.phonepeWebhookUsername = cfg.phonepeWebhookUsername
	h.phonepeWebhookPassword = cfg.phonepeWebhookPassword
	return h
}

func (h *SubscriptionUpgradeHandler) WithStorageAccounting(storageAccounting *service.StorageAccounting) *SubscriptionUpgradeHandler {
	h.storageAccounting = storageAccounting
	return h
}

func (h *SubscriptionUpgradeHandler) WithPlanCatalog(planCatalog *service.PlanCatalogService) *SubscriptionUpgradeHandler {
	h.planCatalog = planCatalog
	return h
}

func firstNonEmptyEnv(keys ...string) string {
	for _, k := range keys {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func defaultPhonePeV2BaseURL() string {
	return "https://api.phonepe.com/apis/pg"
}

func defaultPhonePeV2AuthBaseURL(baseURL string) string {
	if strings.Contains(strings.TrimRight(baseURL, "/"), "api.phonepe.com/apis/pg") {
		return "https://api.phonepe.com/apis/identity-manager"
	}
	return ""
}

type subscriptionPaymentConfig struct {
	rzp                    RazorpayUpgradeConfig
	phonepe                *PhonePeV2Client
	publicBaseURL          string
	phonepeWebhookUsername string
	phonepeWebhookPassword string
}

func (h *SubscriptionUpgradeHandler) currentPaymentConfig(ctx context.Context) subscriptionPaymentConfig {
	if h.paymentSettings == nil {
		return subscriptionPaymentConfig{
			rzp:                    h.rzp,
			phonepe:                h.phonepe,
			publicBaseURL:          h.publicBaseURL,
			phonepeWebhookUsername: h.phonepeWebhookUsername,
			phonepeWebhookPassword: h.phonepeWebhookPassword,
		}
	}

	read := func(key string, envNames ...string) string {
		if h.paymentSettings != nil {
			if value, ok, err := h.paymentSettings.Get(ctx, "payments", key); err != nil {
				log.Printf("payments settings: failed to read %s: %v", key, err)
			} else if ok && strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value)
			}
		}
		return firstNonEmptyEnv(envNames...)
	}

	rzp := RazorpayUpgradeConfig{
		KeyID:         read("razorpay_key_id", "RAZORPAY_KEY_ID"),
		KeySecret:     read("razorpay_key_secret", "RAZORPAY_KEY_SECRET"),
		WebhookSecret: read("razorpay_webhook_secret", "RAZORPAY_WEBHOOK_SECRET"),
		BaseURL:       read("razorpay_base_url", "RAZORPAY_BASE_URL"),
	}
	if rzp.BaseURL == "" {
		rzp.BaseURL = "https://api.razorpay.com"
	}

	baseURL := read("phonepe_v2_base_url", "PHONEPE_V2_BASE_URL", "PHONEPE_BASE_URL")
	if baseURL == "" {
		baseURL = defaultPhonePeV2BaseURL()
	}
	authBaseURL := firstNonEmpty(
		read("phonepe_v2_auth_base_url", "PHONEPE_V2_AUTH_BASE_URL"),
		read("phonepe_auth_base_url", "PHONEPE_AUTH_BASE_URL"),
	)
	if authBaseURL == "" {
		authBaseURL = defaultPhonePeV2AuthBaseURL(baseURL)
	}
	phonepe := NewPhonePeV2Client(PhonePeV2Config{
		ClientID:      firstNonEmpty(read("phonepe_client_id", "PHONEPE_CLIENT_ID"), read("phonepe_clientid", "PHONEPE_CLIENTID")),
		ClientSecret:  firstNonEmpty(read("phonepe_client_secret", "PHONEPE_CLIENT_SECRET"), read("phonepe_secret", "PHONEPE_SECRET")),
		ClientVersion: firstNonEmpty(read("phonepe_client_version", "PHONEPE_CLIENT_VERSION"), read("phonepe_version", "PHONEPE_VERSION")),
		BaseURL:       baseURL,
		AuthBaseURL:   authBaseURL,
	})

	return subscriptionPaymentConfig{
		rzp:     rzp,
		phonepe: phonepe,
		publicBaseURL: firstNonEmpty(
			read("public_base_url", "PUBLIC_BASE_URL"),
			read("frontend_url", "FRONTEND_URL"),
			read("callback_base_url", "PAYMENT_CALLBACK_BASE_URL"),
		),
		phonepeWebhookUsername: read("phonepe_webhook_username", "PHONEPE_WEBHOOK_USERNAME"),
		phonepeWebhookPassword: read("phonepe_webhook_password", "PHONEPE_WEBHOOK_PASSWORD"),
	}
}

func (cfg subscriptionPaymentConfig) razorpayConfigured() bool {
	return cfg.rzp.KeyID != "" && cfg.rzp.KeySecret != "" && cfg.rzp.WebhookSecret != ""
}

func (cfg subscriptionPaymentConfig) phonepeConfigured() bool {
	return cfg.phonepe != nil &&
		strings.TrimSpace(cfg.publicBaseURL) != ""
}

func (cfg subscriptionPaymentConfig) phonepeWebhookConfigured() bool {
	return strings.TrimSpace(cfg.phonepeWebhookUsername) != "" &&
		strings.TrimSpace(cfg.phonepeWebhookPassword) != ""
}

func isStrictUpgrade(fromTier, toTier string) bool {
	fromRank, fromKnown := service.PlanTierRank(strings.TrimSpace(fromTier))
	toRank, toKnown := service.PlanTierRank(strings.TrimSpace(toTier))
	return fromKnown && toKnown && toRank > fromRank
}

func (h *SubscriptionUpgradeHandler) validUpgradeTier(ctx context.Context, tier string) (bool, error) {
	normalizedTier := service.NormalizePlanTierSlug(tier)
	if normalizedTier == "pay_per_event" || normalizedTier == "elite_studio" {
		return false, nil
	}
	if h.planCatalog == nil {
		return validUpgradeTier(normalizedTier), nil
	}
	plan, ok, err := h.planCatalog.Get(ctx, normalizedTier)
	if err != nil {
		return false, err
	}
	return ok && plan.Paid && plan.Active && plan.SelfServe && plan.Tier != "pay_per_event", nil
}

func (h *SubscriptionUpgradeHandler) planPricePaise(ctx context.Context, tier, billingInterval string) (int64, bool, error) {
	if h.planCatalog == nil {
		amount, ok := service.PlanPricePaise(tier, billingInterval)
		return amount, ok, nil
	}
	return h.planCatalog.PricePaise(ctx, tier, billingInterval)
}

func (h *SubscriptionUpgradeHandler) isStrictUpgrade(ctx context.Context, fromTier, toTier string) (bool, error) {
	if h.planCatalog == nil {
		return isStrictUpgrade(fromTier, toTier), nil
	}
	fromRank, fromKnown, err := h.planCatalog.TierRank(ctx, strings.TrimSpace(fromTier))
	if err != nil {
		return false, err
	}
	toRank, toKnown, err := h.planCatalog.TierRank(ctx, strings.TrimSpace(toTier))
	if err != nil {
		return false, err
	}
	return fromKnown && toKnown && toRank > fromRank, nil
}

func (h *SubscriptionUpgradeHandler) planQuotaBytes(ctx context.Context, tier string) int64 {
	if h.planCatalog == nil {
		return service.PlanDefaultQuotaBytes(tier)
	}
	quota, err := h.planCatalog.QuotaBytes(ctx, tier)
	if err != nil {
		log.Printf("subscription upgrade: plan quota lookup failed for %q: %v", tier, err)
		return service.PlanDefaultQuotaBytes(tier)
	}
	return quota
}

func (h *SubscriptionUpgradeHandler) subscriptionOrderSnapshot(ctx context.Context, tier, billingInterval string, amountPaise int64, orderType string) (*uuid.UUID, []byte, error) {
	pricingCatalog := service.NewPricingCatalogService(h.db)
	versionID, plan, ok, err := pricingCatalog.CurrentPlanVersion(ctx, tier, time.Now().UTC())
	if err != nil {
		return nil, nil, err
	}
	if !ok {
		return nil, nil, service.ErrPlanNotFound
	}
	snapshot, err := json.Marshal(map[string]any{
		"snapshot_schema": "subscription_checkout_snapshot.v1",
		"source":          "subscription_checkout",
		"order_type":      orderType,
		"billing": map[string]any{
			"amount_paise":     amountPaise,
			"billing_interval": billingInterval,
			"currency":         plan.Currency,
		},
		"plan": map[string]any{
			"version_id":          versionID.String(),
			"tier":                plan.Tier,
			"name":                plan.Name,
			"description":         plan.Description,
			"currency":            plan.Currency,
			"monthly_price_paise": plan.MonthlyPricePaise,
			"annual_price_paise":  plan.AnnualPricePaise,
			"quota_bytes":         plan.QuotaBytes,
			"gallery_limit":       plan.GalleryLimit,
			"client_limit":        plan.ClientLimit,
			"features":            plan.Features,
			"popular":             plan.Popular,
			"paid":                plan.Paid,
			"active":              plan.Active,
			"self_serve":          plan.SelfServe,
			"trial_days":          plan.TrialDays,
			"rank":                plan.Rank,
		},
	})
	if err != nil {
		return nil, nil, err
	}
	return &versionID, snapshot, nil
}

func (h *SubscriptionUpgradeHandler) configured() bool {
	return h.currentPaymentConfig(context.Background()).razorpayConfigured()
}

func (h *SubscriptionUpgradeHandler) phonepeConfigured() bool {
	return h.currentPaymentConfig(context.Background()).phonepeConfigured()
}

func (h *SubscriptionUpgradeHandler) phonepeWebhookConfigured() bool {
	return h.currentPaymentConfig(context.Background()).phonepeWebhookConfigured()
}

type paymentProviderAvailability struct {
	ID         string `json:"id"`
	Configured bool   `json:"configured"`
}

type paymentProvidersResponse struct {
	Providers       []paymentProviderAvailability `json:"providers"`
	DefaultProvider string                        `json:"default_provider,omitempty"`
}

func (h *SubscriptionUpgradeHandler) PaymentProviders(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	razorpayConfigured := cfg.razorpayConfigured()
	phonepeConfigured := cfg.phonepeConfigured()
	defaultProvider := ""
	switch {
	case razorpayConfigured:
		defaultProvider = "razorpay"
	case phonepeConfigured:
		defaultProvider = "phonepe"
	}
	writeJSON(w, http.StatusOK, paymentProvidersResponse{
		DefaultProvider: defaultProvider,
		Providers: []paymentProviderAvailability{
			{ID: "razorpay", Configured: razorpayConfigured},
			{ID: "phonepe", Configured: phonepeConfigured},
		},
	})
}

// ── Upgrade ─────────────────────────────────────────────────────────────────

type upgradeRequest struct {
	ToTier string `json:"to_tier"`
	// 2026-05-18: optional provider selector. Empty / "razorpay" routes
	// through the existing Razorpay path (default for backward compat —
	// older frontend builds that don't send Provider still work).
	// "phonepe" routes through PhonePe v2 Standard Checkout.
	Provider string `json:"provider,omitempty"`
	// BillingInterval selects the pricing tier. "annual" charges the annual
	// price and sets expires_at to +1 year; anything else defaults to monthly.
	BillingInterval string `json:"billing_interval,omitempty"`
}

type upgradeResponse struct {
	UpgradeOrderID string `json:"upgrade_order_id"`
	Provider       string `json:"provider"` // "razorpay" | "phonepe"
	// Razorpay-specific fields — present only when Provider="razorpay".
	RazorpayOrderID string `json:"razorpay_order_id,omitempty"`
	RazorpayKeyID   string `json:"razorpay_key_id,omitempty"`
	// PhonePe-specific fields — present only when Provider="phonepe".
	// The frontend redirects to RedirectURL via window.location.assign.
	RedirectURL    string `json:"redirect_url,omitempty"`
	PhonePeOrderID string `json:"phonepe_order_id,omitempty"`
	// Shared.
	AmountPaise int64  `json:"amount_paise"`
	Currency    string `json:"currency"`
}

func (h *SubscriptionUpgradeHandler) Upgrade(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	wsID := middleware.WorkspaceIDFromContext(r.Context())
	if wsID == "" || wsID == "pending-onboarding" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace required"})
		return
	}

	var body upgradeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	validTier, err := h.validUpgradeTier(r.Context(), body.ToTier)
	if err != nil {
		log.Printf("subscription upgrade: plan catalog tier lookup failed: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "plan catalog unavailable"})
		return
	}
	if !validTier {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid to_tier"})
		return
	}

	billingInterval := body.BillingInterval
	if billingInterval != "annual" {
		billingInterval = "monthly"
	}
	amountPaise, ok, err := h.planPricePaise(r.Context(), body.ToTier, billingInterval)
	if err != nil {
		log.Printf("subscription upgrade: plan price lookup failed: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "plan catalog unavailable"})
		return
	}
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no price for tier"})
		return
	}

	provider := strings.ToLower(strings.TrimSpace(body.Provider))
	if provider == "" {
		provider = "razorpay"
	}
	switch provider {
	case "razorpay":
		if !cfg.razorpayConfigured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "razorpay not configured"})
			return
		}
	case "phonepe":
		if !cfg.phonepeConfigured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "phonepe not configured"})
			return
		}
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid provider"})
		return
	}

	// Read current plan tier for from_tier.
	var fromTier string
	if err := h.db.QueryRow(r.Context(),
		`SELECT COALESCE(plan_tier, 'free') FROM workspaces WHERE id = $1`, wsID,
	).Scan(&fromTier); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not read workspace"})
		return
	}
	strictUpgrade, err := h.isStrictUpgrade(r.Context(), fromTier, body.ToTier)
	if err != nil {
		log.Printf("subscription upgrade: plan rank lookup failed: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "plan catalog unavailable"})
		return
	}
	orderType := "subscription_upgrade"
	if service.NormalizePlanTierSlug(fromTier) == service.NormalizePlanTierSlug(body.ToTier) {
		orderType = "subscription_renewal"
	} else if !strictUpgrade {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "target tier must be higher than current tier"})
		return
	}

	upgradeOrderID := uuid.New()
	userID := userIDFromSubscriptionCtx(r)
	planVersionID, catalogSnapshot, err := h.subscriptionOrderSnapshot(r.Context(), body.ToTier, billingInterval, amountPaise, orderType)
	if err != nil {
		log.Printf("subscription upgrade: catalog snapshot failed: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "plan catalog unavailable"})
		return
	}

	if provider == "phonepe" {
		if strings.TrimSpace(cfg.publicBaseURL) == "" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment callback base URL not configured"})
			return
		}
		// PhonePe expects a redirectUrl on its side; the user is
		// bounced there after paying so the frontend can fire /verify
		// with the merchantOrderId echoed in the URL. Tier/interval are
		// carried back only for UX so a failed or expired hosted checkout
		// can restart the same purchase without making the user rebuild
		// the selection from the plans grid.
		callbackQuery := url.Values{}
		callbackQuery.Set("provider", "phonepe")
		callbackQuery.Set("order_id", upgradeOrderID.String())
		callbackQuery.Set("tier", body.ToTier)
		callbackQuery.Set("interval", billingInterval)
		redirectURL := strings.TrimRight(cfg.publicBaseURL, "/") +
			"/settings/plans/payment-callback?" + callbackQuery.Encode()
		phResult, err := cfg.phonepe.CreateOrder(r.Context(), CreateOrderInput{
			MerchantOrderID: upgradeOrderID.String(),
			AmountPaise:     amountPaise,
			RedirectURL:     redirectURL,
			Message:         "RawDrive — upgrade to " + body.ToTier,
			WorkspaceID:     wsID,
			ToTier:          body.ToTier,
			// PhoneNumber left blank — not collected on upgrade form.
			// The official SDK omits prefillUserLoginDetails when the
			// value is unknown; PhonePe prompts on the hosted page.
		})
		if err != nil {
			log.Printf("phonepe.CreateOrder failed: %v", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "phonepe order create failed"})
			return
		}
		_, err = h.db.Exec(r.Context(), `
			INSERT INTO subscription_upgrade_orders
			    (id, workspace_id, from_tier, to_tier, amount_paise,
			     provider, provider_order_id, initiated_by, billing_interval,
			     plan_version_id, catalog_snapshot, order_type)
			VALUES ($1, $2, $3, $4, $5, 'phonepe', $6, $7, $8, $9, $10::jsonb, $11)`,
			upgradeOrderID, wsID, fromTier, body.ToTier, amountPaise,
			upgradeOrderID.String(), userID, billingInterval, planVersionID, catalogSnapshot, orderType,
		)
		if err != nil {
			log.Printf("subscription upgrade: persist phonepe order failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not persist upgrade order"})
			return
		}
		writeJSON(w, http.StatusCreated, upgradeResponse{
			UpgradeOrderID: upgradeOrderID.String(),
			Provider:       "phonepe",
			RedirectURL:    phResult.RedirectURL,
			PhonePeOrderID: phResult.PhonePeOrderID,
			AmountPaise:    amountPaise,
			Currency:       "INR",
		})
		return
	}

	// Razorpay path — unchanged from pre-2026-05-18 behaviour.
	rzpOrderID, err := h.createRazorpayOrder(r.Context(), cfg.rzp, amountPaise, upgradeOrderID.String())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment provider unavailable"})
		return
	}
	_, err = h.db.Exec(r.Context(), `
		INSERT INTO subscription_upgrade_orders
		    (id, workspace_id, from_tier, to_tier, amount_paise,
		     razorpay_order_id, provider, provider_order_id, initiated_by, billing_interval,
		     plan_version_id, catalog_snapshot, order_type)
		VALUES ($1, $2, $3, $4, $5, $6, 'razorpay', $6, $7, $8, $9, $10::jsonb, $11)`,
		upgradeOrderID, wsID, fromTier, body.ToTier, amountPaise, rzpOrderID, userID,
		billingInterval, planVersionID, catalogSnapshot, orderType,
	)
	if err != nil {
		log.Printf("subscription upgrade: persist razorpay order failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not persist upgrade order"})
		return
	}
	writeJSON(w, http.StatusCreated, upgradeResponse{
		UpgradeOrderID:  upgradeOrderID.String(),
		Provider:        "razorpay",
		RazorpayOrderID: rzpOrderID,
		RazorpayKeyID:   cfg.rzp.KeyID,
		AmountPaise:     amountPaise,
		Currency:        "INR",
	})
}

// ── Verify (interactive, post-Checkout) ─────────────────────────────────────
//
// Razorpay Checkout's `handler` callback returns three fields the client can
// POST back to verify the payment without waiting for the webhook:
//   - razorpay_payment_id
//   - razorpay_order_id
//   - razorpay_signature  (== hmac_sha256(order_id|payment_id, KEY_SECRET))
//
// This is the standard interactive-verification flow per Razorpay's docs
// (https://razorpay.com/docs/payments/server-integration/server-side-verification).
// We keep the webhook handler for idempotent server-to-server confirmation in
// production, but in localhost dev (Razorpay servers can't reach :8081) this
// endpoint is the only way the plan_tier ever updates. applyPayment is
// idempotent so a webhook arriving later is a safe no-op.
//
// Auth: mounted inside the JWT group, so the caller is the same user who
// initiated the upgrade. We do NOT trust the workspace_id from the body —
// applyPayment looks it up from subscription_upgrade_orders by razorpay_order_id,
// which we created server-side in Upgrade(). 2026-05-18.

type verifyPaymentRequest struct {
	// 2026-05-18: provider selector. Empty / "razorpay" keeps the old
	// HMAC-signature verification path; "phonepe" routes through the
	// status-query path (PhonePe v2 has no client-side signature — the
	// merchantOrderId echo in the redirect URL is the binding evidence
	// and we authoritatively confirm via Order Status API).
	Provider          string `json:"provider,omitempty"`
	RazorpayPaymentID string `json:"razorpay_payment_id,omitempty"`
	RazorpayOrderID   string `json:"razorpay_order_id,omitempty"`
	RazorpaySignature string `json:"razorpay_signature,omitempty"`
	// PhonePe path: only merchant_order_id is required; the redirect
	// from PhonePe puts it on the URL as ?order_id=… so the frontend
	// passes that through.
	MerchantOrderID string `json:"merchant_order_id,omitempty"`
}

type verifyPaymentResponse struct {
	Status            string `json:"status"`
	PlanTier          string `json:"plan_tier"`
	ProviderState     string `json:"provider_state,omitempty"`
	ProviderErrorCode string `json:"provider_error_code,omitempty"`
}

func (h *SubscriptionUpgradeHandler) Verify(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	wsID := middleware.WorkspaceIDFromContext(r.Context())
	if wsID == "" || wsID == "pending-onboarding" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace required"})
		return
	}

	var body verifyPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	provider := strings.ToLower(strings.TrimSpace(body.Provider))
	if provider == "" {
		// Back-compat: pre-2026-05-18 clients send the Razorpay triple
		// with no provider field, infer razorpay.
		provider = "razorpay"
	}

	if provider == "phonepe" {
		h.verifyPhonePe(w, r, wsID, body, cfg)
		return
	}

	if !cfg.razorpayConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "razorpay not configured"})
		return
	}
	if body.RazorpayOrderID == "" || body.RazorpayPaymentID == "" || body.RazorpaySignature == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing payment fields"})
		return
	}

	// Razorpay interactive signature spec — note this is DIFFERENT from the
	// webhook signature:
	//   webhook: HMAC-SHA256(rawBody, WEBHOOK_SECRET)
	//   checkout: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
	// Mixing them up silently rejects every payment with "invalid signature",
	// so the comment is here to keep future edits from drifting.
	expected := hmacSHA256Hex(body.RazorpayOrderID+"|"+body.RazorpayPaymentID, cfg.rzp.KeySecret)
	if !hmac.Equal([]byte(expected), []byte(body.RazorpaySignature)) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid signature"})
		return
	}

	// Confirm the order belongs to the caller's workspace before applying —
	// prevents a user with a JWT for workspace A from settling a Razorpay
	// order they generated against workspace B by replaying B's fields.
	var orderWsID uuid.UUID
	err := h.db.QueryRow(r.Context(),
		`SELECT workspace_id FROM subscription_upgrade_orders WHERE razorpay_order_id = $1`,
		body.RazorpayOrderID,
	).Scan(&orderWsID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "order not found"})
		return
	}
	if orderWsID.String() != wsID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "order does not belong to this workspace"})
		return
	}

	if err := h.applyPayment(r.Context(), body.RazorpayOrderID, body.RazorpayPaymentID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
		return
	}

	// Read back the now-applied plan_tier so the frontend can show it without
	// a separate GET round-trip. applyPayment is idempotent: if the webhook
	// already settled this order, the SELECT still returns the correct tier.
	var planTier string
	if err := h.db.QueryRow(r.Context(),
		`SELECT COALESCE(plan_tier, 'free') FROM workspaces WHERE id = $1`, wsID,
	).Scan(&planTier); err != nil {
		// Payment WAS applied (applyPayment succeeded above) but we couldn't
		// read it back. Don't surface as failure — the client can refetch.
		planTier = ""
	}

	writeJSON(w, http.StatusOK, verifyPaymentResponse{Status: "ok", PlanTier: planTier})
}

// hmacSHA256Hex computes hex(HMAC-SHA256(message, key)) — shared helper used
// by both the webhook (raw-body verification) and the interactive verify
// endpoint (Razorpay's order_id|payment_id verification).
func hmacSHA256Hex(message, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

// ── PhonePe Verify ───────────────────────────────────────────────────────────
//
// PhonePe's redirect-back URL carries no signature — it just echoes the
// merchantOrderId we created server-side. The authoritative source of
// payment state is the Order Status API. So /verify with provider=phonepe
// looks up our subscription_upgrade_orders row by merchant_order_id,
// confirms ownership (workspace match), calls PhonePe's status endpoint,
// and applies the upgrade iff state == "COMPLETED". The PhonePe-side
// webhook (not implemented here) would be the production fallback; in
// localhost dev this interactive path is the only thing that updates the
// plan_tier.

func (h *SubscriptionUpgradeHandler) verifyPhonePe(w http.ResponseWriter, r *http.Request, wsID string, body verifyPaymentRequest, cfg subscriptionPaymentConfig) {
	if !cfg.phonepeConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "phonepe not configured"})
		return
	}
	if body.MerchantOrderID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing merchant_order_id"})
		return
	}

	// Ownership check — prevent cross-workspace replay.
	var orderWsID uuid.UUID
	var orderProvider string
	var orderAmountPaise int64
	err := h.db.QueryRow(r.Context(),
		`SELECT workspace_id, provider, amount_paise FROM subscription_upgrade_orders WHERE id::text = $1`,
		body.MerchantOrderID,
	).Scan(&orderWsID, &orderProvider, &orderAmountPaise)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "order not found"})
		return
	}
	if orderWsID.String() != wsID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "order does not belong to this workspace"})
		return
	}
	if orderProvider != "phonepe" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "order was not initiated via phonepe"})
		return
	}

	status, err := cfg.phonepe.FetchOrderStatus(r.Context(), body.MerchantOrderID)
	if err != nil {
		log.Printf("phonepe.FetchOrderStatus failed for order %s: %v", body.MerchantOrderID, err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not query payment status"})
		return
	}
	switch status.State {
	case "COMPLETED":
		if status.Amount != orderAmountPaise {
			log.Printf("phonepe amount mismatch for order %s: provider=%d db=%d", body.MerchantOrderID, status.Amount, orderAmountPaise)
			writeJSON(w, http.StatusConflict, map[string]string{"error": "payment amount mismatch"})
			return
		}
		if status.PrimaryTransaction == "" {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "payment transaction missing"})
			return
		}
	case "PENDING":
		writeJSON(w, http.StatusAccepted, verifyPaymentResponse{
			Status:            "pending",
			PlanTier:          "",
			ProviderState:     status.State,
			ProviderErrorCode: firstNonEmpty(status.DetailedErrorCode, status.ErrorCode),
		})
		return
	default:
		// FAILED, EXPIRED, etc. — mark the row failed but don't change the plan.
		// The plan tier is intentionally left unchanged.
		log.Printf("phonepe order %s returned non-success state=%s error=%s", body.MerchantOrderID, status.State, firstNonEmpty(status.DetailedErrorCode, status.ErrorCode))
		markUpgradeOrderFailed(r.Context(), h.db, body.MerchantOrderID)
		writeJSON(w, http.StatusOK, verifyPaymentResponse{
			Status:            "failed",
			PlanTier:          "",
			ProviderState:     status.State,
			ProviderErrorCode: firstNonEmpty(status.DetailedErrorCode, status.ErrorCode),
		})
		return
	}

	if err := h.applyPhonePePayment(r.Context(), body.MerchantOrderID, status.PrimaryTransaction); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
		return
	}

	var planTier string
	if err := h.db.QueryRow(r.Context(),
		`SELECT COALESCE(plan_tier, 'free') FROM workspaces WHERE id = $1`, wsID,
	).Scan(&planTier); err != nil {
		planTier = ""
	}
	writeJSON(w, http.StatusOK, verifyPaymentResponse{Status: "ok", PlanTier: planTier})
}

// applyPhonePePayment is the PhonePe sibling of applyPayment. Same
// transactional semantics — flip the order row to paid, update
// workspaces.plan_tier, deactivate the previous active subscription,
// insert a new one. Idempotent on the (provider_order_id, status)
// composite, so a webhook arriving later is a safe no-op.
func (h *SubscriptionUpgradeHandler) applyPhonePePayment(ctx context.Context, merchantOrderID, transactionID string) error {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var wsID uuid.UUID
	var toTier string
	var amountPaise int64
	var billingIntervalPP string
	var upgradeOrderID uuid.UUID
	var planVersionID uuid.UUID
	var catalogSnapshot []byte
	var orderType string
	err = tx.QueryRow(ctx, `
		UPDATE subscription_upgrade_orders
		   SET status = 'paid', provider_payment_id = $1, updated_at = NOW()
		 WHERE id::text = $2 AND provider = 'phonepe' AND status IN ('pending', 'failed')
		RETURNING id, workspace_id, to_tier, amount_paise, COALESCE(billing_interval, 'monthly'),
		          COALESCE(plan_version_id, '00000000-0000-0000-0000-000000000000'::uuid),
		          COALESCE(catalog_snapshot, '{}'::jsonb),
		          COALESCE(order_type, 'subscription_upgrade')`,
		transactionID, merchantOrderID,
	).Scan(&upgradeOrderID, &wsID, &toTier, &amountPaise, &billingIntervalPP, &planVersionID, &catalogSnapshot, &orderType)
	if err != nil {
		// Already settled (idempotent) or no matching pending row.
		return tx.Commit(ctx)
	}

	now := time.Now().UTC()
	expiresAtPP, err := h.settlePaidSubscriptionOrder(ctx, tx, wsID, toTier, amountPaise, billingIntervalPP, orderType, now, planVersionID, catalogSnapshot)
	if err != nil {
		return err
	}
	if err := h.scheduleSubscriptionLifecycleJobs(ctx, tx, upgradeOrderID, wsID, billingIntervalPP, expiresAtPP); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	h.invalidateStorageAnalytics(wsID)
	return nil
}

func (h *SubscriptionUpgradeHandler) settlePaidSubscriptionOrder(ctx context.Context, tx pgx.Tx, wsID uuid.UUID, toTier string, amountPaise int64, billingInterval string, orderType string, now time.Time, planVersionID uuid.UUID, catalogSnapshot []byte) (time.Time, error) {
	expiresAt := addBillingInterval(now, billingInterval)
	if err := cancelPendingWorkspaceLifecycleJobs(ctx, tx, wsID); err != nil {
		return time.Time{}, fmt.Errorf("cancel stale lifecycle jobs: %w", err)
	}
	if orderType == "subscription_renewal" {
		err := tx.QueryRow(ctx, `
			UPDATE subscriptions
			   SET amount_paisa = $2,
			       expires_at = CASE
			           WHEN expires_at IS NOT NULL AND expires_at > $3
			           THEN CASE WHEN $4 = 'annual' THEN expires_at + INTERVAL '1 year' ELSE expires_at + INTERVAL '1 month' END
			           ELSE $5
			       END,
			       billing_interval = $4,
			       plan_version_id = NULLIF($6::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
			       catalog_snapshot = $7::jsonb,
			       updated_at = NOW()
			 WHERE workspace_id = $1 AND status = 'active'
			RETURNING expires_at`,
			wsID, amountPaise, now, billingInterval, expiresAt, planVersionID, catalogSnapshot,
		).Scan(&expiresAt)
		if errors.Is(err, pgx.ErrNoRows) {
			_, err = tx.Exec(ctx, `
				INSERT INTO subscriptions
				    (workspace_id, tier_slug, amount_paisa, status, started_at, expires_at,
				     billing_interval, plan_version_id, catalog_snapshot)
				VALUES ($1, $2, $3, 'active', $4, $5, $6,
				        NULLIF($7::uuid, '00000000-0000-0000-0000-000000000000'::uuid), $8::jsonb)`,
				wsID, toTier, amountPaise, now, expiresAt, billingInterval, planVersionID, catalogSnapshot,
			)
		}
		if err != nil {
			return time.Time{}, fmt.Errorf("renew subscription: %w", err)
		}
		return expiresAt, nil
	}

	if _, err := tx.Exec(ctx,
		`UPDATE workspaces SET plan_tier = $1 WHERE id = $2`, toTier, wsID,
	); err != nil {
		return time.Time{}, fmt.Errorf("update plan_tier: %w", err)
	}
	if err := markPayPerEventEntitlementsConverted(ctx, tx, wsID); err != nil {
		return time.Time{}, fmt.Errorf("mark pay-per-event entitlements converted: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, 0, 0, $2)
		 ON CONFLICT (workspace_id) DO UPDATE SET quota_bytes = $2`,
		wsID, h.planQuotaBytes(ctx, toTier),
	); err != nil {
		return time.Time{}, fmt.Errorf("update storage quota: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE subscriptions SET status = 'churned', cancelled_at = NOW()
		 WHERE workspace_id = $1 AND status = 'active'`, wsID,
	); err != nil {
		return time.Time{}, fmt.Errorf("deactivate old subscription: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO subscriptions
		    (workspace_id, tier_slug, amount_paisa, status, started_at, expires_at,
		     billing_interval, plan_version_id, catalog_snapshot)
		VALUES ($1, $2, $3, 'active', $4, $5, $6,
		        NULLIF($7::uuid, '00000000-0000-0000-0000-000000000000'::uuid), $8::jsonb)`,
		wsID, toTier, amountPaise, now, expiresAt, billingInterval, planVersionID, catalogSnapshot,
	); err != nil {
		return time.Time{}, fmt.Errorf("insert subscription: %w", err)
	}
	return expiresAt, nil
}

func addBillingInterval(from time.Time, billingInterval string) time.Time {
	if billingInterval == "annual" {
		return from.AddDate(1, 0, 0)
	}
	return from.AddDate(0, 1, 0)
}

func (h *SubscriptionUpgradeHandler) scheduleSubscriptionLifecycleJobs(ctx context.Context, tx pgx.Tx, orderID uuid.UUID, wsID uuid.UUID, billingInterval string, expiresAt time.Time) error {
	policyCode := "subscription_monthly_default"
	if billingInterval == "annual" {
		policyCode = "subscription_annual_default"
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
			policy_code, job_type, target_type, target_id,
			workspace_id, due_at, proof_snapshot, metadata
		) VALUES (
			$1, 'payment_success', 'billing_order', $2,
			$3, NOW(), jsonb_build_object('billing_order_id', $2::text),
			jsonb_build_object('source', 'subscription_payment_settlement')
		)
	`, policyCode, orderID, wsID); err != nil {
		return fmt.Errorf("schedule payment success lifecycle job: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
			policy_code, job_type, target_type, target_id,
			workspace_id, due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'renewal_reminder', 'workspace', $2, $3,
		       $4 - (days * INTERVAL '1 day'),
		       jsonb_build_object('workspace_id', $3::text, 'expires_at', $4::text, 'days_before', days),
		       jsonb_build_object('source', 'subscription_payment_settlement')
		  FROM billing_lifecycle_policies p
		  CROSS JOIN LATERAL unnest(p.renewal_reminder_days) AS days
		 WHERE p.code = $1
		   AND $4 - (days * INTERVAL '1 day') > NOW()
	`, policyCode, wsID, wsID, expiresAt); err != nil {
		return fmt.Errorf("schedule renewal reminders: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
			policy_code, job_type, target_type, target_id,
			workspace_id, due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'expiry_warning', 'workspace', $2, $3,
		       $4 - (days * INTERVAL '1 day'),
		       jsonb_build_object('workspace_id', $3::text, 'expires_at', $4::text, 'days_before', days),
		       jsonb_build_object('source', 'subscription_payment_settlement')
		  FROM billing_lifecycle_policies p
		  CROSS JOIN LATERAL unnest(p.expiry_warning_days) AS days
		 WHERE p.code = $1
		   AND $4 - (days * INTERVAL '1 day') > NOW()
	`, policyCode, wsID, wsID, expiresAt); err != nil {
		return fmt.Errorf("schedule expiry warnings: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
			policy_code, job_type, target_type, target_id,
			workspace_id, due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'deletion_warning', 'workspace', $2, $3,
		       ($4 + (p.account_delete_grace_days * INTERVAL '1 day')) - (days * INTERVAL '1 day'),
		       jsonb_build_object('workspace_id', $3::text, 'expires_at', $4::text, 'days_before_delete', days),
		       jsonb_build_object('source', 'subscription_payment_settlement')
		  FROM billing_lifecycle_policies p
		  CROSS JOIN LATERAL unnest(p.deletion_warning_days) AS days
		 WHERE p.code = $1
		   AND ($4 + (p.account_delete_grace_days * INTERVAL '1 day')) - (days * INTERVAL '1 day') > NOW()
	`, policyCode, wsID, wsID, expiresAt); err != nil {
		return fmt.Errorf("schedule deletion warnings: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
			policy_code, job_type, target_type, target_id,
			workspace_id, due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'gallery_delete', 'workspace', $2, $3,
		       $4 + (p.gallery_delete_grace_days * INTERVAL '1 day'),
		       jsonb_build_object('workspace_id', $3::text, 'expires_at', $4::text, 'gallery_delete_grace_days', p.gallery_delete_grace_days),
		       jsonb_build_object('source', 'subscription_payment_settlement')
		  FROM billing_lifecycle_policies p
		 WHERE p.code = $1
	`, policyCode, wsID, wsID, expiresAt); err != nil {
		return fmt.Errorf("schedule gallery delete job: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
			policy_code, job_type, target_type, target_id,
			workspace_id, due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'account_delete', 'workspace', $2, $3,
		       $4 + (p.account_delete_grace_days * INTERVAL '1 day'),
		       jsonb_build_object('workspace_id', $3::text, 'expires_at', $4::text, 'account_delete_grace_days', p.account_delete_grace_days),
		       jsonb_build_object('source', 'subscription_payment_settlement')
		  FROM billing_lifecycle_policies p
		 WHERE p.code = $1
	`, policyCode, wsID, wsID, expiresAt); err != nil {
		return fmt.Errorf("schedule account delete job: %w", err)
	}
	return nil
}

func (h *SubscriptionUpgradeHandler) invalidateStorageAnalytics(workspaceID uuid.UUID) {
	if h.storageAccounting != nil {
		h.storageAccounting.InvalidateAnalytics(workspaceID)
	}
}

// orderExecer is the minimal surface markUpgradeOrderFailed needs from the DB
// pool. *pgxpool.Pool satisfies it directly; tests substitute a fake. Keeping
// the dependency narrow lets the failure-marking path be unit-tested without a
// live Postgres connection.
type orderExecer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// markUpgradeOrderFailed flips a still-pending PhonePe upgrade order to
// 'failed' after PhonePe reports a terminal non-success state (FAILED, EXPIRED,
// …). It is intentionally side-effect-only on the order row: the workspace
// plan_tier is never touched here.
//
// F-067: the previous implementation discarded the Exec result with
// `_, _ = db.Exec(...)`, so a failed UPDATE — or one that matched no pending
// row — silently left the order stuck in 'pending', hiding the failure from any
// reconciliation job. We now surface both conditions on the logger:
//   - a non-nil Exec error is logged at ERROR level with the underlying cause;
//   - a zero-rows-affected result is logged as a no-op warning (the order was
//     already terminal, or the id did not match a pending row).
//
// The WHERE clause scopes the update to pending rows only so a row already
// settled as 'paid' by a racing webhook is never clobbered back to 'failed'.
// Errors are logged rather than returned because the caller has already decided
// to respond "failed" to the client regardless; the log line is the durable
// signal for out-of-band reconciliation.
func markUpgradeOrderFailed(ctx context.Context, db orderExecer, orderID string) {
	tag, err := db.Exec(ctx, `
		UPDATE subscription_upgrade_orders
		   SET status = 'failed', updated_at = NOW()
		 WHERE id::text = $1 AND status = 'pending'`,
		orderID,
	)
	if err != nil {
		log.Printf("failed to mark phonepe order %s failed: %v", orderID, err)
		return
	}
	if tag.RowsAffected() == 0 {
		log.Printf("mark phonepe order %s failed: no pending row matched (already terminal?)", orderID)
	}
}

// ── PhonePe Webhook ──────────────────────────────────────────────────────────

type phonePeSubscriptionCallback struct {
	Event   string                          `json:"event,omitempty"`
	Data    phonePeSubscriptionCallbackData `json:"data"`
	Payload phonePeSubscriptionCallbackData `json:"payload,omitempty"`
}

type phonePeSubscriptionCallbackData struct {
	MerchantOrderID string `json:"merchantOrderId"`
	State           string `json:"state"`
	Amount          int64  `json:"amount"`
	PaymentDetails  []struct {
		TransactionID string `json:"transactionId"`
	} `json:"paymentDetails"`
}

func (cb phonePeSubscriptionCallback) paymentData() phonePeSubscriptionCallbackData {
	if cb.Data.MerchantOrderID != "" || cb.Data.State != "" || cb.Data.Amount > 0 {
		return cb.Data
	}
	return cb.Payload
}

func (h *SubscriptionUpgradeHandler) PhonePeWebhook(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	if cfg.phonepe == nil || !cfg.phonepeWebhookConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "phonepe webhook not configured"})
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read body failed"})
		return
	}
	if !verifyPhonePeWebhookAuthorization(r.Header.Get("Authorization"), cfg.phonepeWebhookUsername, cfg.phonepeWebhookPassword) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid signature"})
		return
	}
	var cb phonePeSubscriptionCallback
	if err := json.Unmarshal(raw, &cb); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	data := cb.paymentData()
	merchantOrderID := strings.TrimSpace(data.MerchantOrderID)
	if merchantOrderID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing merchant_order_id"})
		return
	}

	state := strings.ToUpper(strings.TrimSpace(data.State))
	switch state {
	case "COMPLETED":
		status, err := cfg.phonepe.FetchOrderStatus(r.Context(), merchantOrderID)
		if err != nil {
			log.Printf("phonepe webhook: status fetch failed for order %s: %v", merchantOrderID, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not query payment status"})
			return
		}
		if status.State != "COMPLETED" {
			writeJSON(w, http.StatusAccepted, map[string]string{"status": "pending"})
			return
		}
		var orderAmountPaise int64
		var orderProvider string
		if err := h.db.QueryRow(r.Context(),
			`SELECT provider, amount_paise FROM subscription_upgrade_orders WHERE id::text = $1`,
			merchantOrderID,
		).Scan(&orderProvider, &orderAmountPaise); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "order not found"})
			return
		}
		if orderProvider != "phonepe" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "order was not initiated via phonepe"})
			return
		}
		if status.Amount != orderAmountPaise {
			log.Printf("phonepe webhook amount mismatch for order %s: provider=%d db=%d", merchantOrderID, status.Amount, orderAmountPaise)
			writeJSON(w, http.StatusConflict, map[string]string{"error": "payment amount mismatch"})
			return
		}
		if status.PrimaryTransaction == "" {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "payment transaction missing"})
			return
		}
		if err := h.applyPhonePePayment(r.Context(), merchantOrderID, status.PrimaryTransaction); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	case "PENDING", "":
		writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	default:
		markUpgradeOrderFailed(r.Context(), h.db, merchantOrderID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed"})
	}
}

func (h *SubscriptionUpgradeHandler) verifyPhonePeWebhookAuthorization(authorization string) bool {
	return verifyPhonePeWebhookAuthorization(authorization, h.phonepeWebhookUsername, h.phonepeWebhookPassword)
}

func verifyPhonePeWebhookAuthorization(authorization, username, password string) bool {
	auth := strings.TrimSpace(authorization)
	if strings.HasPrefix(strings.ToLower(auth), "sha256 ") {
		auth = strings.TrimSpace(auth[len("sha256 "):])
	}
	expected := phonePeCallbackHash(username, password)
	return hmac.Equal([]byte(expected), []byte(auth))
}

func phonePeCallbackHash(username, password string) string {
	sum := sha256.Sum256([]byte(username + ":" + password))
	return hex.EncodeToString(sum[:])
}

// ── Razorpay Webhook ────────────────────────────────────────────────────────

func (h *SubscriptionUpgradeHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	if !cfg.razorpayConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment gateway not configured"})
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read body failed"})
		return
	}

	// Verify HMAC-SHA256(rawBody, webhookSecret) == X-Razorpay-Signature.
	sig := r.Header.Get("X-Razorpay-Signature")
	if !verifyRazorpaySignature(raw, sig, cfg.rzp.WebhookSecret) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid signature"})
		return
	}

	var event struct {
		Event   string `json:"event"`
		Payload struct {
			Payment struct {
				Entity struct {
					ID      string            `json:"id"`
					OrderID string            `json:"order_id"`
					Notes   map[string]string `json:"notes"`
					Status  string            `json:"status"`
				} `json:"entity"`
			} `json:"payment"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(raw, &event); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unparseable"})
		return
	}

	if event.Event != "payment.captured" {
		// Acknowledge other events without action.
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}

	rzpOrderID := event.Payload.Payment.Entity.OrderID
	rzpPaymentID := event.Payload.Payment.Entity.ID

	if err := h.applyPayment(r.Context(), rzpOrderID, rzpPaymentID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// applyPayment upgrades the workspace plan tier when payment.captured fires.
func (h *SubscriptionUpgradeHandler) applyPayment(ctx context.Context, rzpOrderID, rzpPaymentID string) error {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var upgradeOrderID uuid.UUID
	var wsID uuid.UUID
	var toTier string
	var amountPaise int64
	var billingIntervalApply string
	var planVersionID uuid.UUID
	var catalogSnapshot []byte
	var orderType string
	err = tx.QueryRow(ctx, `
		UPDATE subscription_upgrade_orders
		   SET status = 'paid', razorpay_payment_id = $1, updated_at = NOW()
		 WHERE razorpay_order_id = $2 AND status = 'pending'
		RETURNING id, workspace_id, to_tier, amount_paise, COALESCE(billing_interval, 'monthly'),
		          COALESCE(plan_version_id, '00000000-0000-0000-0000-000000000000'::uuid),
		          COALESCE(catalog_snapshot, '{}'::jsonb),
		          COALESCE(order_type, 'subscription_upgrade')`,
		rzpPaymentID, rzpOrderID,
	).Scan(&upgradeOrderID, &wsID, &toTier, &amountPaise, &billingIntervalApply, &planVersionID, &catalogSnapshot, &orderType)
	if err != nil {
		// Already processed (idempotent) or unknown order — treat as OK.
		return tx.Commit(ctx)
	}

	now := time.Now().UTC()
	expiresAt, err := h.settlePaidSubscriptionOrder(ctx, tx, wsID, toTier, amountPaise, billingIntervalApply, orderType, now, planVersionID, catalogSnapshot)
	if err != nil {
		return err
	}
	if err := h.scheduleSubscriptionLifecycleJobs(ctx, tx, upgradeOrderID, wsID, billingIntervalApply, expiresAt); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	h.invalidateStorageAnalytics(wsID)
	return nil
}

// ── Razorpay helpers ─────────────────────────────────────────────────────────

type rzpOrderReq struct {
	Amount   int64             `json:"amount"`
	Currency string            `json:"currency"`
	Receipt  string            `json:"receipt"`
	Notes    map[string]string `json:"notes,omitempty"`
}

type rzpOrderResp struct {
	ID string `json:"id"`
}

func (h *SubscriptionUpgradeHandler) createRazorpayOrder(ctx context.Context, cfg RazorpayUpgradeConfig, amountPaise int64, receipt string) (string, error) {
	payload, _ := json.Marshal(rzpOrderReq{
		Amount:   amountPaise,
		Currency: "INR",
		Receipt:  receipt,
		Notes:    map[string]string{"source": "subscription_upgrade", "receipt": receipt},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(cfg.BaseURL, "/")+"/v1/orders", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(cfg.KeyID, cfg.KeySecret)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("razorpay %d: %s", resp.StatusCode, string(body))
	}
	var out rzpOrderResp
	if err := json.Unmarshal(body, &out); err != nil || out.ID == "" {
		return "", fmt.Errorf("razorpay: empty order id")
	}
	return out.ID, nil
}

func verifyRazorpaySignature(body []byte, sig, secret string) bool {
	expected := hmacSHA256Hex(string(body), secret)
	return hmac.Equal([]byte(expected), []byte(sig))
}

func userIDFromSubscriptionCtx(r *http.Request) *uuid.UUID {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		return nil
	}
	if sub, ok := claims["sub"].(string); ok {
		if id, err := uuid.Parse(sub); err == nil {
			return &id
		}
	}
	return nil
}
