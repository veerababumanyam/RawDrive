package service

// product_service.go — M14 GAL-FR-155: gallery product catalog.
//
// Provides business-logic wrappers around the product repository with
// validation and scope rules. The service is intentionally thin — the
// complexity is in the cart/order math, not here — so studios can add
// products to a gallery with minimal ceremony.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// Product validation errors surfaced to handlers.
var (
	ErrProductNameRequired  = errors.New("product: name required")
	ErrProductInvalidType   = errors.New("product: invalid type")
	ErrProductInvalidPrice  = errors.New("product: price must be non-negative")
	ErrProductNotFound      = errors.New("product: not found")
	ErrProductInvalidConfig = errors.New("product: invalid config json")
)

// validProductTypes are the supported product_type values.
var validProductTypes = map[string]bool{
	repository.ProductTypeDigital: true,
	repository.ProductTypePrint:   true,
	repository.ProductTypeAlbum:   true,
	repository.ProductTypeBundle:  true,
}

// ProductService owns gallery product catalog operations.
type ProductService struct {
	repo *repository.ProductRepo
}

// NewProductService constructs a ProductService.
func NewProductService(repo *repository.ProductRepo) *ProductService {
	return &ProductService{repo: repo}
}

// ProductInput is the create/update payload from handlers.
type ProductInput struct {
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	ProductType   string          `json:"product_type"`
	PriceAmount   int             `json:"price_amount"`
	PriceCurrency string          `json:"price_currency"`
	AssetID       *uuid.UUID      `json:"asset_id,omitempty"`
	Config        json.RawMessage `json:"config,omitempty"`
	IsActive      bool            `json:"is_active"`
}

// validateInput runs the pure-logic checks without touching the repo.
func validateProductInput(in ProductInput) error {
	if strings.TrimSpace(in.Name) == "" {
		return ErrProductNameRequired
	}
	if !validProductTypes[in.ProductType] {
		return fmt.Errorf("%w: %q", ErrProductInvalidType, in.ProductType)
	}
	if in.PriceAmount < 0 {
		return ErrProductInvalidPrice
	}
	if len(in.Config) > 0 && !json.Valid(in.Config) {
		return ErrProductInvalidConfig
	}
	return nil
}

// Create adds a new product to a gallery.
func (s *ProductService) Create(ctx context.Context, galleryID, workspaceID uuid.UUID, in ProductInput) (*repository.GalleryProduct, error) {
	if err := validateProductInput(in); err != nil {
		return nil, err
	}
	p := &repository.GalleryProduct{
		GalleryID:     galleryID,
		WorkspaceID:   workspaceID,
		Name:          strings.TrimSpace(in.Name),
		Description:   in.Description,
		ProductType:   in.ProductType,
		PriceAmount:   in.PriceAmount,
		PriceCurrency: strings.ToUpper(in.PriceCurrency),
		AssetID:       in.AssetID,
		Config:        in.Config,
		IsActive:      in.IsActive,
	}
	if p.PriceCurrency == "" {
		p.PriceCurrency = "INR"
	}
	if err := s.repo.Create(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// List returns active products for a gallery.
func (s *ProductService) List(ctx context.Context, galleryID uuid.UUID) ([]repository.GalleryProduct, error) {
	return s.repo.ListByGallery(ctx, galleryID)
}

// Get returns a single product by ID.
func (s *ProductService) Get(ctx context.Context, id uuid.UUID) (*repository.GalleryProduct, error) {
	p, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrProductNotFound
	}
	return p, nil
}

// Update modifies a product in-place. WorkspaceID and GalleryID are immutable.
func (s *ProductService) Update(ctx context.Context, id uuid.UUID, in ProductInput) (*repository.GalleryProduct, error) {
	if err := validateProductInput(in); err != nil {
		return nil, err
	}
	p, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrProductNotFound
	}
	p.Name = strings.TrimSpace(in.Name)
	p.Description = in.Description
	p.PriceAmount = in.PriceAmount
	if in.PriceCurrency != "" {
		p.PriceCurrency = strings.ToUpper(in.PriceCurrency)
	}
	p.Config = in.Config
	p.IsActive = in.IsActive
	if err := s.repo.Update(ctx, p); err != nil {
		return nil, err
	}
	return p, nil
}

// Delete soft-deletes a product.
func (s *ProductService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}
