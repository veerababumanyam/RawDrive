// Package signuppay orchestrates the payment-before-workspace funnel for
// paid-duplicate-phone signups (slice 4 of the phone-reuse epic).
//
// A paid_pending account (created when someone signs up on an already-used phone
// with paid intent) has NO workspace and NO quota. It must PAY first; only after
// the payment provider verifies the payment does settlement create the
// workspace with the paid tier, insert an active subscription, and flip the
// account to paid_active. The selected plan (req.Plan) is never trusted as
// proof — verification of the actual payment is the sole source of truth.
//
// This package is the testable orchestration core. The DB transaction, the
// payment-provider clients, and the plan catalog live behind the collaborator
// interfaces so the ordering invariants (verify BEFORE provision; only
// paid_pending; idempotent re-delivery) can be unit-tested with fakes.
package signuppay

import (
	"context"
	"errors"
	"strings"
)

// Phone-reuse states this package reasons about.
const (
	statePaidPending = "paid_pending"
	statePaidActive  = "paid_active"
)

var (
	// ErrNotPendingPaid means the account is not awaiting a signup payment — it
	// must not be (re)provisioned through this funnel.
	ErrNotPendingPaid = errors.New("signuppay: account is not in paid_pending state")
	// ErrFreeTierNotAllowed means a free/unknown tier was requested for a funnel
	// that exists specifically to sell a paid plan.
	ErrFreeTierNotAllowed = errors.New("signuppay: a paid plan is required for a paid-pending signup")
	// ErrPaymentNotVerified means the provider did not confirm the payment.
	ErrPaymentNotVerified = errors.New("signuppay: payment could not be verified")
)

// Order is a pre-workspace payment order.
type Order struct {
	ID              string
	UserID          string
	Tier            string
	BillingInterval string
	AmountPaise     int64
	Provider        string
	ProviderOrderID string
	Status          string // pending | paid | failed
	WorkspaceID     string // set on settlement
}

// ProvisionInput carries everything the atomic settlement needs.
type ProvisionInput struct {
	UserID          string
	OrderID         string
	Tier            string
	BillingInterval string
	AmountPaise     int64
}

// ReuseStateReader reads a user's phone_reuse_state.
type ReuseStateReader interface {
	GetReuseState(ctx context.Context, userID string) (string, error)
}

// OrderStore persists and looks up signup payment orders.
type OrderStore interface {
	Create(ctx context.Context, o Order) (id string, err error)
	GetByProviderOrder(ctx context.Context, provider, providerOrderID string) (Order, error)
}

// PriceSource resolves a tier+interval to a price and reports whether the tier
// is a self-serve paid plan.
type PriceSource interface {
	PriceForTier(ctx context.Context, tier, billingInterval string) (amountPaise int64, paid bool, err error)
}

// ProviderOrderCreator creates an order with the payment provider.
type ProviderOrderCreator interface {
	CreateProviderOrder(ctx context.Context, provider string, amountPaise int64, receipt string) (providerOrderID string, err error)
}

// PaymentVerifier verifies a provider payment proof. THE source of truth that a
// payment actually happened.
type PaymentVerifier interface {
	VerifyPaid(ctx context.Context, provider, providerOrderID, proof string) (bool, error)
}

// Provisioner performs the atomic settlement: create workspace(tier) + active
// subscription + flip user -> paid_active (+ paid_phone_verified_at) + mark
// order paid/linked. Returns the new workspace id.
type Provisioner interface {
	ProvisionPaidAccount(ctx context.Context, in ProvisionInput) (workspaceID string, err error)
}

// Service is the signup-payment orchestrator.
type Service struct {
	state    ReuseStateReader
	orders   OrderStore
	prices   PriceSource
	creator  ProviderOrderCreator
	verifier PaymentVerifier
	provis   Provisioner
}

// NewService wires the orchestrator.
func NewService(
	state ReuseStateReader,
	orders OrderStore,
	prices PriceSource,
	creator ProviderOrderCreator,
	verifier PaymentVerifier,
	provis Provisioner,
) *Service {
	return &Service{state: state, orders: orders, prices: prices, creator: creator, verifier: verifier, provis: provis}
}

// CreateOrder validates the account is paid_pending and the tier is paid, then
// creates a provider order and persists a pending signup order. No workspace or
// quota is granted here.
func (s *Service) CreateOrder(ctx context.Context, userID, tier, billingInterval, provider string) (Order, error) {
	st, err := s.state.GetReuseState(ctx, userID)
	if err != nil {
		return Order{}, err
	}
	if st != statePaidPending {
		return Order{}, ErrNotPendingPaid
	}

	interval := normalizeInterval(billingInterval)
	amount, paid, err := s.prices.PriceForTier(ctx, tier, interval)
	if err != nil {
		return Order{}, err
	}
	if !paid || amount <= 0 {
		return Order{}, ErrFreeTierNotAllowed
	}

	providerOrderID, err := s.creator.CreateProviderOrder(ctx, provider, amount, "signup:"+userID)
	if err != nil {
		return Order{}, err
	}

	o := Order{
		UserID:          userID,
		Tier:            tier,
		BillingInterval: interval,
		AmountPaise:     amount,
		Provider:        provider,
		ProviderOrderID: providerOrderID,
		Status:          "pending",
	}
	id, err := s.orders.Create(ctx, o)
	if err != nil {
		return Order{}, err
	}
	o.ID = id
	return o, nil
}

// Settle verifies the payment and, only then, provisions the paid account. It is
// idempotent: a re-delivered webhook for an already-settled order returns the
// existing workspace without re-provisioning.
func (s *Service) Settle(ctx context.Context, provider, providerOrderID, proof string) (workspaceID string, err error) {
	order, err := s.orders.GetByProviderOrder(ctx, provider, providerOrderID)
	if err != nil {
		return "", err
	}

	// Idempotency: already settled -> return the linked workspace, do nothing.
	if order.Status == "paid" && order.WorkspaceID != "" {
		return order.WorkspaceID, nil
	}

	// Source of truth: the payment must verify BEFORE any workspace is created.
	ok, err := s.verifier.VerifyPaid(ctx, provider, providerOrderID, proof)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrPaymentNotVerified
	}

	// Guard the account state. paid_active with no workspace is degenerate but
	// we still refuse to provision twice through anything other than the
	// idempotency branch above.
	st, err := s.state.GetReuseState(ctx, order.UserID)
	if err != nil {
		return "", err
	}
	if st != statePaidPending && st != statePaidActive {
		return "", ErrNotPendingPaid
	}

	return s.provis.ProvisionPaidAccount(ctx, ProvisionInput{
		UserID:          order.UserID,
		OrderID:         order.ID,
		Tier:            order.Tier,
		BillingInterval: order.BillingInterval,
		AmountPaise:     order.AmountPaise,
	})
}

func normalizeInterval(i string) string {
	if strings.EqualFold(strings.TrimSpace(i), "annual") {
		return "annual"
	}
	return "monthly"
}
