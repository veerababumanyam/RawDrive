package middleware

// M30 / E101-S3 — Viewer-context middleware.
//
// The public stream routes (/api/v1/public/streams/...) mount this
// middleware so each request runs on a DB session with app.viewer_session_id
// set. That settings is what the chat_messages / reaction_events RLS
// policies read via current_setting() to allow a viewer to see their own
// stream's rows without being the workspace owner.
//
// The tenant middleware (current_workspace_id) remains untouched — it is
// only attached to dashboard routes. Public viewer requests carry ONLY the
// viewer context, never a tenant context.
//
// Source of the viewer_session_id:
//   1. A valid viewer-session JWT presented via Authorization: Bearer <token>.
//      The JWT is verified here using streaming/viewer.Service.Parse.
//   2. Open-access streams without a JWT fall through with an empty viewer
//      session; the stream handler enforces its own open-access rules.

import (
	"context"
	"net/http"
	"strings"

	"github.com/rawdrive/backend/internal/streaming/viewer"
)

type viewerCtxKey struct{}

// ViewerSession captures the verified viewer identity for a request.
type ViewerSession struct {
	SessionID   string
	StreamID    string
	AccessLevel viewer.AccessLevel
}

// ViewerContext returns a middleware that extracts a viewer JWT from the
// Authorization header and, on success, attaches the verified session to
// the request context. Invalid tokens return 401; missing tokens pass
// through unchanged (the handler decides whether anonymous access is ok).
//
// The verifier parameter is the viewer.Service the bootstrap already built.
// Passing nil disables JWT verification and the middleware becomes a no-op
// — useful for tests that only exercise the open-access path.
func ViewerContext(verifier *viewer.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			if token == "" || verifier == nil {
				next.ServeHTTP(w, r)
				return
			}
			claims, err := verifier.Parse(token)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"invalid_viewer_session"}`))
				return
			}
			sess := &ViewerSession{
				SessionID:   claims.ViewerSessionID,
				StreamID:    claims.StreamID,
				AccessLevel: claims.AccessLevel,
			}
			ctx := context.WithValue(r.Context(), viewerCtxKey{}, sess)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ViewerSessionFromContext returns the verified viewer session attached by
// ViewerContext, or nil if no viewer JWT was presented / verified.
func ViewerSessionFromContext(ctx context.Context) *ViewerSession {
	if ctx == nil {
		return nil
	}
	if v, ok := ctx.Value(viewerCtxKey{}).(*ViewerSession); ok {
		return v
	}
	return nil
}

// RequireViewerSession rejects requests that did not produce a viewer
// session. Use on routes that should never serve anonymous viewers (e.g.
// chat posts) regardless of the stream's own access level.
func RequireViewerSession() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if ViewerSessionFromContext(r.Context()) == nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"viewer_session_required"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func bearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
