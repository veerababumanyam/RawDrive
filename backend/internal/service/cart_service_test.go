package service

// cart_service_test.go — pure-logic tests for CartService. Repo-backed
// paths (product lookup, cart persistence) are covered by integration
// tests under backend/internal/database.

import (
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

func TestValidateCartInput_RejectsEmptyEmail(t *testing.T) {
	in := CartInput{
		ClientEmail: "  ",
		Items: []CartItemInput{
			{ProductID: uuid.New(), Quantity: 1},
		},
	}
	if err := validateCartInput(in); !errors.Is(err, ErrCartEmptyEmail) {
		t.Errorf("want ErrCartEmptyEmail, got %v", err)
	}
}

func TestValidateCartInput_RejectsEmptyItems(t *testing.T) {
	in := CartInput{
		ClientEmail: "client@example.com",
		Items:       []CartItemInput{},
	}
	if err := validateCartInput(in); !errors.Is(err, ErrCartEmptyItems) {
		t.Errorf("want ErrCartEmptyItems, got %v", err)
	}
}

func TestValidateCartInput_RejectsZeroQuantity(t *testing.T) {
	in := CartInput{
		ClientEmail: "client@example.com",
		Items: []CartItemInput{
			{ProductID: uuid.New(), Quantity: 0},
		},
	}
	if err := validateCartInput(in); !errors.Is(err, ErrCartInvalidQuantity) {
		t.Errorf("want ErrCartInvalidQuantity, got %v", err)
	}
}

func TestValidateCartInput_RejectsNegativeQuantity(t *testing.T) {
	in := CartInput{
		ClientEmail: "client@example.com",
		Items: []CartItemInput{
			{ProductID: uuid.New(), Quantity: -3},
		},
	}
	if err := validateCartInput(in); !errors.Is(err, ErrCartInvalidQuantity) {
		t.Errorf("want ErrCartInvalidQuantity, got %v", err)
	}
}

func TestComputeTotals_SingleItem(t *testing.T) {
	items := []repository.CartItem{
		{ProductID: uuid.New(), Quantity: 3, UnitPrice: 500}, // 1500
	}
	sub, disc, total := computeTotals(items, 0)
	if sub != 1500 {
		t.Errorf("subtotal: want 1500, got %d", sub)
	}
	if disc != 0 {
		t.Errorf("discount: want 0, got %d", disc)
	}
	if total != 1500 {
		t.Errorf("total: want 1500, got %d", total)
	}
	if items[0].LineTotal != 1500 {
		t.Errorf("line total: want 1500, got %d", items[0].LineTotal)
	}
}

func TestComputeTotals_MultipleItemsWithDiscount(t *testing.T) {
	items := []repository.CartItem{
		{Quantity: 2, UnitPrice: 1000}, // 2000
		{Quantity: 1, UnitPrice: 500},  // 500
		{Quantity: 4, UnitPrice: 250},  // 1000
	}
	sub, disc, total := computeTotals(items, 350)
	if sub != 3500 {
		t.Errorf("subtotal: want 3500, got %d", sub)
	}
	if disc != 350 {
		t.Errorf("discount: want 350, got %d", disc)
	}
	if total != 3150 {
		t.Errorf("total: want 3150, got %d", total)
	}
}

func TestComputeTotals_DiscountCappedToSubtotal(t *testing.T) {
	// A coupon bigger than the subtotal should not produce a negative total.
	items := []repository.CartItem{
		{Quantity: 1, UnitPrice: 200},
	}
	sub, disc, total := computeTotals(items, 1000)
	if sub != 200 {
		t.Errorf("subtotal: want 200, got %d", sub)
	}
	if disc != 200 {
		t.Errorf("discount should be capped to subtotal=200, got %d", disc)
	}
	if total != 0 {
		t.Errorf("total: want 0, got %d", total)
	}
}

func TestComputeTotals_NegativeDiscountClamped(t *testing.T) {
	items := []repository.CartItem{
		{Quantity: 1, UnitPrice: 1000},
	}
	sub, disc, total := computeTotals(items, -50)
	if sub != 1000 || disc != 0 || total != 1000 {
		t.Errorf("negative discount should clamp to 0; got sub=%d disc=%d total=%d", sub, disc, total)
	}
}

func TestComputeTotals_EmptyItems(t *testing.T) {
	sub, disc, total := computeTotals(nil, 100)
	if sub != 0 || total != 0 {
		t.Errorf("empty cart should be zeroes; got sub=%d total=%d", sub, total)
	}
	// Discount capped to subtotal = 0.
	if disc != 0 {
		t.Errorf("discount should cap at 0 for empty cart, got %d", disc)
	}
}
