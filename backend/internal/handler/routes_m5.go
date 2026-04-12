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

	// Marketplace routes
	r.Route("/api/v1/marketplace", func(r chi.Router) {
		// Public routes (no auth required)
		r.Get("/freelancers", marketplaceHandler.ListFreelancers)
		r.Get("/freelancers/{id}", marketplaceHandler.GetFreelancer)
		// Availability is public-readable (clients browsing the
		// marketplace need to see "next available" on the card).
		r.Get("/freelancers/{id}/availability", marketplaceHandler.GetFreelancerAvailability)
		r.Get("/gear", gearHandler.ListGear)
		r.Get("/gear/{id}", gearHandler.GetGear)

		// Authenticated routes
		r.Group(func(r chi.Router) {
			// Freelancer listings
			r.Post("/freelancers", marketplaceHandler.CreateFreelancerListing)
			r.Put("/freelancers/{id}", marketplaceHandler.UpdateFreelancerListing)
			// Availability (authenticated mutation). The GET is
			// public above.
			r.Put("/freelancers/{id}/availability", marketplaceHandler.UpdateFreelancerAvailability)

			// Gear listings
			r.Post("/gear", gearHandler.CreateGearListing)
			r.Put("/gear/{id}", gearHandler.UpdateGearListing)
			r.Delete("/gear/{id}", gearHandler.DeleteGearListing)

			// Gear bookings (GAP-002 fix)
			r.Post("/gear/{id}/bookings", gearHandler.CreateBooking)
			r.Put("/gear/bookings/{bookingId}", gearHandler.UpdateBookingStatus)

			// Inquiries
			r.Post("/inquiries", marketplaceHandler.CreateInquiry)
			r.Get("/inquiries", marketplaceHandler.ListInquiries)
			r.Put("/inquiries/{id}", marketplaceHandler.UpdateInquiry)

			// Hire requests (M5 gap-audit fix — previously repo-only)
			r.Post("/freelancers/{id}/hire", hireRequestHandler.CreateHireRequest)
			r.Get("/hire-requests", hireRequestHandler.ListHireRequests)
			r.Patch("/hire-requests/{id}/status", hireRequestHandler.UpdateHireRequestStatus)

			// Freelancer reviews (counterpart to existing ListReviews)
			r.Post("/freelancers/{id}/reviews", hireRequestHandler.CreateFreelancerReview)
		})
	})

	// Messaging routes (all authenticated)
	r.Route("/api/v1/messages", func(r chi.Router) {
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
