package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/repository"
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
	marketplaceHandler := NewMarketplaceHandler(deps.FreelancerRepo)
	gearHandler := NewGearHandler(deps.GearRepo, deps.ModerationRepo)
	messagingHandler := NewMessagingHandler(deps.MessagingRepo, deps.ModerationRepo, deps.Events)
	moderationHandler := NewModerationHandler(deps.ModerationRepo)

	// Marketplace routes
	r.Route("/api/v1/marketplace", func(r chi.Router) {
		// Public routes (no auth required)
		r.Get("/freelancers", marketplaceHandler.ListFreelancers)
		r.Get("/freelancers/{id}", marketplaceHandler.GetFreelancer)
		r.Get("/gear", gearHandler.ListGear)
		r.Get("/gear/{id}", gearHandler.GetGear)

		// Authenticated routes
		r.Group(func(r chi.Router) {
			// Freelancer listings
			r.Post("/freelancers", marketplaceHandler.CreateFreelancerListing)
			r.Put("/freelancers/{id}", marketplaceHandler.UpdateFreelancerListing)

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
