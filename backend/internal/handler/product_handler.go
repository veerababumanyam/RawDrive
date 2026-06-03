package handler

// product_handler.go — M14 GAL-FR-155: gallery product catalog HTTP.
//
// Routes are mounted by routes_m2.go under /api/v1/galleries/{id}/products
// behind the JWT middleware (studio admins manage their own galleries),
// plus a public read-only list at /api/v1/public/galleries/{slug}/products
// wired separately.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// ProductHandler handles gallery_products HTTP requests.
type ProductHandler struct {
	svc *service.ProductService
}

// NewProductHandler constructs a ProductHandler.
func NewProductHandler(svc *service.ProductService) *ProductHandler {
	return &ProductHandler{svc: svc}
}

// List handles GET /galleries/{id}/products
func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	products, err := h.svc.List(r.Context(), galleryID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "product_list_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, products)
}

// Create handles POST /galleries/{id}/products
func (h *ProductHandler) Create(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	var in service.ProductInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_json", "invalid json body")
		return
	}
	wsIDStr := middleware.WorkspaceIDFromContext(r.Context())
	wsID, _ := uuid.Parse(wsIDStr)

	product, err := h.svc.Create(r.Context(), galleryID, wsID, in)
	if err != nil {
		respondProductError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, product)
}

// Get handles GET /galleries/{id}/products/{productId}
func (h *ProductHandler) Get(w http.ResponseWriter, r *http.Request) {
	productID, err := uuid.Parse(chi.URLParam(r, "productId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_product_id", "invalid product id")
		return
	}
	product, err := h.svc.Get(r.Context(), productID)
	if err != nil {
		if errors.Is(err, service.ErrProductNotFound) {
			respondError(w, http.StatusNotFound, "product_not_found", "product not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "product_get_failed", err.Error())
		return
	}
	respondJSON(w, http.StatusOK, product)
}

// Update handles PUT /galleries/{id}/products/{productId}
func (h *ProductHandler) Update(w http.ResponseWriter, r *http.Request) {
	productID, err := uuid.Parse(chi.URLParam(r, "productId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_product_id", "invalid product id")
		return
	}
	var in service.ProductInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_json", "invalid json body")
		return
	}
	product, err := h.svc.Update(r.Context(), productID, in)
	if err != nil {
		respondProductError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, product)
}

// Delete handles DELETE /galleries/{id}/products/{productId}
func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	productID, err := uuid.Parse(chi.URLParam(r, "productId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_product_id", "invalid product id")
		return
	}
	if err := h.svc.Delete(r.Context(), productID); err != nil {
		respondError(w, http.StatusInternalServerError, "product_delete_failed", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListPublicBySlug handles GET /public/galleries/{slug}/products.
// The handler resolves the slug via a GalleryResolver to list products
// for the matching gallery without requiring client auth.
type GalleryResolver interface {
	ResolveSlugToID(ctx context.Context, slug string) (uuid.UUID, error)
}

// ListPublicBySlug returns an http handler that resolves a slug and then
// returns the active product list for that gallery.
func (h *ProductHandler) ListPublicBySlug(resolver GalleryResolver) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		if slug == "" {
			respondError(w, http.StatusBadRequest, "missing_slug", "slug required")
			return
		}
		galleryID, err := resolver.ResolveSlugToID(r.Context(), slug)
		if err != nil {
			respondError(w, http.StatusNotFound, "gallery_not_found", "gallery not found")
			return
		}
		products, err := h.svc.List(r.Context(), galleryID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "product_list_failed", err.Error())
			return
		}
		respondJSON(w, http.StatusOK, products)
	}
}

// respondProductError maps product errors to HTTP status codes using the
// standardized error envelope (M14 GAL-FR-202).
func respondProductError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrProductNotFound):
		respondError(w, http.StatusNotFound, "product_not_found", err.Error())
	case errors.Is(err, service.ErrProductNameRequired),
		errors.Is(err, service.ErrProductInvalidType),
		errors.Is(err, service.ErrProductInvalidPrice),
		errors.Is(err, service.ErrProductInvalidConfig):
		respondError(w, http.StatusBadRequest, "product_validation", err.Error())
	default:
		respondError(w, http.StatusInternalServerError, "product_error", err.Error())
	}
}
