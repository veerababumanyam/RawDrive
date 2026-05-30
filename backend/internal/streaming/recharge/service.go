// M32 / E104 — Recharge orchestration: order creation, webhook handling,
// invoice generation, and refunds.
//
// The Service is provider-agnostic — it picks PhonePe or Razorpay through
// ProviderResolver, which loads platform_settings keys lazily so a config
// change is picked up on the next request without an app restart.

package recharge

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/streaming/credit"
)

// ProviderResolver loads provider configs from platform_settings on demand.
type ProviderResolver interface {
	PhonePe(ctx context.Context) (Provider, error)
	Razorpay(ctx context.Context) (Provider, error)
}

// PackageInfo is the minimal projection the recharge service needs about a
// streaming_package + active rate_card. Avoids importing the rate package.
type PackageInfo struct {
	PackageID  uuid.UUID
	RateCardID uuid.UUID
	PricePaise int64
	Minutes    int
}

// PackageLookup resolves a package + active rate card.
type PackageLookup interface {
	ActivePackage(ctx context.Context, packageID uuid.UUID) (*PackageInfo, error)
}

// Service is the recharge orchestration service.
type Service struct {
	pool         *pgxpool.Pool
	credit       *credit.Service
	resolver     ProviderResolver
	packages     PackageLookup
	invoiceSeq   InvoiceNumberer
	gstStateCode string // issuer GST state (2 digits)
}

// InvoiceNumberer issues monotonic invoice numbers per workspace.
type InvoiceNumberer interface {
	Next(ctx context.Context, workspaceID uuid.UUID, issuedAt time.Time) (string, error)
}

// NewService constructs a recharge Service.
func NewService(
	pool *pgxpool.Pool,
	creditSvc *credit.Service,
	resolver ProviderResolver,
	packages PackageLookup,
	invoiceSeq InvoiceNumberer,
	issuerGSTStateCode string,
) *Service {
	return &Service{
		pool:         pool,
		credit:       creditSvc,
		resolver:     resolver,
		packages:     packages,
		invoiceSeq:   invoiceSeq,
		gstStateCode: issuerGSTStateCode,
	}
}

// CreateOrderInput is the parameter to CreateOrder.
type CreateOrderInput struct {
	WorkspaceID   uuid.UUID
	PackageID     uuid.UUID
	Provider      Name // "phonepe" or "razorpay"; if "" defaults to phonepe.
	CallbackURL   string
	RedirectURL   string
	CustomerPhone string
	BuyerName     string
	BuyerEmail    string
	InitiatedBy   *uuid.UUID
}

// Order is the recharge_orders row returned to the caller.
type Order struct {
	ID                uuid.UUID `json:"id"`
	WorkspaceID       uuid.UUID `json:"workspace_id"`
	PackageID         uuid.UUID `json:"package_id"`
	RateCardID        uuid.UUID `json:"rate_card_id"`
	AmountPaise       int64     `json:"amount_paise"`
	Minutes           int       `json:"minutes"`
	Provider          Name      `json:"provider"`
	ProviderOrderID   string    `json:"provider_order_id"`
	ProviderPaymentID *string   `json:"provider_payment_id,omitempty"`
	Status            string    `json:"status"`
	CheckoutURL       *string   `json:"checkout_url,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

// CreateOrder picks a provider, opens an order with them, and persists the
// recharge_orders row. Returns the order with checkout URL the client should
// redirect/open.
func (s *Service) CreateOrder(ctx context.Context, in CreateOrderInput) (*Order, error) {
	if in.Provider == "" {
		in.Provider = NamePhonePe
	}
	if !in.Provider.IsValid() {
		return nil, ErrUnknownProvider
	}

	pkg, err := s.packages.ActivePackage(ctx, in.PackageID)
	if err != nil {
		return nil, err
	}

	provider, err := s.providerByName(ctx, in.Provider)
	if err != nil {
		return nil, err
	}

	orderID := uuid.New()
	init, err := provider.InitiateOrder(ctx, InitiateInput{
		WorkspaceID:   in.WorkspaceID.String(),
		AmountPaise:   pkg.PricePaise,
		OrderID:       orderID.String(),
		CallbackURL:   in.CallbackURL,
		RedirectURL:   in.RedirectURL,
		CustomerPhone: in.CustomerPhone,
		BuyerName:     in.BuyerName,
		BuyerEmail:    in.BuyerEmail,
	})
	if err != nil {
		return nil, fmt.Errorf("recharge: initiate %s order: %w", in.Provider, err)
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO streaming_recharge_orders (
			id, workspace_id, package_id, rate_card_id, amount_paise, minutes,
			provider, provider_order_id, status, checkout_url, initiated_by
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)`,
		orderID, in.WorkspaceID, pkg.PackageID, pkg.RateCardID,
		pkg.PricePaise, pkg.Minutes,
		string(in.Provider), init.ProviderOrderID,
		nullableString(init.CheckoutURL), in.InitiatedBy,
	)
	if err != nil {
		return nil, fmt.Errorf("recharge: insert order: %w", err)
	}

	co := init.CheckoutURL
	return &Order{
		ID:              orderID,
		WorkspaceID:     in.WorkspaceID,
		PackageID:       pkg.PackageID,
		RateCardID:      pkg.RateCardID,
		AmountPaise:     pkg.PricePaise,
		Minutes:         pkg.Minutes,
		Provider:        in.Provider,
		ProviderOrderID: init.ProviderOrderID,
		Status:          "pending",
		CheckoutURL:     &co,
		CreatedAt:       time.Now().UTC(),
	}, nil
}

