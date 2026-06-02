// HTTP handler for the F-014 recharge flow.
//
// Routes:
//   POST   /api/v1/streaming/recharge                  (workspace-auth)  → create order
//   POST   /api/v1/webhooks/phonepe/streaming          (no auth, signature)
//   POST   /api/v1/webhooks/razorpay/streaming         (no auth, signature)
//   GET    /api/v1/public/streaming/packages           (no auth)         → list visible global packages
//   POST   /api/v1/admin/streaming/recharges/{id}/refund (super-admin)   → refund

package recharge

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/middleware"
)

// Handler bundles the recharge service + DB pool for HTTP adapters.
type Handler struct {
	svc  *Service
	pool *pgxpool.Pool
}

// NewHandler constructs a Handler.
func NewHandler(svc *Service, pool *pgxpool.Pool) *Handler {
	return &Handler{svc: svc, pool: pool}
}

// RegisterRoutes mounts all recharge routes on r.
//
// Public + workspace + admin routes are mounted from one place so the
// caller in main.go only needs one wiring line.
func RegisterRoutes(r chi.Router, h *Handler) {
	// Public catalogue (no auth — landing page reads this).
	r.Get("/api/v1/public/streaming/packages", h.ListPublicPackages)

	// Workspace-authenticated recharge initiation.
	r.Group(func(g chi.Router) {
		g.Use(middleware.RequireAuth)
		g.Post("/api/v1/streaming/recharge", h.CreateRecharge)
		g.Get("/api/v1/streaming/recharges", h.ListMyOrders)
		g.Get("/api/v1/streaming/balance", h.GetMyBalance)
	})

	// Webhooks (no auth; signature verification done in the handler).
	r.Post("/api/v1/webhooks/phonepe/streaming", h.PhonePeWebhook)
	r.Post("/api/v1/webhooks/razorpay/streaming", h.RazorpayWebhook)

	// Super-admin refund.
	r.Group(func(g chi.Router) {
		g.Use(middleware.RequireAuth)
		g.Use(middleware.RequirePlatformRole("super_admin"))
		g.Post("/api/v1/admin/streaming/recharges/{id}/refund", h.RefundRecharge)
	})
}

// ─── Public ───────────────────────────────────────────────────────────

type publicPackage struct {
	ID                     uuid.UUID `json:"id"`
	Code                   string    `json:"code"`
	Name                   string    `json:"name"`
	Tier                   string    `json:"tier"`
	Minutes                int       `json:"minutes"`
	MaxConcurrentViewers   int       `json:"max_concurrent_viewers"`
	ReplayTTLDays          int       `json:"replay_ttl_days"`
	PricePaise             int64     `json:"price_paise"`
	BaseRatePaisePerMin    int64     `json:"base_rate_paise_per_min"`
	OverageRatePaisePerMin int64     `json:"overage_rate_paise_per_min"`
}

