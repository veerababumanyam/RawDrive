package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// M6Dependencies holds all dependencies needed for M6 route registration.
type M6Dependencies struct {
	DB         *pgxpool.Pool
	DealerRepo *repository.DealerRepo
	CouponRepo *repository.CouponRepo
	MarginRepo *repository.MarginRepo
	PayoutRepo *repository.PayoutRepo
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

	// Admin dealer management
	r.Route("/api/v1/admin/dealers", func(r chi.Router) {
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

	// Admin margins
	r.Route("/api/v1/admin/margins", func(r chi.Router) {
		r.Put("/", marginHandler.Configure)
		r.Get("/", marginHandler.ListMargins)
		r.Get("/history", marginHandler.GetHistory)
	})

	// Admin coupons
	r.Route("/api/v1/admin/coupons", func(r chi.Router) {
		r.Post("/", couponHandler.CreateAdminCoupon)
		r.Get("/", couponHandler.ListAdminCoupons)
	})

	// Admin payouts
	r.Route("/api/v1/admin/payouts", func(r chi.Router) {
		r.Post("/{id}/approve", payoutHandler.ApprovePayout)
		r.Post("/{id}/confirm-payment", payoutHandler.ConfirmPayment)
	})

	// Coupon validation (onboarding flow)
	r.Post("/api/v1/onboarding/coupon", couponValidationHandler.ValidateCoupon)
}