// HandleWebhook verifies the inbound webhook signature, looks up the order,
// posts ledger credit (idempotent), generates an invoice row, and flips
// the order status. Safe to retry: idempotent on (workspace, provider:payment_id).
//
// Returns the updated order. If the webhook represents a non-success event
// (failed/pending), the order status is updated and credit/invoice are NOT posted.
func (s *Service) HandleWebhook(
	ctx context.Context,
	provider Name,
	rawBody []byte,
	headers map[string]string,
) (*Order, error) {
	pAdapter, err := s.providerByName(ctx, provider)
	if err != nil {
		return nil, err
	}

	if err := pAdapter.VerifyWebhookSignature(rawBody, headers); err != nil {
		return nil, err
	}

	cb, err := pAdapter.ParseCallback(rawBody)
	if err != nil {
		return nil, err
	}

	// Locate the order this webhook belongs to.
	order, err := s.findOrder(ctx, provider, cb.ProviderOrderID)
	if err != nil {
		return nil, err
	}
	if order.AmountPaise != cb.AmountPaise {
		return nil, ErrAmountMismatch
	}

	switch cb.Status {
	case CallbackFailed:
		_, err := s.pool.Exec(ctx,
			`UPDATE streaming_recharge_orders
			    SET status = 'failed', provider_payment_id = $2, updated_at = now()
			  WHERE id = $1 AND status = 'pending'`,
			order.ID, cb.ProviderPaymentID,
		)
		if err != nil {
			return nil, fmt.Errorf("recharge: mark failed: %w", err)
		}
		return s.reloadOrder(ctx, order.ID)

	case CallbackPending:
		// Nothing to persist — provider will retry.
		return order, nil

	case CallbackSuccess:
		// Idempotency key includes the provider's payment id so a webhook
		// retry posts no second ledger row even after the first run completed.
		idempKey := fmt.Sprintf("%s:%s", provider, cb.ProviderPaymentID)

		_, err := s.credit.Purchase(ctx, credit.PurchaseInput{
			WorkspaceID:    order.WorkspaceID,
			PackageID:      order.PackageID,
			Provider:       string(provider),
			ProviderTxnID:  cb.ProviderPaymentID,
			IdempotencyKey: idempKey,
		})
		if err != nil {
			return nil, fmt.Errorf("recharge: post ledger credit: %w", err)
		}

		// Mark order completed (only the first webhook flips it).
		_, err = s.pool.Exec(ctx,
			`UPDATE streaming_recharge_orders
			    SET status = 'completed', provider_payment_id = $2, updated_at = now()
			  WHERE id = $1 AND status = 'pending'`,
			order.ID, cb.ProviderPaymentID,
		)
		if err != nil {
			return nil, fmt.Errorf("recharge: mark completed: %w", err)
		}

		// Generate invoice row (idempotent: skip if invoice already exists for this order).
		if err := s.generateInvoiceIfMissing(ctx, order, cb.ProviderPaymentID); err != nil {
			// Don't fail the webhook on invoice errors — the credit is already
			// posted. Log via returned wrapped error so the caller can decide.
			return order, fmt.Errorf("recharge: invoice generation lagged: %w", err)
		}

		return s.reloadOrder(ctx, order.ID)
	}

	return order, nil
}

