package handler

import (
	"context"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// M5Dependencies holds all dependencies needed for M5 route registration.
type M5Dependencies struct {
	DB             *pgxpool.Pool
	FreelancerRepo *repository.FreelancerRepo
	GearRepo       *repository.GearRepo
	MessagingRepo  *repository.MessagingRepo
	ModerationRepo *repository.ModerationRepo
	Events         EventPublisher
}

// RegisterM5PublicRoutes registers the subset of M5 routes that are
// intentionally reachable without a bearer token: freelancer listing
// browse, listing detail, listing availability, and gear browse/detail.
// Must be mounted OUTSIDE the JWTAuth-protected API group — previously
// these were nested inside the authed group behind the "public routes
// (no auth required)" comment, which made the comment a lie: anonymous
// browsers could not reach them. Mount on the root router before any
// auth middleware so the marketplace is truly public.
func RegisterM5PublicRoutes(r chi.Router, deps M5Dependencies) {
	marketplaceHandler := NewMarketplaceHandler(deps.FreelancerRepo)
	gearHandler := NewGearHandler(deps.GearRepo, deps.ModerationRepo)

	r.Route("/api/v1/marketplace", func(r chi.Router) {
		r.Get("/freelancers", marketplaceHandler.ListFreelancers)
		r.Get("/freelancers/{id}", marketplaceHandler.GetFreelancer)
		r.Get("/freelancers/{id}/availability", marketplaceHandler.GetFreelancerAvailability)
		r.Get("/gear", gearHandler.ListGear)
		r.Get("/gear/{id}", gearHandler.GetGear)
	})
}

// RegisterM5Routes registers all M5 (Marketplaces & Communication) routes.
func RegisterM5Routes(r chi.Router, deps M5Dependencies) {
	// M5 gap-audit fix: introduce a service layer wrapping the M5 repos so
	// hire-request CRUD, review creation, and gear booking conflict checks
	// route through a single validated entry point (matches M4/M6/M7 style).
	marketplaceSvc := service.NewMarketplaceService(
		deps.FreelancerRepo,
		deps.GearRepo,
		deps.MessagingRepo,
		deps.ModerationRepo,
	)

	marketplaceHandler := NewMarketplaceHandler(deps.FreelancerRepo)
	gearHandler := NewGearHandler(deps.GearRepo, deps.ModerationRepo)
	// Wire conflict check only when the gear repo is present (tests that pass
	// zero-value deps will skip the check, matching other M5 handlers).
	if deps.GearRepo != nil {
		gearHandler = gearHandler.WithBookingConflictCheck(func(ctx context.Context, gearID uuid.UUID, start, end time.Time) (bool, error) {
			return deps.GearRepo.BookingConflictCheck(ctx, gearID, start, end)
		})
	}
	hireRequestHandler := NewHireRequestHandler(marketplaceSvc, deps.FreelancerRepo)
	messagingHandler := NewMessagingHandler(deps.MessagingRepo, deps.ModerationRepo, deps.Events)
	moderationHandler := NewModerationHandler(deps.ModerationRepo)

	// Marketplace routes (authenticated subset). The public
	// browse/detail/availability GET routes are registered separately
	// via RegisterM5PublicRoutes() on the root router so anonymous
	// visitors can hit them without a JWT. We use full path strings
	// here instead of r.Route("/api/v1/marketplace") because chi
	// refuses to Mount a second subrouter on a prefix the public
	// registration already claimed — the attempted mount would panic
	// at startup.
	r.Get("/api/v1/freelancer-profile/mine", marketplaceHandler.GetMyFreelancerListing)
	r.Get("/api/v1/gear/mine", gearHandler.GetMyGear)
	r.Post("/api/v1/marketplace/freelancers", marketplaceHandler.CreateFreelancerListing)
	r.Put("/api/v1/marketplace/freelancers/{id}", marketplaceHandler.UpdateFreelancerListing)
	r.Put("/api/v1/marketplace/freelancers/{id}/availability", marketplaceHandler.UpdateFreelancerAvailability)

	r.Post("/api/v1/marketplace/gear", gearHandler.CreateGearListing)
	r.Put("/api/v1/marketplace/gear/{id}", gearHandler.UpdateGearListing)
	r.Delete("/api/v1/marketplace/gear/{id}", gearHandler.DeleteGearListing)

	r.Post("/api/v1/marketplace/gear/{id}/bookings", gearHandler.CreateBooking)
	r.Put("/api/v1/marketplace/gear/bookings/{bookingId}", gearHandler.UpdateBookingStatus)

	r.Post("/api/v1/marketplace/inquiries", marketplaceHandler.CreateInquiry)
	r.Get("/api/v1/marketplace/inquiries", marketplaceHandler.ListInquiries)
	r.Put("/api/v1/marketplace/inquiries/{id}", marketplaceHandler.UpdateInquiry)
	// /api/v1/marketplace/inquiries/{id}/* would be swallowed by the
	// public subrouter mounted at /api/v1/marketplace. Use a separate
	// prefix (no subrouter conflict) — same pattern as /freelancer-profile/mine.
	r.Get("/api/v1/inquiry/{id}/messages", marketplaceHandler.GetInquiryMessages)
	r.Post("/api/v1/inquiry/{id}/messages", marketplaceHandler.SendInquiryMessage)

	r.Post("/api/v1/marketplace/freelancers/{id}/hire", hireRequestHandler.CreateHireRequest)
	r.Get("/api/v1/marketplace/hire-requests", hireRequestHandler.ListHireRequests)
	r.Patch("/api/v1/marketplace/hire-requests/{id}/status", hireRequestHandler.UpdateHireRequestStatus)

	r.Post("/api/v1/marketplace/freelancers/{id}/reviews", hireRequestHandler.CreateFreelancerReview)

	// Messaging routes (all authenticated)
	r.Route("/api/v1/messages", func(r chi.Router) {
		r.Get("/", capabilityIndex("messages", []string{"channels", "channels/{channelId}/messages", "search"}))
		r.Get("/channels", messagingHandler.ListChannels)
		r.Post("/channels", messagingHandler.CreateChannel)
		r.Get("/channels/{channelId}/messages", messagingHandler.GetMessages)
		r.Post("/channels/{channelId}/messages", messagingHandler.SendMessage)
		r.Put("/{messageId}", messagingHandler.EditMessage)
		r.Delete("/{messageId}", messagingHandler.DeleteMessage)
		r.Get("/search", messagingHandler.SearchMessages)
	})

	// Moderation routes (authenticated, admin-gated at application level)
	r.Route("/api/v1/moderation", func(r chi.Router) {
		r.Post("/report", moderationHandler.ReportContent)
		r.Get("/queue", moderationHandler.GetQueue)
		r.Put("/{id}", moderationHandler.ResolveItem)
	})
}
