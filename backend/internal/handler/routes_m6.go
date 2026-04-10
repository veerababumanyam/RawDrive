package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// requireAdmin is middleware that restricts access to users with Admin or Owner role.
func requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.JWTClaimsFromContext(r.Context())
		if claims == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		role, _ := claims["role"].(string)
		if role != "Admin" && role != "Owner" && role != "super_admin" {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// M6Dependencies holds all dependencies needed for M6 route registration.
type M6Dependencies struct {
	DB              *pgxpool.Pool
	DealerRepo      *repository.DealerRepo
	CouponRepo      *repository.CouponRepo
	MarginRepo      *repository.MarginRepo
	PayoutRepo      *repository.PayoutRepo
	KycDocumentRepo *repository.KycDocumentRepo
	DealerAnalytics *service.DealerAnalyticsService
}

// RegisterM6Routes registers all M6 (Revenue & Dealership Engine) routes.
func RegisterM6Routes(r chi.Router, deps M6Dependencies) {
	dealerSvc := service.NewDealerService(deps.DealerRepo)
	marginSvc := service.NewMarginService(deps.MarginRepo, deps.DealerRepo)
	couponValidationSvc := service.NewCouponValidationService(deps.CouponRepo)

	dealerHandler := NewDealerHandler(dealerSvc)
	marginHandler := NewMarginHandler(marginSvc)
	couponHandler := NewCouponHandler(deps.CouponRepo)
	couponHandler.dealerRepo = deps.DealerRepo
	couponValidationHandler := NewCouponValidationHandler(couponValidationSvc)
	payoutHandler := NewPayoutHandler(deps.PayoutRepo)
	payoutHandler.dealerRepo = deps.DealerRepo

	// Admin dealer management (requires Admin/Owner role)
	r.Route("/api/v1/admin/dealers", func(r chi.Router) {
		r.Use(requireAdmin)
		r.Post("/", dealerHandler.Create)
		r.Get("/", dealerHandler.List)
		r.Put("/{id}/approve", dealerHandler.Approve)
		r.Put("/{id}/reject", dealerHandler.Reject)
		r.Put("/{id}/suspend", dealerHandler.Suspend)
	})

	// Dealer self-service
	r.Route("/api/v1/dealers", func(r chi.Router) {
		r.Get("/dashboard", dealerHandler.Dashboard)
		r.Get("/coupons", couponHandler.ListDealerCoupons)
		r.Post("/coupons", couponHandler.CreateDealerCoupon)
		r.Get("/payouts", payoutHandler.ListPayouts)
		r.Get("/statements", payoutHandler.ListStatements)
		r.Get("/statements/{month}/pdf", payoutHandler.DownloadStatementPDF)
	})

	// Admin margins (requires Admin/Owner role)
	r.Route("/api/v1/admin/margins", func(r chi.Router) {
		r.Use(requireAdmin)
		r.Put("/", marginHandler.Configure)
		r.Get("/", marginHandler.ListMargins)
		r.Get("/history", marginHandler.GetHistory)
	})

	// Admin coupons (requires Admin/Owner role)
	r.Route("/api/v1/admin/coupons", func(r chi.Router) {
		r.Use(requireAdmin)
		r.Post("/", couponHandler.CreateAdminCoupon)
		r.Get("/", couponHandler.ListAdminCoupons)
	})

	// Admin payouts (requires Admin/Owner role)
	r.Route("/api/v1/admin/payouts", func(r chi.Router) {
		r.Use(requireAdmin)
		r.Post("/{id}/approve", payoutHandler.ApprovePayout)
		r.Post("/{id}/confirm-payment", payoutHandler.ConfirmPayment)
	})

	// Coupon validation (onboarding flow)
	r.Post("/api/v1/onboarding/coupon", couponValidationHandler.ValidateCoupon)

	// M6 gap-fill: KYC documents (dealer self-service + admin review)
	if deps.KycDocumentRepo != nil {
		kycHandler := NewKycHandler(deps.KycDocumentRepo, deps.DealerRepo)
		r.Route("/api/v1/dealer/kyc-documents", func(r chi.Router) {
			r.Post("/", kycHandler.Create)
			r.Get("/", kycHandler.List)
		})
		r.Route("/api/v1/admin/kyc-documents", func(r chi.Router) {
			r.Use(requireAdmin)
			r.Patch("/{id}", kycHandler.AdminReview)
		})
	}

	// M6 gap-fill: dealer analytics dashboard with period selection.
	// GET /api/v1/dealer/analytics?period=current_month|last_month|last_7_days|
	//   last_30_days|last_quarter|custom&from=RFC3339&to=RFC3339
	if deps.DealerAnalytics != nil {
		analyticsHandler := NewDealerAnalyticsHandler(deps.DealerAnalytics, deps.DealerRepo)
		r.Get("/api/v1/dealer/analytics", analyticsHandler.Dashboard)
	}
}
