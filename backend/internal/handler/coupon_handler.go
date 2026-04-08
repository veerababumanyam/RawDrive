package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type CouponHandler struct {
	repo      *repository.CouponRepo
	svc       *service.CouponService
	dealerRepo *repository.DealerRepo
}

func NewCouponHandler(repo *repository.CouponRepo) *CouponHandler {
	return &CouponHandler{
		repo: repo,
		svc:  service.NewCouponService(repo),
	}
}

func (h *CouponHandler) ListDealerCoupons(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Resolve dealer from user
	if h.dealerRepo != nil {
		dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
		if err != nil {
			http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
			return
		}
		dealerID := dealer.ID
		coupons, err := h.repo.List(r.Context(), repository.CouponFilter{DealerID: &dealerID, Limit: 25})
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		respondJSON(w, http.StatusOK, coupons)
		return
	}

	// Fallback: list all (admin context)
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

	// Resolve dealer from user
	if h.dealerRepo != nil {
		dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
		if err != nil {
			http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
			return
		}
		// Use service layer for cap enforcement (default cap: 50 per state)
		if err := h.svc.CreateDealerCoupon(r.Context(), userID, dealer.ID, dealer.StateID, &c, 50); err != nil {
			switch err {
			case service.ErrCouponCapExceeded:
				http.Error(w, `{"error":"coupon cap exceeded for your state"}`, http.StatusForbidden)
			case service.ErrDuplicateCoupon:
				http.Error(w, `{"error":"duplicate coupon code"}`, http.StatusConflict)
			default:
				if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
					http.Error(w, `{"error":"duplicate coupon code"}`, http.StatusConflict)
				} else {
					http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				}
			}
			return
		}
	} else {
		c.CreatedBy = userID
		c.OwnerType = "dealer"
		c.Code = strings.ToUpper(c.Code)
		if err := h.repo.Create(r.Context(), &c); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
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
	if err := h.svc.CreateAdminCoupon(r.Context(), userID, &c); err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, `{"error":"duplicate coupon code"}`, http.StatusConflict)
		} else {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
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
