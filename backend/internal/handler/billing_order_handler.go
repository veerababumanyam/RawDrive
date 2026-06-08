package handler

import (
	"context"
	"crypto/hmac"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/rawdrive/backend/internal/middleware"
)

type billingProductVersion struct {
	versionID       uuid.UUID
	productCode     string
	productType     string
	name            string
	description     string
	currency        string
	pricePaise      int64
	billingInterval string
	metadata        []byte
	rank            int
}

type billingOrderRequest struct {
	ProductCode    string `json:"product_code"`
	Provider       string `json:"provider,omitempty"`
	TargetType     string `json:"target_type,omitempty"`
	TargetID       string `json:"target_id,omitempty"`
	IdempotencyKey string `json:"idempotency_key,omitempty"`
}

type billingOrderResponse struct {
	BillingOrderID  string `json:"billing_order_id"`
	Provider        string `json:"provider"`
	RazorpayOrderID string `json:"razorpay_order_id,omitempty"`
	RazorpayKeyID   string `json:"razorpay_key_id,omitempty"`
	RedirectURL     string `json:"redirect_url,omitempty"`
	PhonePeOrderID  string `json:"phonepe_order_id,omitempty"`
	AmountPaise     int64  `json:"amount_paise"`
	Currency        string `json:"currency"`
	OrderType       string `json:"order_type"`
	ProductCode     string `json:"product_code"`
	TargetType      string `json:"target_type"`
	TargetID        string `json:"target_id,omitempty"`
}

// CreateBillingOrder creates a governed product order from the approved product
// catalog: gallery extensions, storage boosters, and event-upload packs.
func (h *SubscriptionUpgradeHandler) CreateBillingOrder(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	wsIDText := middleware.WorkspaceIDFromContext(r.Context())
	if wsIDText == "" || wsIDText == "pending-onboarding" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace required"})
		return
	}
	wsID, err := uuid.Parse(wsIDText)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid workspace"})
		return
	}

	var body billingOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	product, err := h.currentBillingProductVersion(r.Context(), body.ProductCode)
	if err != nil {
		log.Printf("billing order: product lookup failed: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "product catalog unavailable"})
		return
	}
	if err := validateBillingProductForCheckout(product); err != nil {
		log.Printf("billing order: product metadata invalid code=%s err=%v", product.productCode, err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "product catalog metadata incomplete"})
		return
	}
	orderType, ok := billingOrderTypeForProduct(product.productType)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported product type"})
		return
	}
	targetType, targetID, err := h.normalizeBillingOrderTarget(r.Context(), wsID, product.productType, body.TargetType, body.TargetID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
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

	orderID := uuid.New()
	userID := userIDFromSubscriptionCtx(r)
	snapshot, err := billingProductSnapshot(product, orderType)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "snapshot failed"})
		return
	}

	if provider == "phonepe" {
		if strings.TrimSpace(cfg.publicBaseURL) == "" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment callback base URL not configured"})
			return
		}
		callbackQuery := url.Values{}
		callbackQuery.Set("provider", "phonepe")
		callbackQuery.Set("order_id", orderID.String())
		callbackQuery.Set("product", product.productCode)
		redirectURL := strings.TrimRight(cfg.publicBaseURL, "/") +
			"/settings/billing/payment-callback?" + callbackQuery.Encode()
		phonePeOrder, err := cfg.phonepe.CreateOrder(r.Context(), CreateOrderInput{
			MerchantOrderID: orderID.String(),
			AmountPaise:     product.pricePaise,
			RedirectURL:     redirectURL,
			Message:         "RawDrive - " + product.name,
			WorkspaceID:     wsID.String(),
			ToTier:          product.productCode,
		})
		if err != nil {
			log.Printf("billing order: phonepe create failed: %v", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "phonepe order create failed"})
			return
		}
		if err := h.insertBillingOrder(r.Context(), billingOrderInsert{
			id:              orderID,
			workspaceID:     wsID,
			userID:          userID,
			orderType:       orderType,
			targetType:      targetType,
			targetID:        targetID,
			amountPaise:     product.pricePaise,
			currency:        product.currency,
			provider:        "phonepe",
			providerOrderID: orderID.String(),
			idempotencyKey:  strings.TrimSpace(body.IdempotencyKey),
			snapshot:        snapshot,
		}); err != nil {
			log.Printf("billing order: persist phonepe order failed: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not persist billing order"})
			return
		}
		writeJSON(w, http.StatusCreated, billingOrderResponse{
			BillingOrderID: orderID.String(),
			Provider:       "phonepe",
			RedirectURL:    phonePeOrder.RedirectURL,
			PhonePeOrderID: phonePeOrder.PhonePeOrderID,
			AmountPaise:    product.pricePaise,
			Currency:       product.currency,
			OrderType:      orderType,
			ProductCode:    product.productCode,
			TargetType:     targetType,
			TargetID:       targetIDString(targetID),
		})
		return
	}

	rzpOrderID, err := h.createRazorpayOrder(r.Context(), cfg.rzp, product.pricePaise, orderID.String())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment provider unavailable"})
		return
	}
	if err := h.insertBillingOrder(r.Context(), billingOrderInsert{
		id:              orderID,
		workspaceID:     wsID,
		userID:          userID,
		orderType:       orderType,
		targetType:      targetType,
		targetID:        targetID,
		amountPaise:     product.pricePaise,
		currency:        product.currency,
		provider:        "razorpay",
		providerOrderID: rzpOrderID,
		idempotencyKey:  strings.TrimSpace(body.IdempotencyKey),
		snapshot:        snapshot,
	}); err != nil {
		log.Printf("billing order: persist razorpay order failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not persist billing order"})
		return
	}
	writeJSON(w, http.StatusCreated, billingOrderResponse{
		BillingOrderID:  orderID.String(),
		Provider:        "razorpay",
		RazorpayOrderID: rzpOrderID,
		RazorpayKeyID:   cfg.rzp.KeyID,
		AmountPaise:     product.pricePaise,
		Currency:        product.currency,
		OrderType:       orderType,
		ProductCode:     product.productCode,
		TargetType:      targetType,
		TargetID:        targetIDString(targetID),
	})
}

