package handler

// cart_handler.go — M14 GAL-FR-158: persistent gallery cart HTTP.
//
// The cart is addressable by (gallery_id, client_email). The client_email
// comes from the query string on GET and the request body on POST/DELETE.
// These routes are mounted under the public gallery group — no auth —
// since anonymous visitors shop on public gallery pages.

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// CartHandler handles gallery cart HTTP requests.
type CartHandler struct {
	svc *service.CartService
}

// NewCartHandler constructs a CartHandler.
func NewCartHandler(svc *service.CartService) *CartHandler {
	return &CartHandler{svc: svc}
}

// Upsert handles POST /galleries/{id}/cart
func (h *CartHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	var in service.CartInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_json", "invalid json body")
		return
	}
	cart, err := h.svc.UpsertCart(r.Context(), galleryID, in)
	if err != nil {
		respondCartError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, cart)
}

// Get handles GET /galleries/{id}/cart?email=client@example.com
func (h *CartHandler) Get(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	email := r.URL.Query().Get("email")
	if email == "" {
		respondError(w, http.StatusBadRequest, "missing_email", "email query param required")
		return
	}
	cart, err := h.svc.GetCart(r.Context(), galleryID, email)
	if err != nil {
		respondCartError(w, err)
		return
	}
	if cart == nil {
		respondJSON(w, http.StatusOK, map[string]any{"items": []any{}, "subtotal": 0, "total": 0})
		return
	}
	respondJSON(w, http.StatusOK, cart)
}

// Clear handles DELETE /galleries/{id}/cart?email=client@example.com
func (h *CartHandler) Clear(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	email := r.URL.Query().Get("email")
	if email == "" {
		respondError(w, http.StatusBadRequest, "missing_email", "email query param required")
		return
	}
	if err := h.svc.ClearCart(r.Context(), galleryID, email); err != nil {
		respondError(w, http.StatusInternalServerError, "cart_clear_failed", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// respondCartError maps cart errors to HTTP status codes using the
// standardized error envelope.
func respondCartError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrCartEmptyEmail),
		errors.Is(err, service.ErrCartEmptyItems),
		errors.Is(err, service.ErrCartInvalidQuantity),
		errors.Is(err, service.ErrCartCurrencyMismatch):
		respondError(w, http.StatusBadRequest, "cart_validation", err.Error())
	case errors.Is(err, service.ErrCartProductInactive):
		respondError(w, http.StatusNotFound, "cart_product_not_found", err.Error())
	default:
		respondError(w, http.StatusInternalServerError, "cart_error", err.Error())
	}
}
