package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

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

	// Admin dealer management (requires platform admin)
	r.Route("/api/v1/admin/dealers", func(r chi.Router) {
		r.Use(middleware.RequirePlatformRole("admin", "super_admin"))
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

	// Admin margins (requires platform admin)
	r.Route("/api/v1/admin/margins", func(r chi.Router) {
		r.Use(middleware.RequirePlatformRole("admin", "super_admin"))
		r.Put("/", marginHandler.Configure)
		r.Get("/", marginHandler.ListMargins)
		r.Get("/history", marginHandler.GetHistory)
	})

	// Admin coupons (requires platform admin)
	r.Route("/api/v1/admin/coupons", func(r chi.Router) {
		r.Use(middleware.RequirePlatformRole("admin", "super_admin"))
		r.Post("/", couponHandler.CreateAdminCoupon)
		r.Get("/", couponHandler.ListAdminCoupons)
	})

	// Admin payouts (requires platform admin)
	r.Route("/api/v1/admin/payouts", func(r chi.Router) {
		r.Use(middleware.RequirePlatformRole("admin", "super_admin"))
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
			r.Use(middleware.RequirePlatformRole("admin", "super_admin"))
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