type billingOrderVerifyRequest struct {
	Provider          string `json:"provider,omitempty"`
	RazorpayPaymentID string `json:"razorpay_payment_id,omitempty"`
	RazorpayOrderID   string `json:"razorpay_order_id,omitempty"`
	RazorpaySignature string `json:"razorpay_signature,omitempty"`
	MerchantOrderID   string `json:"merchant_order_id,omitempty"`
}

type billingOrderVerifyResponse struct {
	Status            string `json:"status"`
	ProviderState     string `json:"provider_state,omitempty"`
	ProviderErrorCode string `json:"provider_error_code,omitempty"`
	OrderType         string `json:"order_type,omitempty"`
	TargetType        string `json:"target_type,omitempty"`
	TargetID          string `json:"target_id,omitempty"`
}

func (h *SubscriptionUpgradeHandler) VerifyBillingOrder(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	wsID := middleware.WorkspaceIDFromContext(r.Context())
	if wsID == "" || wsID == "pending-onboarding" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace required"})
		return
	}
	var body billingOrderVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	provider := strings.ToLower(strings.TrimSpace(body.Provider))
	if provider == "" {
		provider = "razorpay"
	}
	switch provider {
	case "phonepe":
		h.verifyPhonePeBillingOrder(w, r, wsID, body, cfg)
	case "razorpay":
		h.verifyRazorpayBillingOrder(w, r, wsID, body, cfg)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid provider"})
	}
}

