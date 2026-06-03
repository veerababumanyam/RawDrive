package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/service"
)

type CouponValidationHandler struct {
	svc *service.CouponValidationService
}

func NewCouponValidationHandler(svc *service.CouponValidationService) *CouponValidationHandler {
	return &CouponValidationHandler{svc: svc}
}

func (h *CouponValidationHandler) ValidateCoupon(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var body struct {
		CouponCode string `json:"coupon_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CouponCode == "" {
		http.Error(w, `{"code":"INVALID_FORMAT","message":"coupon_code is required"}`, http.StatusBadRequest)
		return
	}

	// Extract plan_id and state_id from query params (set by onboarding frontend)
	var planID *uuid.UUID
	var stateID *int
	if pid := r.URL.Query().Get("plan_id"); pid != "" {
		if parsed, err := uuid.Parse(pid); err == nil {
			planID = &parsed
		}
	}
	if sid := r.URL.Query().Get("state_id"); sid != "" {
		if parsed, err := strconv.Atoi(sid); err == nil {
			stateID = &parsed
		}
	}

	coupon, err := h.svc.ValidateCoupon(r.Context(), body.CouponCode, userID, planID, stateID)
	if err != nil {
		switch err {
		case service.ErrCouponNotFound:
			http.Error(w, `{"code":"NOT_FOUND","message":"Coupon not found"}`, http.StatusNotFound)
		case service.ErrCouponExpired:
			http.Error(w, `{"code":"EXPIRED","message":"This coupon has expired"}`, http.StatusConflict)
		case service.ErrCouponExhausted:
			http.Error(w, `{"code":"EXHAUSTED","message":"Coupon redemption limit reached"}`, http.StatusConflict)
		case service.ErrCouponInactive:
			http.Error(w, `{"code":"INACTIVE","message":"Coupon is inactive"}`, http.StatusConflict)
		case service.ErrCouponAlreadyUsedByUser:
			http.Error(w, `{"code":"ALREADY_USED","message":"Coupon already used"}`, http.StatusConflict)
		case service.ErrCouponNotApplicablePlan:
			http.Error(w, `{"code":"NOT_APPLICABLE_PLAN","message":"Coupon not valid for this plan"}`, http.StatusConflict)
		case service.ErrCouponNotApplicableState:
			http.Error(w, `{"code":"NOT_APPLICABLE_STATE","message":"Coupon not valid for this state"}`, http.StatusUnprocessableEntity)
		default:
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
		return
	}

	// Calculate discount preview — resolve plan amount from query param or use onboarding default
	originalPaisa := int64(199900)
	if amtStr := r.URL.Query().Get("plan_amount_paisa"); amtStr != "" {
		if amt, err := strconv.ParseInt(amtStr, 10, 64); err == nil && amt > 0 {
			originalPaisa = amt
		}
	}
	discount := service.CalculateDiscount(coupon, originalPaisa)

	resp := service.CouponValidationResponse{
		CouponCode:            coupon.Code,
		DiscountType:          coupon.CouponType,
		DiscountValue:         coupon.DiscountValue,
		Applicable:            true,
		OriginalAmountPaisa:   originalPaisa,
		DiscountedAmountPaisa: originalPaisa - discount,
		DealerID:              coupon.DealerID,
	}
	respondJSON(w, http.StatusOK, resp)
}
