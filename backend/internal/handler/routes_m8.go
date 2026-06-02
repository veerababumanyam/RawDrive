package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// M8Dependencies holds all dependencies needed for M8 route registration.
//
// M30 / F-014 security stabilization extends this with ViewerJWT (issues
// and verifies viewer-session tokens for public stream access) and
// PINRateLimiter (brute-force defence for verify-pin). Both are optional —
// when nil, the public routes fall back to the legacy open-access path.
type M8Dependencies struct {
	StreamService  *service.StreamService
	VideoService   *service.VideoService
	DesktopService *service.DesktopService

	// Optional: nil disables viewer-session binding (open-access only).
	ViewerJWT *viewer.Service

	// Optional: nil disables PIN rate limiting.
	PINRateLimiter middleware.PINRateLimiter

	// Optional: nil disables the tethered-galleries endpoint.
	GalleryRepo *repository.GalleryRepo
}

// RegisterM8Routes registers all M8 (Live Streaming & Desktop Companion) routes.
func RegisterM8Routes(r chi.Router, deps M8Dependencies) {
	streamHandler := NewStreamHandler(deps.StreamService)
	videoHandler := NewVideoHandler(deps.VideoService)
	desktopHandler := NewDesktopHandler(deps.DesktopService).
		WithGalleryRepo(deps.GalleryRepo)

	// Stream management (authenticated)
	//
	// M30 / E101-S2 / FR-014-SEC-07: team members without an Admin (or
	// higher) workspace role cannot create, control, or delete streams.
	// Read-only routes (List, Get) remain available to any authenticated
	// workspace member. Chat moderation requires at least Editor.
	r.Route("/api/v1/streams", func(r chi.Router) {
		// Read-only — any workspace member can see their streams.
		r.Get("/", streamHandler.List)
		r.Get("/{id}", streamHandler.Get)
		r.Get("/{id}/chat", streamHandler.ChatHistory)

		// Mutating — Admin+ only (streams:create / control / delete).
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireWorkspaceRole("Admin"))
			r.Post("/", streamHandler.Create)
			r.Put("/{id}/start", streamHandler.Start)
			r.Put("/{id}/end", streamHandler.End)
			r.Delete("/{id}", streamHandler.Delete)
			r.Put("/{id}/chat/settings", streamHandler.UpdateChatSettings)
		})

		// Chat — posting and moderating. Editor+ can post on behalf of
		// the workspace; moderation and mute require Admin.
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireWorkspaceRole("Editor"))
			r.Post("/{id}/chat", streamHandler.SendChat)
		})
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireWorkspaceRole("Admin"))
			r.Put("/{id}/chat/mute", streamHandler.MuteUser)
			r.Delete("/{id}/chat/{messageId}", streamHandler.DeleteChat)
		})
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
		// M23: desktop polls this to discover tether-watched directories.
		r.Get("/tethered-galleries", desktopHandler.TetheredGalleries)
	})
}

// RegisterM8PublicRoutes registers public M8 routes (no auth required).
func RegisterM8PublicRoutes(r chi.Router, deps M8Dependencies) {
	streamHandler := NewStreamHandler(deps.StreamService, deps.ViewerJWT)
	desktopHandler := NewDesktopHandler(deps.DesktopService)

	// Public stream viewer (no auth — viewers don't need accounts).
	//
	// M30 / F-014 hardening:
	//   - ViewerContext attaches the verified viewer-session JWT (if any)
	//     to the request so GetPublic can decide whether to surface
	//     cf_playback_url for PIN-protected streams.
	//   - RequirePINRateLimit caps verify-pin attempts to defend against
	//     brute-force PIN guessing per FR-014-SEC / NFR-014-SEC-02.
	r.Route("/api/v1/public/streams", func(r chi.Router) {
		r.Use(middleware.ViewerContext(deps.ViewerJWT))
		r.Get("/{id}", streamHandler.GetPublic)
		r.Get("/{id}/chat", streamHandler.ChatHistory)
		r.Post("/{id}/chat", streamHandler.SendChat)
		r.With(middleware.RequirePINRateLimit(deps.PINRateLimiter)).
			Post("/{id}/verify-pin", streamHandler.VerifyPin)
	})

	// Desktop app download info (public)
	r.Get("/api/v1/desktop/download", desktopHandler.DesktopDownloadInfo)
}