func (h *SubscriptionUpgradeHandler) verifyRazorpayBillingOrder(w http.ResponseWriter, r *http.Request, wsID string, body billingOrderVerifyRequest, cfg subscriptionPaymentConfig) {
	if !cfg.razorpayConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "razorpay not configured"})
		return
	}
	if body.RazorpayOrderID == "" || body.RazorpayPaymentID == "" || body.RazorpaySignature == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing payment fields"})
		return
	}
	expected := hmacSHA256Hex(body.RazorpayOrderID+"|"+body.RazorpayPaymentID, cfg.rzp.KeySecret)
	if !hmac.Equal([]byte(expected), []byte(body.RazorpaySignature)) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid signature"})
		return
	}
	var orderWsID uuid.UUID
	if err := h.db.QueryRow(r.Context(),
		`SELECT workspace_id FROM billing_orders WHERE provider = 'razorpay' AND provider_order_id = $1`,
		body.RazorpayOrderID,
	).Scan(&orderWsID); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "order not found"})
		return
	}
	if orderWsID.String() != wsID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "order does not belong to this workspace"})
		return
	}
	out, err := h.settleBillingOrder(r.Context(), "razorpay", body.RazorpayOrderID, body.RazorpayPaymentID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *SubscriptionUpgradeHandler) verifyPhonePeBillingOrder(w http.ResponseWriter, r *http.Request, wsID string, body billingOrderVerifyRequest, cfg subscriptionPaymentConfig) {
	if !cfg.phonepeConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "phonepe not configured"})
		return
	}
	if body.MerchantOrderID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing merchant_order_id"})
		return
	}
	var orderWsID uuid.UUID
	var amountPaise int64
	if err := h.db.QueryRow(r.Context(),
		`SELECT workspace_id, amount_paise FROM billing_orders WHERE id::text = $1 AND provider = 'phonepe'`,
		body.MerchantOrderID,
	).Scan(&orderWsID, &amountPaise); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "order not found"})
		return
	}
	if orderWsID.String() != wsID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "order does not belong to this workspace"})
		return
	}
	status, err := cfg.phonepe.FetchOrderStatus(r.Context(), body.MerchantOrderID)
	if err != nil {
		log.Printf("billing order: phonepe status failed for %s: %v", body.MerchantOrderID, err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not query payment status"})
		return
	}
	switch status.State {
	case "COMPLETED":
		if status.Amount != amountPaise {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "payment amount mismatch"})
			return
		}
		if status.PrimaryTransaction == "" {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "payment transaction missing"})
			return
		}
	case "PENDING":
		writeJSON(w, http.StatusAccepted, billingOrderVerifyResponse{
			Status:            "pending",
			ProviderState:     status.State,
			ProviderErrorCode: firstNonEmpty(status.DetailedErrorCode, status.ErrorCode),
		})
		return
	default:
		markBillingOrderFailed(r.Context(), h.db, body.MerchantOrderID)
		writeJSON(w, http.StatusOK, billingOrderVerifyResponse{
			Status:            "failed",
			ProviderState:     status.State,
			ProviderErrorCode: firstNonEmpty(status.DetailedErrorCode, status.ErrorCode),
		})
		return
	}
	out, err := h.settleBillingOrder(r.Context(), "phonepe", body.MerchantOrderID, status.PrimaryTransaction)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *SubscriptionUpgradeHandler) PhonePeBillingWebhook(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	if cfg.phonepe == nil || !cfg.phonepeWebhookConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "phonepe webhook not configured"})
		return
	}
	raw, err := readLimitedBody(w, r)
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
	orderID := strings.TrimSpace(data.MerchantOrderID)
	if orderID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing merchant_order_id"})
		return
	}
	switch strings.ToUpper(strings.TrimSpace(data.State)) {
	case "COMPLETED":
		status, err := cfg.phonepe.FetchOrderStatus(r.Context(), orderID)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not query payment status"})
			return
		}
		if status.State != "COMPLETED" {
			writeJSON(w, http.StatusAccepted, map[string]string{"status": "pending"})
			return
		}
		out, err := h.settleBillingOrder(r.Context(), "phonepe", orderID, status.PrimaryTransaction)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
			return
		}
		writeJSON(w, http.StatusOK, out)
	case "PENDING", "":
		writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
	default:
		markBillingOrderFailed(r.Context(), h.db, orderID)
		writeJSON(w, http.StatusOK, map[string]string{"status": "failed"})
	}
}

