package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/service"
)

// M8Dependencies holds all dependencies needed for M8 route registration.
type M8Dependencies struct {
	StreamService  *service.StreamService
	VideoService   *service.VideoService
	DesktopService *service.DesktopService
}

// RegisterM8Routes registers all M8 (Live Streaming & Desktop Companion) routes.
func RegisterM8Routes(r chi.Router, deps M8Dependencies) {
	streamHandler := NewStreamHandler(deps.StreamService)
	videoHandler := NewVideoHandler(deps.VideoService)
	desktopHandler := NewDesktopHandler(deps.DesktopService)

	// Stream management (authenticated)
	r.Route("/api/v1/streams", func(r chi.Router) {
		r.Post("/", streamHandler.Create)
		r.Get("/", streamHandler.List)
		r.Get("/{id}", streamHandler.Get)
		r.Put("/{id}/start", streamHandler.Start)
		r.Put("/{id}/end", streamHandler.End)
		r.Delete("/{id}", streamHandler.Delete)

		// Chat endpoints
		r.Get("/{id}/chat", streamHandler.ChatHistory)
		r.Post("/{id}/chat", streamHandler.SendChat)
		r.Put("/{id}/chat/mute", streamHandler.MuteUser)
		r.Delete("/{id}/chat/{messageId}", streamHandler.DeleteChat)
		r.Put("/{id}/chat/settings", streamHandler.UpdateChatSettings)
	})

	// Video asset management (authenticated)
	r.Route("/api/v1/videos", func(r chi.Router) {
		r.Post("/", videoHandler.Create)
		r.Get("/", videoHandler.List)
		r.Get("/{id}", videoHandler.Get)
		r.Get("/{id}/status", videoHandler.TranscodingStatus)
		r.Get("/by-asset/{assetId}", videoHandler.GetByAsset)
		r.Delete("/{id}", videoHandler.Delete)
	})

	// Desktop companion app (authenticated)
	r.Route("/api/v1/desktop", func(r chi.Router) {
		r.Post("/sessions", desktopHandler.RegisterSession)
		r.Get("/sessions", desktopHandler.ListSessions)
		r.Put("/sessions/{id}/heartbeat", desktopHandler.Heartbeat)
		r.Put("/sessions/{id}/stats", desktopHandler.UpdateStats)
		r.Delete("/sessions/{id}", desktopHandler.Deactivate)
		r.Get("/sync-status", desktopHandler.SyncStatus)
	})
}

// RegisterM8PublicRoutes registers public M8 routes (no auth required).
func RegisterM8PublicRoutes(r chi.Router, deps M8Dependencies) {
	streamHandler := NewStreamHandler(deps.StreamService)
	desktopHandler := NewDesktopHandler(deps.DesktopService)

	// Public stream viewer (no auth — viewers don't need accounts)
	r.Route("/api/v1/public/streams", func(r chi.Router) {
		r.Get("/{id}", streamHandler.GetPublic)
		r.Post("/{id}/verify-pin", streamHandler.VerifyPin)
		r.Get("/{id}/chat", streamHandler.ChatHistory)
		r.Post("/{id}/chat", streamHandler.SendChat)
	})

	// Desktop app download info (public)
	r.Get("/api/v1/desktop/download", desktopHandler.DesktopDownloadInfo)
}