// RefundOrder issues a provider-side refund for a completed order and posts
// a negative `adjustment` ledger entry. Idempotent on idempotencyKey.
//
// Note: dealer-margin allocation deferred (not in F-014 D5; needs schema +
// business decision). See docs/decisions/F-014-decisions.md.
func (s *Service) RefundOrder(
	ctx context.Context,
	orderID uuid.UUID,
	idempotencyKey string,
	reason string,
	actor *uuid.UUID,
) (*Order, error) {
	if idempotencyKey == "" {
		return nil, errors.New("recharge: idempotency_key required")
	}

	order, err := s.reloadOrder(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order.Status != "completed" {
		return nil, fmt.Errorf("recharge: cannot refund order in status=%s", order.Status)
	}

	// Post a ledger adjustment that reverses the original credit. Reuse credit's
	// idempotency window — the adjustment is keyed to the refund, not the original.
	_, err = s.pool.Exec(ctx,
		`INSERT INTO streaming_ledger_entries (
			workspace_id, entry_type, amount_paise, minutes_delta,
			idempotency_key, memo, created_by
		 ) VALUES ($1,'adjustment',$2,$3,$4,$5,$6)
		 ON CONFLICT (workspace_id, idempotency_key) DO NOTHING`,
		order.WorkspaceID, -order.AmountPaise, -order.Minutes,
		idempotencyKey, "refund: "+reason, actor,
	)
	if err != nil {
		return nil, fmt.Errorf("recharge: post refund adjustment: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE streaming_recharge_orders
		    SET status = 'refunded', updated_at = now()
		  WHERE id = $1`,
		order.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("recharge: mark refunded: %w", err)
	}

	// Provider-side refund call is fire-and-forget at this layer; the caller
	// (super-admin handler) is expected to invoke the provider refund API
	// before calling us. We deliberately don't bind the two so the ledger
	// reflects what we actually owe back to the user.

	return s.reloadOrder(ctx, order.ID)
}

// ─── Helpers ──────────────────────────────────────────────────────────

func (s *Service) providerByName(ctx context.Context, n Name) (Provider, error) {
	switch n {
	case NamePhonePe:
		return s.resolver.PhonePe(ctx)
	case NameRazorpay:
		return s.resolver.Razorpay(ctx)
	}
	return nil, ErrUnknownProvider
}

func (s *Service) findOrder(ctx context.Context, p Name, providerOrderID string) (*Order, error) {
	o := &Order{}
	var checkoutURL, providerPaymentID *string
	err := s.pool.QueryRow(ctx, `
		SELECT id, workspace_id, package_id, rate_card_id, amount_paise, minutes,
		       provider, provider_order_id, provider_payment_id, status, checkout_url, created_at
		  FROM streaming_recharge_orders
		 WHERE provider = $1 AND provider_order_id = $2`,
		string(p), providerOrderID,
	).Scan(&o.ID, &o.WorkspaceID, &o.PackageID, &o.RateCardID, &o.AmountPaise, &o.Minutes,
		&o.Provider, &o.ProviderOrderID, &providerPaymentID, &o.Status, &checkoutURL, &o.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("recharge: order not found for %s/%s", p, providerOrderID)
	}
	if err != nil {
		return nil, fmt.Errorf("recharge: find order: %w", err)
	}
	o.ProviderPaymentID = providerPaymentID
	o.CheckoutURL = checkoutURL
	return o, nil
}

func (s *Service) reloadOrder(ctx context.Context, id uuid.UUID) (*Order, error) {
	o := &Order{}
	var checkoutURL, providerPaymentID *string
	err := s.pool.QueryRow(ctx, `
		SELECT id, workspace_id, package_id, rate_card_id, amount_paise, minutes,
		       provider, provider_order_id, provider_payment_id, status, checkout_url, created_at
		  FROM streaming_recharge_orders WHERE id = $1`,
		id,
	).Scan(&o.ID, &o.WorkspaceID, &o.PackageID, &o.RateCardID, &o.AmountPaise, &o.Minutes,
		&o.Provider, &o.ProviderOrderID, &providerPaymentID, &o.Status, &checkoutURL, &o.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("recharge: reload: %w", err)
	}
	o.ProviderPaymentID = providerPaymentID
	o.CheckoutURL = checkoutURL
	return o, nil
}

// generateInvoiceIfMissing inserts a streaming_invoices row if none exists
// for this order. Computes CGST/SGST/IGST per F-014 GST rules.
func (s *Service) generateInvoiceIfMissing(ctx context.Context, order *Order, providerPaymentID string) error {
	// Skip if already exists (webhook retry safety).
	var existing uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM streaming_invoices WHERE recharge_order_id = $1`,
		order.ID,
	).Scan(&existing)
	if err == nil {
		return nil // already issued
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("invoice: lookup: %w", err)
	}

	// Resolve buyer GSTIN + state from contacts/workspaces, falling back to B2C.
	buyerName, buyerGSTIN, buyerStateCode := s.lookupBuyer(ctx, order.WorkspaceID)

	kind := "b2c"
	if buyerGSTIN != "" {
		kind = "b2b"
	}

	// 18% GST on streaming services. Split by intra/inter-state.
	//
	// F-016/F-017: GST is computed with the SAME round-half-up arithmetic the
	// billing engine (gst_engine.go) uses, so a streaming invoice's tax matches
	// a billing invoice for the same subtotal. For intra-state supplies CGST and
	// SGST are each computed INDEPENDENTLY at 9% (not by splitting a rounded
	// total), which guarantees CGST == SGST for every amount. For inter-state
	// supplies IGST is the full 18%.
	subtotal := order.AmountPaise

	var cgst, sgst, igst int64
	if buyerStateCode != "" && !strings.EqualFold(buyerStateCode, s.gstStateCode) {
		igst = gstRoundHalfUpPercent(subtotal, gstRatePercent)
	} else {
		cgst = gstRoundHalfUpPercent(subtotal, gstRatePercent/2)
		sgst = gstRoundHalfUpPercent(subtotal, gstRatePercent/2)
	}
	total := subtotal + cgst + sgst + igst

	// Look up the matching purchase id (the credit.Purchase webhook handler
	// just inserted a streaming_purchases row keyed to provider_txn_id).
	var purchaseID *uuid.UUID
	var pid uuid.UUID
	err = s.pool.QueryRow(ctx,
		`SELECT id FROM streaming_purchases
		  WHERE workspace_id = $1 AND provider = $2 AND provider_txn_id = $3
		  LIMIT 1`,
		order.WorkspaceID, string(order.Provider), providerPaymentID,
	).Scan(&pid)
	if err == nil {
		purchaseID = &pid
	}

	now := time.Now().UTC()
	invoiceNumber, err := s.invoiceSeq.Next(ctx, order.WorkspaceID, now)
	if err != nil {
		return fmt.Errorf("invoice: number: %w", err)
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO streaming_invoices (
			workspace_id, recharge_order_id, purchase_id,
			invoice_number, invoice_kind, buyer_name, buyer_gstin,
			subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		order.WorkspaceID, order.ID, purchaseID,
		invoiceNumber, kind, nullableString(buyerName), nullableString(buyerGSTIN),
		subtotal, cgst, sgst, igst, total, now,
	)
	if err != nil {
		return fmt.Errorf("invoice: insert: %w", err)
	}
	return nil
}

// lookupBuyer reaches into workspaces to resolve display name + GSTIN +
// state. Returns ("", "", "") when not available — caller treats as B2C.
func (s *Service) lookupBuyer(ctx context.Context, workspaceID uuid.UUID) (string, string, string) {
	var name, gstin, stateCode string
	// workspaces table doesn't carry GSTIN in the canonical schema; we read
	// it from contacts.gstin of the workspace owner if present. This is a
	// best-effort read — schema variations across deployments are tolerated.
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(w.name, ''), COALESCE(c.gstin, ''), COALESCE(LEFT(c.gstin, 2), '')
		  FROM workspaces w
		  LEFT JOIN contacts c
		         ON c.workspace_id = w.id
		        AND c.contact_type = 'self'
		 WHERE w.id = $1
		 LIMIT 1`,
		workspaceID,
	).Scan(&name, &gstin, &stateCode)
	return name, gstin, stateCode
}

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// gstRatePercent is the streaming-services GST rate. CGST and SGST are each
// gstRatePercent/2; IGST is the full gstRatePercent. Keep this in lockstep with
// the billing engine (gst_engine.go) so both invoice families agree.
const gstRatePercent = 18

// gstRoundHalfUpPercent computes percent% of amount with round-half-up to the
// nearest paisa, matching gst_engine.go's roundHalfUpPercent exactly:
//
//	(amount*percent + 50) / 100
//
// Integer division floors, so adding 50 before dividing by 100 rounds halves
// up. Because CGST and SGST are each computed independently from the same
// subtotal at the same rate, they are always equal on intra-state invoices
// (F-017), and the total matches the billing path's round-half-up tax (F-016).
func gstRoundHalfUpPercent(amount int64, percent int64) int64 {
	return (amount*percent + 50) / 100
}