func (h *SubscriptionUpgradeHandler) RazorpayBillingWebhook(w http.ResponseWriter, r *http.Request) {
	cfg := h.currentPaymentConfig(r.Context())
	if !cfg.razorpayConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment gateway not configured"})
		return
	}
	raw, err := readLimitedBody(w, r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "read body failed"})
		return
	}
	if !verifyRazorpaySignature(raw, r.Header.Get("X-Razorpay-Signature"), cfg.rzp.WebhookSecret) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid signature"})
		return
	}
	var event struct {
		Event   string `json:"event"`
		Payload struct {
			Payment struct {
				Entity struct {
					ID      string `json:"id"`
					OrderID string `json:"order_id"`
				} `json:"entity"`
			} `json:"payment"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(raw, &event); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if event.Event != "payment.captured" || event.Payload.Payment.Entity.OrderID == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}
	out, err := h.settleBillingOrder(r.Context(), "razorpay", event.Payload.Payment.Entity.OrderID, event.Payload.Payment.Entity.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "apply failed"})
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func readLimitedBody(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	return io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
}

type billingOrderInsert struct {
	id              uuid.UUID
	workspaceID     uuid.UUID
	userID          *uuid.UUID
	orderType       string
	targetType      string
	targetID        *uuid.UUID
	amountPaise     int64
	currency        string
	provider        string
	providerOrderID string
	idempotencyKey  string
	snapshot        []byte
}

func (h *SubscriptionUpgradeHandler) insertBillingOrder(ctx context.Context, in billingOrderInsert) error {
	_, err := h.db.Exec(ctx, `
		INSERT INTO billing_orders (
		    id, workspace_id, user_id, order_type, target_type, target_id,
		    amount_paise, currency, provider, provider_order_id, idempotency_key,
		    catalog_snapshot, metadata
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULLIF($11, ''),
		        $12::jsonb, jsonb_build_object('source', 'billing_product_checkout'))`,
		in.id, in.workspaceID, in.userID, in.orderType, in.targetType, in.targetID,
		in.amountPaise, in.currency, in.provider, in.providerOrderID, in.idempotencyKey,
		string(in.snapshot),
	)
	return err
}

func (h *SubscriptionUpgradeHandler) currentBillingProductVersion(ctx context.Context, productCode string) (billingProductVersion, error) {
	var product billingProductVersion
	err := h.db.QueryRow(ctx, `
		SELECT v.id, p.code, p.product_type, v.name, v.description, v.currency,
		       v.price_paise, v.billing_interval, v.metadata, v.rank
		FROM billing_products p
		JOIN billing_product_versions v ON v.product_code = p.code
		WHERE p.code = $1
		  AND p.active = TRUE
		  AND v.active = TRUE
		  AND v.archived_at IS NULL
		  AND v.status IN ('approved', 'published')
		  AND v.effective_from <= NOW()
		  AND (v.effective_to IS NULL OR v.effective_to > NOW())
		ORDER BY v.effective_from DESC, v.version DESC
		LIMIT 1`,
		strings.TrimSpace(productCode),
	).Scan(
		&product.versionID,
		&product.productCode,
		&product.productType,
		&product.name,
		&product.description,
		&product.currency,
		&product.pricePaise,
		&product.billingInterval,
		&product.metadata,
		&product.rank,
	)
	return product, err
}

func validateBillingProductForCheckout(product billingProductVersion) error {
	if product.productType != "event_upload" {
		return nil
	}
	var metadata map[string]any
	if err := json.Unmarshal(product.metadata, &metadata); err != nil {
		return fmt.Errorf("invalid event product metadata: %w", err)
	}
	if int64FromMetadata(metadata, "quota_bytes", 0) <= 0 {
		return fmt.Errorf("event product quota_bytes metadata required")
	}
	activeDays := int64FromMetadata(metadata, "active_days", 0)
	if activeDays <= 0 || activeDays > 30 {
		return fmt.Errorf("event product active_days must be between 1 and 30")
	}
	uploadWindowDays := int64FromMetadata(metadata, "upload_window_days", 0)
	if uploadWindowDays <= 0 || uploadWindowDays > activeDays {
		return fmt.Errorf("event product upload_window_days must be between 1 and active_days")
	}
	if retentionDays := int64FromMetadata(metadata, "retention_days", 0); retentionDays != 30 {
		return fmt.Errorf("event product retention_days must be 30")
	}
	return nil
}

func billingOrderTypeForProduct(productType string) (string, bool) {
	switch productType {
	case "event_upload":
		return "event_upload", true
	case "gallery_extension":
		return "gallery_extension", true
	case "storage_booster":
		return "storage_booster", true
	default:
		return "", false
	}
}

func (h *SubscriptionUpgradeHandler) normalizeBillingOrderTarget(ctx context.Context, wsID uuid.UUID, productType, rawType, rawID string) (string, *uuid.UUID, error) {
	switch productType {
	case "storage_booster":
		return "workspace", &wsID, nil
	case "gallery_extension", "event_upload":
		if strings.TrimSpace(rawID) == "" {
			return "", nil, fmt.Errorf("gallery target required")
		}
		galleryID, err := uuid.Parse(strings.TrimSpace(rawID))
		if err != nil {
			return "", nil, fmt.Errorf("invalid gallery target")
		}
		var ok bool
		if err := h.db.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM galleries WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL)`,
			galleryID, wsID,
		).Scan(&ok); err != nil {
			return "", nil, fmt.Errorf("gallery target lookup failed")
		}
		if !ok {
			return "", nil, fmt.Errorf("gallery target not found")
		}
		return "gallery", &galleryID, nil
	default:
		targetType := strings.TrimSpace(rawType)
		if targetType == "" {
			targetType = "workspace"
		}
		return targetType, &wsID, nil
	}
}

func billingProductSnapshot(product billingProductVersion, orderType string) ([]byte, error) {
	return json.Marshal(map[string]any{
		"snapshot_schema": "billing_product_checkout_snapshot.v1",
		"source":          "billing_product_checkout",
		"order_type":      orderType,
		"billing": map[string]any{
			"amount_paise":     product.pricePaise,
			"billing_interval": product.billingInterval,
			"currency":         product.currency,
		},
		"product": map[string]any{
			"version_id":       product.versionID.String(),
			"code":             product.productCode,
			"product_type":     product.productType,
			"name":             product.name,
			"description":      product.description,
			"currency":         product.currency,
			"price_paise":      product.pricePaise,
			"billing_interval": product.billingInterval,
			"metadata":         json.RawMessage(product.metadata),
			"rank":             product.rank,
		},
	})
}

type settledBillingOrder struct {
	id              uuid.UUID
	workspaceID     uuid.UUID
	userID          *uuid.UUID
	orderType       string
	targetType      string
	targetID        *uuid.UUID
	provider        string
	amountPaise     int64
	currency        string
	catalogSnapshot []byte
}