// ListPublicPackages lists global (workspace_id IS NULL) packages with their
// active rate-card row, suitable for the unauthenticated landing page.
func (h *Handler) ListPublicPackages(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT p.id, p.code, p.name, p.tier, p.minutes, p.max_concurrent_viewers,
		       p.replay_ttl_days,
		       r.price_paise, r.base_rate_paise_per_min, r.overage_rate_paise_per_min
		  FROM streaming_packages p
		  JOIN LATERAL (
		      SELECT price_paise, base_rate_paise_per_min, overage_rate_paise_per_min
		        FROM streaming_rate_cards
		       WHERE package_id = p.id AND effective_from <= now()
		       ORDER BY effective_from DESC LIMIT 1
		  ) r ON true
		 WHERE p.workspace_id IS NULL AND p.is_active
		 ORDER BY p.minutes`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	defer rows.Close()

	out := make([]publicPackage, 0, 8)
	for rows.Next() {
		var p publicPackage
		if scanErr := rows.Scan(&p.ID, &p.Code, &p.Name, &p.Tier, &p.Minutes,
			&p.MaxConcurrentViewers, &p.ReplayTTLDays,
			&p.PricePaise, &p.BaseRatePaisePerMin, &p.OverageRatePaisePerMin); scanErr == nil {
			out = append(out, p)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"packages": out})
}

// ─── Workspace-auth ───────────────────────────────────────────────────

type createRechargeRequest struct {
	PackageID   string `json:"package_id"`
	Provider    string `json:"provider,omitempty"` // "phonepe" | "razorpay" | omit
	RedirectURL string `json:"redirect_url,omitempty"`
	CallbackURL string `json:"callback_url,omitempty"` // override; default derived from settings
	BuyerName   string `json:"buyer_name,omitempty"`
	BuyerEmail  string `json:"buyer_email,omitempty"`
	BuyerPhone  string `json:"buyer_phone,omitempty"`
}

// CreateRecharge initiates a payment with the chosen provider.
func (h *Handler) CreateRecharge(w http.ResponseWriter, r *http.Request) {
	wsID, ok := workspaceIDFromCtx(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_workspace", "workspace_id required")
		return
	}
	var body createRechargeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	pkgID, err := uuid.Parse(body.PackageID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_package_id", "package_id must be a UUID")
		return
	}
	prov := Name(body.Provider)
	if prov == "" {
		prov = NamePhonePe
	}
	if body.CallbackURL != "" {
		writeError(w, http.StatusBadRequest, "invalid_callback_url", "callback_url is server-managed")
		return
	}
	if body.RedirectURL != "" && !isAllowedRechargeReturnURL(r, body.RedirectURL) {
		writeError(w, http.StatusBadRequest, "invalid_redirect_url", "redirect_url must match the app origin")
		return
	}
	body.CallbackURL = defaultRechargeCallbackURL(r, prov)
	if body.RedirectURL == "" {
		body.RedirectURL = defaultRechargeReturnURL(r)
	}

	user := userIDFromCtx(r)
	order, err := h.svc.CreateOrder(r.Context(), CreateOrderInput{
		WorkspaceID:   wsID,
		PackageID:     pkgID,
		Provider:      prov,
		CallbackURL:   body.CallbackURL,
		RedirectURL:   body.RedirectURL,
		CustomerPhone: body.BuyerPhone,
		BuyerName:     body.BuyerName,
		BuyerEmail:    body.BuyerEmail,
		InitiatedBy:   user,
	})
	switch {
	case errors.Is(err, ErrUnknownProvider):
		writeError(w, http.StatusBadRequest, "unknown_provider", err.Error())
		return
	case errors.Is(err, ErrProviderUnavailable):
		writeError(w, http.StatusServiceUnavailable, "provider_unavailable", err.Error())
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, order)
}

// ListMyOrders returns recent recharges for the caller's workspace.
func (h *Handler) ListMyOrders(w http.ResponseWriter, r *http.Request) {
	wsID, ok := workspaceIDFromCtx(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_workspace", "workspace_id required")
		return
	}
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, workspace_id, package_id, rate_card_id, amount_paise, minutes,
		       provider, provider_order_id, provider_payment_id, status, checkout_url, created_at
		  FROM streaming_recharge_orders
		 WHERE workspace_id = $1
		 ORDER BY created_at DESC
		 LIMIT 50`,
		wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	defer rows.Close()

	out := make([]Order, 0, 16)
	for rows.Next() {
		var o Order
		var checkoutURL, providerPaymentID *string
		if scanErr := rows.Scan(&o.ID, &o.WorkspaceID, &o.PackageID, &o.RateCardID,
			&o.AmountPaise, &o.Minutes, &o.Provider, &o.ProviderOrderID,
			&providerPaymentID, &o.Status, &checkoutURL, &o.CreatedAt); scanErr == nil {
			o.ProviderPaymentID = providerPaymentID
			o.CheckoutURL = checkoutURL
			o.RedirectURL = checkoutURL
			out = append(out, o)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"orders": out})
}

// GetMyBalance returns the workspace's current credit balance.
func (h *Handler) GetMyBalance(w http.ResponseWriter, r *http.Request) {
	wsID, ok := workspaceIDFromCtx(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "missing_workspace", "workspace_id required")
		return
	}
	var paise int64
	var minutes int
	err := h.pool.QueryRow(r.Context(),
		`SELECT COALESCE(balance_paise, 0), COALESCE(balance_minutes, 0)
		   FROM streaming_credit_balances WHERE workspace_id = $1`,
		wsID,
	).Scan(&paise, &minutes)
	if err != nil {
		// Pool returns zero rows for new workspaces — fall through with zeroes.
		paise, minutes = 0, 0
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"workspace_id":    wsID,
		"balance_paise":   paise,
		"balance_minutes": minutes,
	})
}

// ─── Webhooks ─────────────────────────────────────────────────────────

