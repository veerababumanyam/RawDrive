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
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/middleware"
)

// planQuotaBytes maps canonical tier slugs to storage quota in bytes.
// Keep in sync with service.PlanDefaultQuotaBytes and frontend/src/lib/tokens.ts.
var planQuotaBytes = map[string]int64{
	"free":         1 << 30,         // 1 GB
	"starter":      30 * (1 << 30),  // 30 GB
	"professional": 300 * (1 << 30), // 300 GB
	"business":     3 * (1 << 40),   // 3 TB
	"enterprise":   6 * (1 << 40),   // 6 TB
}

// planDefaultQuota returns the quota bytes for a tier, defaulting to 1 GB.
func planDefaultQuota(tier string) int64 {
	if q, ok := planQuotaBytes[tier]; ok {
		return q
	}
	return 1 << 30
}

// planPricePaise maps canonical tier slugs to monthly prices in paise (INR×100).
var planPricePaise = map[string]int64{
	"starter":      9900,   // ₹99
	"professional": 29900,  // ₹299
	"business":     299900, // ₹2,999
	"enterprise":   599900, // ₹5,999
}

// planAnnualPricePaise maps canonical tier slugs to annual prices in paise (INR×100).
// Keep in sync with pricingPlans[*].annualPrice in frontend/src/lib/tokens.ts.
var planAnnualPricePaise = map[string]int64{
	"starter":      99000,   // ₹990
	"professional": 299000,  // ₹2,990
	"business":     2999000, // ₹29,990
	"enterprise":   5999000, // ₹59,990
}

// validTierOrder defines the valid promotion path; a workspace can only move
// to a different paid tier (not free).
var validUpgradeTiers = map[string]bool{
	"starter": true, "professional": true, "business": true, "enterprise": true,
}

// RazorpayUpgradeConfig holds the credentials for the subscription upgrade flow.
// Populated from env vars: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
type RazorpayUpgradeConfig struct {
	KeyID         string
	KeySecret     string
	WebhookSecret string
	BaseURL       string // default: https://api.razorpay.com
}