func (h *SubscriptionUpgradeHandler) settleBillingOrder(ctx context.Context, provider, providerOrderID, providerPaymentID string) (billingOrderVerifyResponse, error) {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return billingOrderVerifyResponse{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var order settledBillingOrder
	var targetID *uuid.UUID
	err = tx.QueryRow(ctx, `
		UPDATE billing_orders
		SET status = 'paid',
		    provider_payment_id = $1,
		    paid_at = COALESCE(paid_at, now()),
		    updated_at = now()
		WHERE provider = $2
		  AND provider_order_id = $3
		  AND status IN ('pending', 'failed')
		RETURNING id, workspace_id, user_id, order_type, target_type, target_id, provider,
		          amount_paise, currency, catalog_snapshot`,
		providerPaymentID, provider, providerOrderID,
	).Scan(
		&order.id,
		&order.workspaceID,
		&order.userID,
		&order.orderType,
		&order.targetType,
		&targetID,
		&order.provider,
		&order.amountPaise,
		&order.currency,
		&order.catalogSnapshot,
	)
	order.targetID = targetID
	if err != nil {
		if err == pgx.ErrNoRows {
			var out billingOrderVerifyResponse
			_ = tx.QueryRow(ctx, `
				SELECT status, order_type, target_type, target_id::text
				FROM billing_orders
				WHERE provider = $1 AND provider_order_id = $2`,
				provider, providerOrderID,
			).Scan(&out.Status, &out.OrderType, &out.TargetType, &out.TargetID)
			if out.Status == "" {
				out.Status = "ok"
			}
			return out, tx.Commit(ctx)
		}
		return billingOrderVerifyResponse{}, err
	}

	switch order.orderType {
	case "storage_booster":
		err = h.settleStorageBooster(ctx, tx, order)
	case "gallery_extension":
		err = h.settleGalleryExtension(ctx, tx, order)
	case "event_upload":
		err = h.settleEventUpload(ctx, tx, order)
	default:
		err = fmt.Errorf("unsupported billing order type %q", order.orderType)
	}
	if err != nil {
		return billingOrderVerifyResponse{}, err
	}
	if err := h.scheduleBillingPaymentSuccess(ctx, tx, order); err != nil {
		return billingOrderVerifyResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return billingOrderVerifyResponse{}, err
	}
	h.invalidateStorageAnalytics(order.workspaceID)
	return billingOrderVerifyResponse{
		Status:     "ok",
		OrderType:  order.orderType,
		TargetType: order.targetType,
		TargetID:   targetIDString(order.targetID),
	}, nil
}

func (h *SubscriptionUpgradeHandler) settleStorageBooster(ctx context.Context, tx pgx.Tx, order settledBillingOrder) error {
	snap, err := parseBillingProductSnapshot(order.catalogSnapshot)
	if err != nil {
		return err
	}
	versionID, err := uuid.Parse(snap.Product.VersionID)
	if err != nil {
		return fmt.Errorf("invalid product version id: %w", err)
	}
	quotaBytes := int64FromMetadata(snap.Product.Metadata, "quota_bytes", 0)
	if quotaBytes <= 0 {
		return fmt.Errorf("storage booster quota missing")
	}
	expiresAt := time.Now().UTC().AddDate(0, 1, 0)
	var boosterID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO workspace_storage_boosters (
		    workspace_id, billing_product_version_id, source_order_id,
		    quota_bytes, status, started_at, expires_at
		)
		VALUES ($1, $2, $3, $4, 'active', now(), $5)
		RETURNING id`,
		order.workspaceID, versionID, order.id, quotaBytes, expiresAt,
	).Scan(&boosterID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		VALUES ($1, 0, 0, $2)
		ON CONFLICT (workspace_id) DO UPDATE
		SET quota_bytes = workspace_storage.quota_bytes + $2,
		    updated_at = now()`,
		order.workspaceID, quotaBytes,
	); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    policy_code, job_type, target_type, target_id, workspace_id, user_id,
		    due_at, proof_snapshot, metadata
		)
		VALUES (
		    'storage_booster_default', 'storage_booster_expire', 'subscription', $1,
		    $2, $3, $4,
		    jsonb_build_object('storage_booster_id', $1::text, 'quota_bytes', $5),
		    jsonb_build_object('source', 'storage_booster_settlement')
		)`,
		boosterID, order.workspaceID, order.userID, expiresAt, quotaBytes,
	)
	return err
}

func (h *SubscriptionUpgradeHandler) settleGalleryExtension(ctx context.Context, tx pgx.Tx, order settledBillingOrder) error {
	if order.targetID == nil {
		return fmt.Errorf("gallery extension target missing")
	}
	snap, err := parseBillingProductSnapshot(order.catalogSnapshot)
	if err != nil {
		return err
	}
	if boolFromMetadata(snap.Product.Metadata, "archive_forever", false) {
		if _, err := tx.Exec(ctx, `
			UPDATE galleries
			SET expires_at = NULL,
			    status = CASE WHEN status = 'expired' THEN 'shared' ELSE status END,
			    updated_at = now()
			WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
			*order.targetID, order.workspaceID,
		); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE gallery_event_entitlements
			   SET status = 'cancelled',
			       cancelled_at = COALESCE(cancelled_at, now()),
			       updated_at = now()
			 WHERE workspace_id = $1
			   AND gallery_id = $2
			   AND converted_at IS NULL
			   AND cleanup_completed_at IS NULL`,
			order.workspaceID, *order.targetID,
		); err != nil {
			return err
		}
		return cancelPendingGalleryLifecycleJobs(ctx, tx, *order.targetID)
	}
	extensionDays := int64FromMetadata(snap.Product.Metadata, "extension_days", 0)
	if extensionDays <= 0 {
		return fmt.Errorf("gallery extension days missing")
	}
	var expiresAt time.Time
	if err := tx.QueryRow(ctx, `
		UPDATE galleries
		SET expires_at = CASE
		        WHEN expires_at IS NOT NULL AND expires_at > now()
		        THEN expires_at + ($3 * INTERVAL '1 day')
		        ELSE now() + ($3 * INTERVAL '1 day')
		    END,
		    status = CASE WHEN status = 'expired' THEN 'shared' ELSE status END,
		    updated_at = now()
		WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
		RETURNING expires_at`,
		*order.targetID, order.workspaceID, extensionDays,
	).Scan(&expiresAt); err != nil {
		return err
	}
	if err := cancelPendingGalleryLifecycleJobs(ctx, tx, *order.targetID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE gallery_event_entitlements
		   SET active_ends_at = $3,
		       cleanup_due_at = $3,
		       status = 'active',
		       updated_at = now()
		 WHERE workspace_id = $1
		   AND gallery_id = $2
		   AND converted_at IS NULL
		   AND cancelled_at IS NULL
		   AND cleanup_completed_at IS NULL`,
		order.workspaceID, *order.targetID, expiresAt,
	); err != nil {
		return err
	}
	return h.scheduleGalleryLifecycleJobs(ctx, tx, order, "pay_per_event_default", expiresAt, &expiresAt, true)
}

