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
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/middleware"
)

// planPricePaise maps canonical tier slugs to monthly prices in paise (INR×100).
var planPricePaise = map[string]int64{
	"starter":      9900,   // ₹99
	"professional": 29900,  // ₹299
	"business":     299900, // ₹2,999
	"enterprise":   599900, // ₹5,999
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

// SubscriptionUpgradeHandler creates Razorpay orders for plan-tier upgrades
// and processes the resulting payment webhook.
type SubscriptionUpgradeHandler struct {
	db  *pgxpool.Pool
	rzp RazorpayUpgradeConfig
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
// _WEBHOOK_SECRET from the environment. Always returns a non-nil handler; the
// handler itself returns 503 when credentials are absent.
func NewSubscriptionUpgradeHandlerFromEnv(db *pgxpool.Pool) *SubscriptionUpgradeHandler {
	return NewSubscriptionUpgradeHandler(db, RazorpayUpgradeConfig{
		KeyID:         os.Getenv("RAZORPAY_KEY_ID"),
		KeySecret:     os.Getenv("RAZORPAY_KEY_SECRET"),
		WebhookSecret: os.Getenv("RAZORPAY_WEBHOOK_SECRET"),
	})
}

func (h *SubscriptionUpgradeHandler) configured() bool {
	return h.rzp.KeyID != "" && h.rzp.KeySecret != "" && h.rzp.WebhookSecret != ""
}

// ── Upgrade ─────────────────────────────────────────────────────────────────

type upgradeRequest struct {
	ToTier string `json:"to_tier"`
}

type upgradeResponse struct {
	UpgradeOrderID  string `json:"upgrade_order_id"`
	RazorpayOrderID string `json:"razorpay_order_id"`
	AmountPaise     int64  `json:"amount_paise"`
	Currency        string `json:"currency"`
	RazorpayKeyID   string `json:"razorpay_key_id"`
}

func (h *SubscriptionUpgradeHandler) Upgrade(w http.ResponseWriter, r *http.Request) {
	if !h.configured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment gateway not configured"})
		return
	}
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
	amountPaise, ok := planPricePaise[body.ToTier]
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no price for tier"})
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

	// Create Razorpay order.
	rzpOrderID, err := h.createRazorpayOrder(r.Context(), amountPaise, upgradeOrderID.String())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment provider unavailable"})
		return
	}

	// Persist the upgrade order record.
	userID := userIDFromSubscriptionCtx(r)
	_, err = h.db.Exec(r.Context(), `
		INSERT INTO subscription_upgrade_orders
		    (id, workspace_id, from_tier, to_tier, amount_paise, razorpay_order_id, initiated_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		upgradeOrderID, wsID, fromTier, body.ToTier, amountPaise, rzpOrderID, userID,
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not persist upgrade order"})
		return
	}

	writeJSON(w, http.StatusCreated, upgradeResponse{
		UpgradeOrderID:  upgradeOrderID.String(),
		RazorpayOrderID: rzpOrderID,
		AmountPaise:     amountPaise,
		Currency:        "INR",
		RazorpayKeyID:   h.rzp.KeyID,
	})
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
	err = tx.QueryRow(ctx, `
		UPDATE subscription_upgrade_orders
		   SET status = 'paid', razorpay_payment_id = $1, updated_at = NOW()
		 WHERE razorpay_order_id = $2 AND status = 'pending'
		RETURNING id, workspace_id, to_tier, amount_paise`,
		rzpPaymentID, rzpOrderID,
	).Scan(&upgradeOrderID, &wsID, &toTier, &amountPaise)
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

	// Deactivate any existing active subscription row for this workspace.
	if _, err := tx.Exec(ctx, `
		UPDATE subscriptions SET status = 'churned', cancelled_at = NOW()
		 WHERE workspace_id = $1 AND status = 'active'`, wsID,
	); err != nil {
		return fmt.Errorf("deactivate old subscription: %w", err)
	}

	// Insert new active subscription record.
	now := time.Now().UTC()
	nextMonth := now.AddDate(0, 1, 0)
	if _, err := tx.Exec(ctx, `
		INSERT INTO subscriptions
		    (workspace_id, tier_slug, amount_paisa, status, started_at, expires_at)
		VALUES ($1, $2, $3, 'active', $4, $5)`,
		wsID, toTier, amountPaise, now, nextMonth,
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
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
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