// SubscriptionUpgradeHandler creates orders for plan-tier upgrades and
// processes the resulting payment confirmations. Supports two providers
// in parallel — Razorpay (modal-based Checkout SDK) and PhonePe v2
// Standard Checkout (redirect-based hosted page). The provider is
// chosen per-order via the request body; either can be missing creds
// and the other will still serve as long as the user picks the
// configured one.
type SubscriptionUpgradeHandler struct {
	db            *pgxpool.Pool
	rzp           RazorpayUpgradeConfig
	phonepe       *PhonePeV2Client // nil when PHONEPE_* env vars are unset
	publicBaseURL string           // for building the PhonePe redirect-back URL
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
	baseURL := firstNonEmptyEnv("PHONEPE_BASE_URL")
	if baseURL == "" {
		// Default to the sandbox host so local dev works against test
		// creds without needing an extra env var. Production deploys
		// MUST set PHONEPE_BASE_URL explicitly to the live host.
		baseURL = "https://api-preprod.phonepe.com/apis/pg-sandbox"
	}
	// PhonePe production splits auth onto a separate host
	// (api.phonepe.com/apis/identity-manager) while pay+status stay on
	// api.phonepe.com/apis/pg. Sandbox shares one base. Empty here =
	// fall back to BaseURL inside the client (sandbox behavior).
	// Discovered live 2026-05-19 when prod returned 400
	// "Api Mapping Not Found" on the /v1/oauth/token call.
	authBaseURL := firstNonEmptyEnv("PHONEPE_AUTH_BASE_URL")
	h.phonepe = NewPhonePeV2Client(PhonePeV2Config{
		ClientID:      clientID,
		ClientSecret:  clientSecret,
		ClientVersion: clientVersion,
		BaseURL:       baseURL,
		AuthBaseURL:   authBaseURL,
	})
	h.publicBaseURL = firstNonEmptyEnv("PUBLIC_BASE_URL", "FRONTEND_URL")
	if h.publicBaseURL == "" {
		h.publicBaseURL = "http://localhost:3001"
	}
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

func (h *SubscriptionUpgradeHandler) configured() bool {
	return h.rzp.KeyID != "" && h.rzp.KeySecret != "" && h.rzp.WebhookSecret != ""
}

func (h *SubscriptionUpgradeHandler) phonepeConfigured() bool {
	return h.phonepe != nil
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
	if !validUpgradeTiers[body.ToTier] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid to_tier"})
		return
	}

	billingInterval := body.BillingInterval
	if billingInterval != "annual" {
		billingInterval = "monthly"
	}
	var amountPaise int64
	var ok bool
	if billingInterval == "annual" {
		amountPaise, ok = planAnnualPricePaise[body.ToTier]
	} else {
		amountPaise, ok = planPricePaise[body.ToTier]
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
		if !h.configured() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "razorpay not configured"})
			return
		}
	case "phonepe":
		if !h.phonepeConfigured() {
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

	upgradeOrderID := uuid.New()
	userID := userIDFromSubscriptionCtx(r)

	if provider == "phonepe" {
		// PhonePe expects a redirectUrl on its side; the user is
		// bounced there after paying so the frontend can fire
		// /verify?provider=phonepe with the merchantOrderId echoed in
		// the URL.
		redirectURL := strings.TrimRight(h.publicBaseURL, "/") +
			"/settings/plans/payment-callback?provider=phonepe&order_id=" +
			upgradeOrderID.String()
		phResult, err := h.phonepe.CreateOrder(r.Context(), CreateOrderInput{
			MerchantOrderID: upgradeOrderID.String(),
			AmountPaise:     amountPaise,
			RedirectURL:     redirectURL,
			Message:         "RawDrive — upgrade to " + body.ToTier,
			WorkspaceID:     wsID,
			ToTier:          body.ToTier,
			// PhoneNumber left blank — not collected on upgrade form.
			// PhonePe's hosted page prompts the user. The Python SDK
			// requires the field to be present; empty string is fine.
		})
		if err != nil {
			log.Printf("phonepe.CreateOrder failed: %v", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "phonepe order create failed"})
			return
		}
		_, err = h.db.Exec(r.Context(), `
			INSERT INTO subscription_upgrade_orders
			    (id, workspace_id, from_tier, to_tier, amount_paise,
			     provider, provider_order_id, initiated_by, billing_interval)
			VALUES ($1, $2, $3, $4, $5, 'phonepe', $6, $7, $8)`,
			upgradeOrderID, wsID, fromTier, body.ToTier, amountPaise,
			upgradeOrderID.String(), userID, billingInterval,
		)
		if err != nil {
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
	rzpOrderID, err := h.createRazorpayOrder(r.Context(), amountPaise, upgradeOrderID.String())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment provider unavailable"})
		return
	}
	_, err = h.db.Exec(r.Context(), `
		INSERT INTO subscription_upgrade_orders
		    (id, workspace_id, from_tier, to_tier, amount_paise,
		     razorpay_order_id, provider, provider_order_id, initiated_by, billing_interval)
		VALUES ($1, $2, $3, $4, $5, $6, 'razorpay', $6, $7, $8)`,
		upgradeOrderID, wsID, fromTier, body.ToTier, amountPaise, rzpOrderID, userID, billingInterval,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not persist upgrade order"})
		return
	}
	writeJSON(w, http.StatusCreated, upgradeResponse{
		UpgradeOrderID:  upgradeOrderID.String(),
		Provider:        "razorpay",
		RazorpayOrderID: rzpOrderID,
		RazorpayKeyID:   h.rzp.KeyID,
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
	Status   string `json:"status"`
	PlanTier string `json:"plan_tier"`
}

func (h *SubscriptionUpgradeHandler) Verify(w http.ResponseWriter, r *http.Request) {
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
		h.verifyPhonePe(w, r, wsID, body)
		return
	}

	if !h.configured() {
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
	expected := hmacSHA256Hex(body.RazorpayOrderID+"|"+body.RazorpayPaymentID, h.rzp.KeySecret)
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

func (h *SubscriptionUpgradeHandler) verifyPhonePe(w http.ResponseWriter, r *http.Request, wsID string, body verifyPaymentRequest) {
	if !h.phonepeConfigured() {
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
	err := h.db.QueryRow(r.Context(),
		`SELECT workspace_id, provider FROM subscription_upgrade_orders WHERE id::text = $1`,
		body.MerchantOrderID,
	).Scan(&orderWsID, &orderProvider)
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

	status, err := h.phonepe.FetchOrderStatus(r.Context(), body.MerchantOrderID)
	if err != nil {
		log.Printf("phonepe.FetchOrderStatus failed for order %s: %v", body.MerchantOrderID, err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not query payment status"})
		return
	}
	switch status.State {
	case "COMPLETED":
		// fall through to apply
	case "PENDING":
		writeJSON(w, http.StatusAccepted, verifyPaymentResponse{Status: "pending", PlanTier: ""})
		return
	default:
		// FAILED, EXPIRED, etc. — mark the row failed but don't change the plan.
		// The plan tier is intentionally left unchanged.
		markUpgradeOrderFailed(r.Context(), h.db, body.MerchantOrderID)
		writeJSON(w, http.StatusOK, verifyPaymentResponse{Status: "failed", PlanTier: ""})
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
	err = tx.QueryRow(ctx, `
		UPDATE subscription_upgrade_orders
		   SET status = 'paid', provider_payment_id = $1, updated_at = NOW()
		 WHERE id::text = $2 AND provider = 'phonepe' AND status = 'pending'
		RETURNING workspace_id, to_tier, amount_paise, COALESCE(billing_interval, 'monthly')`,
		transactionID, merchantOrderID,
	).Scan(&wsID, &toTier, &amountPaise, &billingIntervalPP)
	if err != nil {
		// Already settled (idempotent) or no matching pending row.
		return tx.Commit(ctx)
	}

	if _, err := tx.Exec(ctx,
		`UPDATE workspaces SET plan_tier = $1 WHERE id = $2`, toTier, wsID,
	); err != nil {
		return fmt.Errorf("update plan_tier: %w", err)
	}
	// Sync storage quota to the new plan tier.
	if _, err := tx.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, 0, 0, $2)
		 ON CONFLICT (workspace_id) DO UPDATE SET quota_bytes = $2`,
		wsID, planDefaultQuota(toTier),
	); err != nil {
		return fmt.Errorf("update storage quota: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE subscriptions SET status = 'churned', cancelled_at = NOW()
		 WHERE workspace_id = $1 AND status = 'active'`, wsID,
	); err != nil {
		return fmt.Errorf("deactivate old subscription: %w", err)
	}
	now := time.Now().UTC()
	expiresAtPP := now.AddDate(0, 1, 0)
	if billingIntervalPP == "annual" {
		expiresAtPP = now.AddDate(1, 0, 0)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO subscriptions
		    (workspace_id, tier_slug, amount_paisa, status, started_at, expires_at, billing_interval)
		VALUES ($1, $2, $3, 'active', $4, $5, $6)`,
		wsID, toTier, amountPaise, now, expiresAtPP, billingIntervalPP,
	); err != nil {
		return fmt.Errorf("insert subscription: %w", err)
	}
	return tx.Commit(ctx)
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

// ── Webhook ──────────────────────────────────────────────────────────────────

func (h *SubscriptionUpgradeHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	if !h.configured() {
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
	if !verifyRazorpaySignature(raw, sig, h.rzp.WebhookSecret) {
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
	err = tx.QueryRow(ctx, `
		UPDATE subscription_upgrade_orders
		   SET status = 'paid', razorpay_payment_id = $1, updated_at = NOW()
		 WHERE razorpay_order_id = $2 AND status = 'pending'
		RETURNING id, workspace_id, to_tier, amount_paise, COALESCE(billing_interval, 'monthly')`,
		rzpPaymentID, rzpOrderID,
	).Scan(&upgradeOrderID, &wsID, &toTier, &amountPaise, &billingIntervalApply)
	if err != nil {
		// Already processed (idempotent) or unknown order — treat as OK.
		return tx.Commit(ctx)
	}

	// Update workspace plan tier.
	if _, err := tx.Exec(ctx,
		`UPDATE workspaces SET plan_tier = $1 WHERE id = $2`, toTier, wsID,
	); err != nil {
		return fmt.Errorf("update plan_tier: %w", err)
	}

	// Sync storage quota to the new plan tier.
	if _, err := tx.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, 0, 0, $2)
		 ON CONFLICT (workspace_id) DO UPDATE SET quota_bytes = $2`,
		wsID, planDefaultQuota(toTier),
	); err != nil {
		return fmt.Errorf("update storage quota: %w", err)
	}

	// Deactivate any existing active subscription row for this workspace.
	if _, err := tx.Exec(ctx, `
		UPDATE subscriptions SET status = 'churned', cancelled_at = NOW()
		 WHERE workspace_id = $1 AND status = 'active'`, wsID,
	); err != nil {
		return fmt.Errorf("deactivate old subscription: %w", err)
	}

	// Insert new active subscription record. Expiry is 1 year for annual
	// billing, 1 month for monthly.
	now := time.Now().UTC()
	expiresAt := now.AddDate(0, 1, 0)
	if billingIntervalApply == "annual" {
		expiresAt = now.AddDate(1, 0, 0)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO subscriptions
		    (workspace_id, tier_slug, amount_paisa, status, started_at, expires_at, billing_interval)
		VALUES ($1, $2, $3, 'active', $4, $5, $6)`,
		wsID, toTier, amountPaise, now, expiresAt, billingIntervalApply,
	); err != nil {
		return fmt.Errorf("insert subscription: %w", err)
	}

	return tx.Commit(ctx)
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

func (h *SubscriptionUpgradeHandler) createRazorpayOrder(ctx context.Context, amountPaise int64, receipt string) (string, error) {
	payload, _ := json.Marshal(rzpOrderReq{
		Amount:   amountPaise,
		Currency: "INR",
		Receipt:  receipt,
		Notes:    map[string]string{"source": "subscription_upgrade", "receipt": receipt},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(h.rzp.BaseURL, "/")+"/v1/orders", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(h.rzp.KeyID, h.rzp.KeySecret)
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