func (h *SubscriptionUpgradeHandler) settleEventUpload(ctx context.Context, tx pgx.Tx, order settledBillingOrder) error {
	if order.targetID == nil {
		return fmt.Errorf("event upload target missing")
	}
	snap, err := parseBillingProductSnapshot(order.catalogSnapshot)
	if err != nil {
		return err
	}
	activeDays := int64FromMetadata(snap.Product.Metadata, "active_days", 30)
	uploadWindowDays := int64FromMetadata(snap.Product.Metadata, "upload_window_days", activeDays)
	retentionDays := int64FromMetadata(snap.Product.Metadata, "retention_days", 30)
	credits := int64FromMetadata(snap.Product.Metadata, "upload_credits", 500)
	quotaBytes := int64FromMetadata(snap.Product.Metadata, "quota_bytes", 0)
	if activeDays <= 0 || activeDays > 30 || uploadWindowDays <= 0 || uploadWindowDays > activeDays || retentionDays != 30 || quotaBytes <= 0 {
		return fmt.Errorf("invalid event product entitlement metadata")
	}
	versionID, err := uuid.Parse(snap.Product.VersionID)
	if err != nil {
		return fmt.Errorf("invalid product version id: %w", err)
	}
	now := time.Now().UTC()
	uploadWindowEndsAt := now.AddDate(0, 0, int(uploadWindowDays))
	activeEndsAt := now.AddDate(0, 0, int(activeDays))
	cleanupDueAt := now.AddDate(0, 0, int(retentionDays))

	if _, err := tx.Exec(ctx, `
		UPDATE galleries
		SET expires_at = $3,
		    status = CASE WHEN status IN ('draft', 'expired') THEN 'shared' ELSE status END,
		    updated_at = now()
		WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
		*order.targetID, order.workspaceID, activeEndsAt,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO gallery_event_entitlements (
		    workspace_id, gallery_id, billing_order_id, billing_product_version_id,
		    product_code, quota_bytes, upload_credits, upload_window_ends_at,
		    active_ends_at, cleanup_due_at, status, metadata
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active',
		        jsonb_build_object('source', 'billing_event_upload'))
		ON CONFLICT (billing_order_id) DO UPDATE
		   SET quota_bytes = EXCLUDED.quota_bytes,
		       upload_credits = EXCLUDED.upload_credits,
		       upload_window_ends_at = EXCLUDED.upload_window_ends_at,
		       active_ends_at = EXCLUDED.active_ends_at,
		       cleanup_due_at = EXCLUDED.cleanup_due_at,
		       status = 'active',
		       updated_at = now()`,
		order.workspaceID, *order.targetID, order.id, versionID, snap.Product.Code,
		quotaBytes, credits, uploadWindowEndsAt, activeEndsAt, cleanupDueAt,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		VALUES ($1, 0, 0, $2)
		ON CONFLICT (workspace_id) DO UPDATE
		SET quota_bytes = GREATEST(workspace_storage.quota_bytes, $2),
		    updated_at = now()`,
		order.workspaceID, quotaBytes,
	); err != nil {
		return err
	}
	if credits > 0 {
		var purchaseID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO upload_purchases (
			    workspace_id, idempotency_key, amount_credits, amount_inr_paise,
			    gateway, gateway_order_id, gateway_payment_id, status,
			    metadata, confirmed_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed',
			        jsonb_build_object('source', 'billing_event_upload', 'billing_order_id', $6), now())
			ON CONFLICT (workspace_id, idempotency_key) DO UPDATE
			SET status = 'confirmed'
			RETURNING id`,
			order.workspaceID, "billing_order:"+order.id.String(), credits, order.amountPaise,
			order.provider, order.id.String(), order.id.String(),
		).Scan(&purchaseID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO upload_ledger_entries (
			    workspace_id, entry_type, amount_credits, idempotency_key,
			    purchase_id, reason, metadata, created_by
			)
			VALUES ($1, 'purchase', $2, $3, $4,
			        'pay-per-event upload pack',
			        jsonb_build_object('source', 'billing_event_upload', 'billing_order_id', $5),
			        $6)
			ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
			order.workspaceID, credits, "billing_order:"+order.id.String(), purchaseID,
			order.id.String(), order.userID,
		); err != nil {
			return err
		}
	}
	if err := cancelPendingGalleryLifecycleJobs(ctx, tx, *order.targetID); err != nil {
		return err
	}
	return h.scheduleGalleryLifecycleJobs(ctx, tx, order, "pay_per_event_default", activeEndsAt, &cleanupDueAt, true)
}

