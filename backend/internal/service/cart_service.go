package service

// cart_service.go — M14 GAL-FR-158: persistent gallery cart.
//
// Cart math is always server-side. The flow is:
//
//  1. Client sends a list of {product_id, quantity, customization}
//  2. Service looks up each product, snapshots unit_price and computes
//     line totals + subtotal
//  3. Optional coupon code resolves to a discount amount
//  4. Total = subtotal - discount (never below zero)
//
// The cart itself is stored as a JSONB blob keyed by
// (gallery_id, client_email), so an anonymous visitor can return and
// pick up where they left off.

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// Cart errors surfaced to handlers.
var (
	ErrCartEmptyEmail       = errors.New("cart: client_email required")
	ErrCartEmptyItems       = errors.New("cart: at least one item required")
	ErrCartInvalidQuantity  = errors.New("cart: quantity must be positive")
	ErrCartProductInactive  = errors.New("cart: product not found or inactive")
	ErrCartCurrencyMismatch = errors.New("cart: all items must use the same currency")
)

// CartItemInput is the inbound shape — no trusted pricing.
type CartItemInput struct {
	ProductID     uuid.UUID `json:"product_id"`
	Quantity      int       `json:"quantity"`
	Customization any       `json:"customization,omitempty"`
}

// CartInput is the full cart payload from the client.
type CartInput struct {
	ClientEmail string          `json:"client_email"`
	Items       []CartItemInput `json:"items"`
	CouponCode  string          `json:"coupon_code,omitempty"`
}

// CartService owns persistent cart operations for galleries.
type CartService struct {
	repo         *repository.CartRepo
	productRepo  *repository.ProductRepo
	discountCalc DiscountCalculator
}

// DiscountCalculator resolves a coupon code to a paisa discount amount
// against a subtotal. It is narrow on purpose so we can swap in any
// implementation (admin, dealer, gallery-local) without coupling the
// cart to a specific coupon model.
type DiscountCalculator interface {
	ComputeDiscount(ctx context.Context, code string, subtotal int) (int, error)
}

// NewCartService builds a cart service. discountCalc may be nil — a nil
// calculator means coupon codes are ignored silently.
func NewCartService(repo *repository.CartRepo, productRepo *repository.ProductRepo, discountCalc DiscountCalculator) *CartService {
	return &CartService{repo: repo, productRepo: productRepo, discountCalc: discountCalc}
}

// validateCartInput runs the pure-logic checks before any DB access.
func validateCartInput(in CartInput) error {
	if strings.TrimSpace(in.ClientEmail) == "" {
		return ErrCartEmptyEmail
	}
	if len(in.Items) == 0 {
		return ErrCartEmptyItems
	}
	for _, it := range in.Items {
		if it.Quantity <= 0 {
			return fmt.Errorf("%w: product %s", ErrCartInvalidQuantity, it.ProductID)
		}
	}
	return nil
}

// computeTotals takes the validated items plus a discount and returns the
// cart totals. Pure function, no DB access — easy to test.
func computeTotals(items []repository.CartItem, discount int) (subtotal, finalDiscount, total int) {
	for i := range items {
		items[i].LineTotal = items[i].UnitPrice * items[i].Quantity
		subtotal += items[i].LineTotal
	}
	finalDiscount = discount
	if finalDiscount < 0 {
		finalDiscount = 0
	}
	if finalDiscount > subtotal {
		finalDiscount = subtotal
	}
	total = subtotal - finalDiscount
	return
}

// UpsertCart persists a cart with server-computed totals.
func (s *CartService) UpsertCart(ctx context.Context, galleryID uuid.UUID, in CartInput) (*repository.GalleryCart, error) {
	if err := validateCartInput(in); err != nil {
		return nil, err
	}

	items := make([]repository.CartItem, 0, len(in.Items))
	var currency string
	for _, it := range in.Items {
		p, err := s.productRepo.GetByID(ctx, it.ProductID)
		if err != nil {
			return nil, err
		}
		if p == nil || !p.IsActive || p.GalleryID != galleryID {
			return nil, fmt.Errorf("%w: %s", ErrCartProductInactive, it.ProductID)
		}
		if currency == "" {
			currency = p.PriceCurrency
		} else if currency != p.PriceCurrency {
			return nil, ErrCartCurrencyMismatch
		}

		items = append(items, repository.CartItem{
			ProductID: p.ID,
			Quantity:  it.Quantity,
			UnitPrice: p.PriceAmount,
		})
	}

	// Compute provisional subtotal to resolve discount amount.
	subtotal, _, _ := computeTotals(append([]repository.CartItem(nil), items...), 0)

	discount := 0
	if in.CouponCode != "" && s.discountCalc != nil {
		d, err := s.discountCalc.ComputeDiscount(ctx, in.CouponCode, subtotal)
		if err != nil {
			// Invalid coupon → clear the code but keep the cart.
			in.CouponCode = ""
			discount = 0
		} else {
			discount = d
		}
	}

	subtotal, finalDiscount, total := computeTotals(items, discount)

	cart := &repository.GalleryCart{
		GalleryID:   galleryID,
		ClientEmail: strings.ToLower(strings.TrimSpace(in.ClientEmail)),
		Items:       items,
		CouponCode:  in.CouponCode,
		Subtotal:    subtotal,
		Discount:    finalDiscount,
		Total:       total,
	}
	if err := s.repo.Upsert(ctx, cart); err != nil {
		return nil, err
	}
	return cart, nil
}

// GetCart returns the persisted cart for a (gallery, email) pair.
func (s *CartService) GetCart(ctx context.Context, galleryID uuid.UUID, clientEmail string) (*repository.GalleryCart, error) {
	email := strings.ToLower(strings.TrimSpace(clientEmail))
	if email == "" {
		return nil, ErrCartEmptyEmail
	}
	return s.repo.Get(ctx, galleryID, email)
}

// ClearCart removes a persisted cart (typically after checkout).
func (s *CartService) ClearCart(ctx context.Context, galleryID uuid.UUID, clientEmail string) error {
	email := strings.ToLower(strings.TrimSpace(clientEmail))
	return s.repo.Delete(ctx, galleryID, email)
}
