package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rawdrive/backend/internal/repository"
)

type CouponHandler struct {
	repo *repository.CouponRepo
}

func NewCouponHandler(repo *repository.CouponRepo) *CouponHandler {
	return &CouponHandler{repo: repo}
}

func (h *CouponHandler) ListDealerCoupons(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	// In a real impl, look up dealer by userID to get dealerID
	_ = userID
	coupons, err := h.repo.List(r.Context(), repository.CouponFilter{Limit: 25})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, coupons)
}

func (h *CouponHandler) CreateDealerCoupon(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var c repository.Coupon
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	c.CreatedBy = userID
	c.OwnerType = "dealer"
	c.Code = strings.ToUpper(c.Code)
	if err := h.repo.Create(r.Context(), &c); err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, `{"error":"duplicate coupon code"}`, http.StatusConflict)
		} else {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
		return
	}
	respondJSON(w, http.StatusCreated, c)
}

func (h *CouponHandler) CreateAdminCoupon(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var c repository.Coupon
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	c.CreatedBy = userID
	c.OwnerType = "admin"
	c.Code = strings.ToUpper(c.Code)
	if err := h.repo.Create(r.Context(), &c); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, c)
}

func (h *CouponHandler) ListAdminCoupons(w http.ResponseWriter, r *http.Request) {
	coupons, err := h.repo.List(r.Context(), repository.CouponFilter{Limit: 25})
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, coupons)
}
