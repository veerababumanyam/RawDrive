// Package handlers — M34 route registration for F-014 streaming commercial v1.
package handlers

import "github.com/go-chi/chi/v5"

// Dependencies bundles the handler collaborators mounted by RegisterRoutes.
// Construction happens at app wire-up (backend/cmd/api); routes.go is the
// single entry point so story handlers don't duplicate URL strings.
//
// Every field is optional — a nil handler means its routes are skipped.
// Each handler performs its own feature-flag check internally so the flag
// being off collapses to 404 without panicking on missing deps.
type Dependencies struct {
	// Photographer-facing (authed).
	Console        *ConsoleHandler
	StreamCreate   *StreamCreateHandler
	CreditBalance  *CreditBalanceHandler
	IngestReveal   *IngestRevealHandler
	Invite         *InviteHandler
	LiveConsole    *LiveConsoleHandler
	Preflight      *PreflightHandler

	// Public (no auth).
	PublicShortlink *PublicShortlinkHandler
}

// RegisterRoutes mounts the F-014 streaming authed surface. Call inside the
// JWT-authed router group. Public routes are mounted via RegisterPublicRoutes.
func RegisterRoutes(r chi.Router, deps Dependencies) {
	if deps.StreamCreate != nil {
		r.Post("/api/v1/streaming/streams", deps.StreamCreate.Create)
	}
	if deps.Console != nil {
		r.Get("/api/v1/streaming/streams/{id}/console", deps.Console.GetConsole)
	}
	if deps.CreditBalance != nil {
		r.Get("/api/v1/credits/balance", deps.CreditBalance.GetBalance)
	}
	if deps.IngestReveal != nil {
		r.Post("/api/v1/streaming/streams/{id}/ingest/reveal", deps.IngestReveal.ServeHTTP)
	}
	if deps.Invite != nil {
		r.Post("/api/v1/streaming/streams/{id}/invites", deps.Invite.CreateInvite)
	}
	if deps.LiveConsole != nil {
		r.Get("/api/v1/streaming/streams/{id}/health", deps.LiveConsole.GetHealth)
		r.Get("/api/v1/streaming/streams/{id}/viewers", deps.LiveConsole.GetViewers)
		r.Get("/api/v1/streaming/streams/{id}/chat", deps.LiveConsole.ChatStream)
		r.Post("/api/v1/streaming/streams/{id}/chat/{msgId}/moderate", deps.LiveConsole.Moderate)
		r.Post("/api/v1/streaming/streams/{id}/chat/slow-mode", deps.LiveConsole.SetSlowMode)
		r.Post("/api/v1/streaming/streams/{id}/end", deps.LiveConsole.EndStream)
		r.Get("/api/v1/streaming/streams/{id}/waiting-room", deps.LiveConsole.GetWaitingRoom)
	}
	if deps.Preflight != nil {
		r.Post("/api/v1/streaming/streams/preflight/start", deps.Preflight.Start)
		r.Post("/api/v1/streaming/streams/preflight/{sid}/bandwidth", deps.Preflight.Bandwidth)
		r.Get("/api/v1/streaming/streams/preflight/{sid}/obs-profile", deps.Preflight.OBSProfile)
		r.Post("/api/v1/streaming/streams/preflight/{sid}/test-broadcast/start", deps.Preflight.TestBroadcastStart)
		r.Post("/api/v1/streaming/streams/preflight/{sid}/test-broadcast/stop", deps.Preflight.TestBroadcastStop)
		r.Post("/api/v1/streaming/streams/preflight/{sid}/complete", deps.Preflight.Complete)
	}
}

// RegisterPublicRoutes mounts routes that MUST NOT traverse JWT auth. The
// shortlink resolver is the sole public surface — it is rate-limited at the
// handler layer and only returns whitelisted stream metadata.
func RegisterPublicRoutes(r chi.Router, deps Dependencies) {
	if deps.PublicShortlink != nil {
		r.Get("/api/v1/public/s/{code}", deps.PublicShortlink.Resolve)
	}
}
