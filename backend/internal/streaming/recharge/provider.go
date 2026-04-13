// Package recharge defines the payment-provider abstraction used by the
// F-014 prepaid recharge flow (M32). PhonePe is the primary provider;
// Razorpay is a configurable fallback.
//
// Each provider implements:
//   - InitiateOrder: create a hosted-checkout session, return checkout URL
//                    and the provider's order id.
//   - VerifyWebhookSignature: verify the inbound webhook (X-VERIFY for
//                              PhonePe, x-razorpay-signature for Razorpay).
//   - ParseCallback: extract a normalised CallbackPayload from a verified
//                    webhook body.
//
// The recharge handler stays provider-agnostic — it picks a provider via
// platform_settings and delegates everything to the Provider interface.
package recharge

import (
	"context"
	"errors"
)

// Name identifies a payment provider.
type Name string

const (
	NamePhonePe  Name = "phonepe"
	NameRazorpay Name = "razorpay"
)

// IsValid reports whether the name maps to a known provider.
func (n Name) IsValid() bool {
	switch n {
	case NamePhonePe, NameRazorpay:
		return true
	}
	return false
}

// CallbackStatus normalises the per-provider success/failure code.
type CallbackStatus string

const (
	CallbackSuccess CallbackStatus = "success"
	CallbackFailed  CallbackStatus = "failed"
	CallbackPending CallbackStatus = "pending"
)

// InitiateInput is the per-order input passed to a Provider.
type InitiateInput struct {
	WorkspaceID    string  // free-form; providers may surface it as their merchant-user-id
	AmountPaise    int64
	OrderID        string  // our internal recharge_order id (uuid string)
	CallbackURL    string  // public URL the provider POSTs the webhook to
	RedirectURL    string  // user-facing redirect after payment
	CustomerPhone  string  // optional, populated for PhonePe Standard Checkout
	BuyerName      string  // optional, populated for Razorpay prefill
	BuyerEmail     string
}

// InitiateResult is the per-order result returned by a Provider.
type InitiateResult struct {
	CheckoutURL     string
	ProviderOrderID string
	Raw             []byte // raw provider response, persisted for audit
}

// CallbackPayload is the normalised view of a verified webhook event.
type CallbackPayload struct {
	ProviderOrderID   string
	ProviderPaymentID string
	AmountPaise       int64
	Status            CallbackStatus
	Raw               []byte // raw verified body, kept for audit
}

// Provider is the interface implemented by PhonePe and Razorpay adapters.
type Provider interface {
	Name() Name
	InitiateOrder(ctx context.Context, in InitiateInput) (*InitiateResult, error)
	VerifyWebhookSignature(rawBody []byte, headers map[string]string) error
	ParseCallback(rawBody []byte) (*CallbackPayload, error)
}

// Errors.
var (
	ErrUnknownProvider     = errors.New("recharge: unknown provider name")
	ErrProviderUnavailable = errors.New("recharge: provider configuration missing or invalid")
	ErrInvalidSignature    = errors.New("recharge: webhook signature failed verification")
	ErrUnparseableCallback = errors.New("recharge: webhook body did not parse as expected")
	ErrAmountMismatch      = errors.New("recharge: webhook amount does not match the order")
)
