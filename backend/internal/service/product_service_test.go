package service

// product_service_test.go — pure-logic tests for ProductService that
// don't touch the database. Repo-backed paths are covered by
// integration tests under backend/internal/database.

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/rawdrive/backend/internal/repository"
)

func TestValidateProductInput_RejectsEmptyName(t *testing.T) {
	in := ProductInput{
		Name:        "   ",
		ProductType: repository.ProductTypeDigital,
		PriceAmount: 1000,
	}
	if err := validateProductInput(in); !errors.Is(err, ErrProductNameRequired) {
		t.Errorf("want ErrProductNameRequired, got %v", err)
	}
}

func TestValidateProductInput_RejectsInvalidType(t *testing.T) {
	in := ProductInput{
		Name:        "Test",
		ProductType: "not-a-type",
		PriceAmount: 1000,
	}
	err := validateProductInput(in)
	if !errors.Is(err, ErrProductInvalidType) {
		t.Errorf("want ErrProductInvalidType, got %v", err)
	}
}

func TestValidateProductInput_RejectsNegativePrice(t *testing.T) {
	in := ProductInput{
		Name:        "Test",
		ProductType: repository.ProductTypePrint,
		PriceAmount: -1,
	}
	if err := validateProductInput(in); !errors.Is(err, ErrProductInvalidPrice) {
		t.Errorf("want ErrProductInvalidPrice, got %v", err)
	}
}

func TestValidateProductInput_AllowsZeroPrice(t *testing.T) {
	// Zero price is legal (e.g. free digital download as promo).
	in := ProductInput{
		Name:        "Free sample",
		ProductType: repository.ProductTypeDigital,
		PriceAmount: 0,
	}
	if err := validateProductInput(in); err != nil {
		t.Errorf("zero price should be allowed, got %v", err)
	}
}

func TestValidateProductInput_RejectsInvalidJSONConfig(t *testing.T) {
	in := ProductInput{
		Name:        "Test",
		ProductType: repository.ProductTypeAlbum,
		PriceAmount: 50000,
		Config:      json.RawMessage("{not json"),
	}
	if err := validateProductInput(in); !errors.Is(err, ErrProductInvalidConfig) {
		t.Errorf("want ErrProductInvalidConfig, got %v", err)
	}
}

func TestValidateProductInput_AcceptsEmptyConfig(t *testing.T) {
	in := ProductInput{
		Name:        "Test",
		ProductType: repository.ProductTypeBundle,
		PriceAmount: 100000,
	}
	if err := validateProductInput(in); err != nil {
		t.Errorf("empty config should be legal: %v", err)
	}
}

func TestValidateProductInput_AcceptsAllValidTypes(t *testing.T) {
	types := []string{
		repository.ProductTypeDigital,
		repository.ProductTypePrint,
		repository.ProductTypeAlbum,
		repository.ProductTypeBundle,
	}
	for _, tp := range types {
		in := ProductInput{
			Name:        "Test " + tp,
			ProductType: tp,
			PriceAmount: 500,
		}
		if err := validateProductInput(in); err != nil {
			t.Errorf("type %q should be valid: %v", tp, err)
		}
	}
}