func (h *Handler) PhonePeWebhook(w http.ResponseWriter, r *http.Request) {
	h.handleWebhook(w, r, NamePhonePe)
}
func (h *Handler) RazorpayWebhook(w http.ResponseWriter, r *http.Request) {
	h.handleWebhook(w, r, NameRazorpay)
}

func (h *Handler) handleWebhook(w http.ResponseWriter, r *http.Request, provider Name) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20)) // 1MB cap
	if err != nil {
		writeError(w, http.StatusBadRequest, "read_body_failed", err.Error())
		return
	}

	headers := map[string]string{}
	for k, v := range r.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	order, err := h.svc.HandleWebhook(r.Context(), provider, raw, headers)
	switch {
	case errors.Is(err, ErrInvalidSignature):
		writeError(w, http.StatusUnauthorized, "invalid_signature", "webhook signature verification failed")
		return
	case errors.Is(err, ErrUnparseableCallback):
		writeError(w, http.StatusBadRequest, "unparseable", err.Error())
		return
	case errors.Is(err, ErrAmountMismatch):
		writeError(w, http.StatusConflict, "amount_mismatch", err.Error())
		return
	case err != nil:
		// We still acknowledge a subset of soft errors with 500 so the
		// provider retries; the credit was either posted (and is idempotent)
		// or wasn't.
		writeError(w, http.StatusInternalServerError, "webhook_processing_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"order_id": order.ID,
		"status":   order.Status,
	})
}

// ─── Refund (super-admin) ──────────────────────────────────────────────

type refundRequest struct {
	IdempotencyKey string `json:"idempotency_key"`
	Reason         string `json:"reason"`
}

// RefundRecharge issues a ledger reversal for a completed recharge order.
func (h *Handler) RefundRecharge(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	var body refundRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if body.IdempotencyKey == "" {
		writeError(w, http.StatusBadRequest, "missing_idempotency_key", "idempotency_key required")
		return
	}
	user := userIDFromCtx(r)
	order, err := h.svc.RefundOrder(r.Context(), id, body.IdempotencyKey, body.Reason, user)
	if err != nil {
		writeError(w, http.StatusBadRequest, "refund_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, order)
}

// ─── helpers ──────────────────────────────────────────────────────────

func workspaceIDFromCtx(r *http.Request) (uuid.UUID, bool) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		// Fallback for tests: explicit header wins when present.
		if h := r.Header.Get("X-Workspace-ID"); h != "" {
			if id, err := uuid.Parse(h); err == nil {
				return id, true
			}
		}
		return uuid.Nil, false
	}
	if ws, ok := claims["workspace_id"].(string); ok && ws != "" {
		if id, err := uuid.Parse(ws); err == nil {
			return id, true
		}
	}
	return uuid.Nil, false
}

func userIDFromCtx(r *http.Request) *uuid.UUID {
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

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": code, "message": message})
}

func defaultRechargeCallbackURL(r *http.Request, provider Name) string {
	base := firstHTTPOrigin(
		os.Getenv("PAYMENT_CALLBACK_BASE_URL"),
		os.Getenv("PUBLIC_BASE_URL"),
		requestOrigin(r),
	)
	return strings.TrimRight(base, "/") + "/api/v1/webhooks/" + string(provider) + "/streaming"
}

func defaultRechargeReturnURL(r *http.Request) string {
	base := firstHTTPOrigin(
		os.Getenv("FRONTEND_URL"),
		os.Getenv("PUBLIC_BASE_URL"),
		headerOrigin(r.Header.Get("Referer")),
		requestOrigin(r),
	)
	return strings.TrimRight(base, "/") + "/dashboard?payment=streaming_recharge"
}

func firstHTTPOrigin(values ...string) string {
	for _, value := range values {
		if origin := headerOrigin(value); origin != "" {
			return origin
		}
	}
	return "http://localhost:3000"
}

func headerOrigin(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func requestOrigin(r *http.Request) string {
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	return proto + "://" + host
}

func isHTTPURL(raw string) bool {
	return headerOrigin(raw) != ""
}

func isAllowedRechargeReturnURL(r *http.Request, raw string) bool {
	target := headerOrigin(raw)
	if target == "" {
		return false
	}
	for _, allowed := range []string{
		os.Getenv("FRONTEND_URL"),
		os.Getenv("PUBLIC_BASE_URL"),
		requestOrigin(r),
	} {
		if headerOrigin(allowed) == target {
			return true
		}
	}
	return false
}