func (h *SubscriptionUpgradeHandler) scheduleBillingPaymentSuccess(ctx context.Context, tx pgx.Tx, order settledBillingOrder) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    job_type, target_type, target_id, workspace_id, user_id,
		    due_at, proof_snapshot, metadata
		)
		VALUES (
		    'payment_success', 'billing_order', $1, $2, $3, now(),
		    jsonb_build_object('billing_order_id', $1::text, 'order_type', $4),
		    jsonb_build_object('source', 'billing_order_settlement')
		)`,
		order.id, order.workspaceID, order.userID, order.orderType,
	)
	return err
}

func (h *SubscriptionUpgradeHandler) scheduleGalleryLifecycleJobs(ctx context.Context, tx pgx.Tx, order settledBillingOrder, policyCode string, activeEndsAt time.Time, cleanupDueAt *time.Time, conversionPrompt bool) error {
	if order.targetID == nil {
		return fmt.Errorf("gallery target missing")
	}
	cleanupAt := activeEndsAt
	if cleanupDueAt != nil {
		cleanupAt = *cleanupDueAt
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    policy_code, job_type, target_type, target_id, workspace_id, user_id,
		    due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'expiry_warning', 'gallery', $2, $3, $4,
		       $5 - (days * INTERVAL '1 day'),
		       jsonb_build_object('gallery_id', $2::text, 'expires_at', $5::text, 'days_before', days),
		       jsonb_build_object('source', $6)
		FROM billing_lifecycle_policies p
		CROSS JOIN LATERAL unnest(p.expiry_warning_days) AS days
		WHERE p.code = $1
		  AND $5 - (days * INTERVAL '1 day') > now()`,
		policyCode, *order.targetID, order.workspaceID, order.userID, activeEndsAt, order.orderType,
	); err != nil {
		return err
	}
	if conversionPrompt {
		if _, err := tx.Exec(ctx, `
			INSERT INTO billing_lifecycle_jobs (
			    policy_code, job_type, target_type, target_id, workspace_id, user_id,
			    due_at, proof_snapshot, metadata
			)
			SELECT p.code, 'conversion_prompt', 'gallery', $2, $3, $4,
			       GREATEST(now(), $5 - INTERVAL '3 days'),
			       jsonb_build_object('gallery_id', $2::text, 'expires_at', $5::text),
			       jsonb_build_object('source', $6)
			FROM billing_lifecycle_policies p
			WHERE p.code = $1
			  AND p.conversion_prompt_enabled = TRUE`,
			policyCode, *order.targetID, order.workspaceID, order.userID, activeEndsAt, order.orderType,
		); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    policy_code, job_type, target_type, target_id, workspace_id, user_id,
		    due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'deletion_warning', 'gallery', $2, $3, $4,
		       $5 - (days * INTERVAL '1 day'),
		       jsonb_build_object('gallery_id', $2::text, 'expires_at', $6::text, 'cleanup_due_at', $5::text, 'days_before_delete', days),
		       jsonb_build_object('source', $7)
		FROM billing_lifecycle_policies p
		CROSS JOIN LATERAL unnest(p.deletion_warning_days) AS days
		WHERE p.code = $1
		  AND $5 - (days * INTERVAL '1 day') > now()`,
		policyCode, *order.targetID, order.workspaceID, order.userID, cleanupAt, activeEndsAt, order.orderType,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    policy_code, job_type, target_type, target_id, workspace_id, user_id,
		    due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'gallery_delete', 'gallery', $2, $3, $4,
		       $5,
		       jsonb_build_object('gallery_id', $2::text, 'expires_at', $6::text, 'cleanup_due_at', $5::text, 'gallery_delete_grace_days', p.gallery_delete_grace_days),
		       jsonb_build_object('source', $7)
		FROM billing_lifecycle_policies p
		WHERE p.code = $1`,
		policyCode, *order.targetID, order.workspaceID, order.userID, cleanupAt, activeEndsAt, order.orderType,
	); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    policy_code, job_type, target_type, target_id, workspace_id, user_id,
		    due_at, proof_snapshot, metadata
		)
		SELECT p.code, 'account_delete', 'workspace', $3, $3, $4,
		       $5 + (p.account_delete_grace_days * INTERVAL '1 day'),
		       jsonb_build_object('gallery_id', $2::text, 'expires_at', $6::text, 'cleanup_due_at', $5::text, 'account_delete_grace_days', p.account_delete_grace_days),
		       jsonb_build_object('source', $7)
		FROM billing_lifecycle_policies p
		WHERE p.code = $1`,
		policyCode, *order.targetID, order.workspaceID, order.userID, cleanupAt, activeEndsAt, order.orderType,
	)
	return err
}

func cancelPendingGalleryLifecycleJobs(ctx context.Context, tx pgx.Tx, galleryID uuid.UUID) error {
	_, err := tx.Exec(ctx, `
		UPDATE billing_lifecycle_jobs
		SET status = 'cancelled', updated_at = now()
		WHERE target_type = 'gallery'
		  AND target_id = $1
		  AND status IN ('pending', 'failed')
		  AND job_type IN ('expiry_warning', 'deletion_warning', 'gallery_delete', 'conversion_prompt')`,
		galleryID,
	)
	return err
}

func cancelPendingWorkspaceLifecycleJobs(ctx context.Context, tx pgx.Tx, workspaceID uuid.UUID) error {
	_, err := tx.Exec(ctx, `
		UPDATE billing_lifecycle_jobs
		SET status = 'cancelled', updated_at = now()
		WHERE workspace_id = $1
		  AND status IN ('pending', 'failed')
		  AND job_type IN ('renewal_reminder', 'expiry_warning', 'deletion_warning', 'gallery_delete', 'account_delete', 'conversion_prompt')`,
		workspaceID,
	)
	return err
}

func markPayPerEventEntitlementsConverted(ctx context.Context, tx pgx.Tx, workspaceID uuid.UUID) error {
	_, err := tx.Exec(ctx, `
		UPDATE gallery_event_entitlements
		   SET status = 'converted',
		       converted_at = COALESCE(converted_at, now()),
		       updated_at = now()
		 WHERE workspace_id = $1
		   AND converted_at IS NULL
		   AND cancelled_at IS NULL
		   AND cleanup_completed_at IS NULL`,
		workspaceID,
	)
	return err
}

type billingProductCatalogSnapshot struct {
	Product struct {
		VersionID   string         `json:"version_id"`
		Code        string         `json:"code"`
		ProductType string         `json:"product_type"`
		Metadata    map[string]any `json:"metadata"`
	} `json:"product"`
	Billing struct {
		BillingInterval string `json:"billing_interval"`
	} `json:"billing"`
}

func parseBillingProductSnapshot(snapshot []byte) (billingProductCatalogSnapshot, error) {
	var out billingProductCatalogSnapshot
	if err := json.Unmarshal(snapshot, &out); err != nil {
		return out, err
	}
	if out.Product.Metadata == nil {
		out.Product.Metadata = map[string]any{}
	}
	return out, nil
}

func int64FromMetadata(metadata map[string]any, key string, fallback int64) int64 {
	value, ok := metadata[key]
	if !ok {
		return fallback
	}
	switch v := value.(type) {
	case float64:
		return int64(v)
	case int64:
		return v
	case int:
		return int64(v)
	case json.Number:
		n, err := v.Int64()
		if err == nil {
			return n
		}
	case string:
		var n int64
		if _, err := fmt.Sscan(v, &n); err == nil {
			return n
		}
	}
	return fallback
}

func boolFromMetadata(metadata map[string]any, key string, fallback bool) bool {
	value, ok := metadata[key]
	if !ok {
		return fallback
	}
	if v, ok := value.(bool); ok {
		return v
	}
	return fallback
}

func targetIDString(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

func markBillingOrderFailed(ctx context.Context, db orderExecer, orderID string) {
	tag, err := db.Exec(ctx, `
		UPDATE billing_orders
		SET status = 'failed', failed_at = now(), updated_at = now()
		WHERE id::text = $1 AND status = 'pending'`,
		orderID,
	)
	if err != nil {
		log.Printf("failed to mark billing order %s failed: %v", orderID, err)
		return
	}
	if tag.RowsAffected() == 0 {
		log.Printf("mark billing order %s failed: no pending row matched", orderID)
	}
}
