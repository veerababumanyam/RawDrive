// Package viewer — ReplayGate (M35 / E107-S4).
//
// Server-authoritative replay expiry gate. The caller (HTTP handler) passes
// the stream's persisted replay_state + replay_expires_at. The gate compares
// expires_at against an injected clock and returns:
//   - ErrReplayExpired (handler maps to HTTP 410) when the clock is at/past expiry.
//   - ErrReplayProcessing (handler maps to 409) when state == processing.
//   - A ReplayDecision with a short-TTL signed playback URL and a BannerFlag
//     set when expires_at falls within the warn window.
//
// Any expiry hint provided by the client is IGNORED — only the server's
// persisted timestamp + server clock make the decision.
package viewer

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// ReplayState mirrors streams.replay_state.
type ReplayState string

const (
	ReplayProcessing ReplayState = "processing"
	ReplayAvailable  ReplayState = "available"
	ReplayExpired    ReplayState = "expired"
)

// Errors returned by ReplayGate.Decide.
var (
	ErrReplayExpired    = errors.New("viewer: replay expired")
	ErrReplayProcessing = errors.New("viewer: replay processing")
	ErrReplayNotFound   = errors.New("viewer: replay not found")
)

// PlaybackSigner mints short-lived signed playback URLs.
type PlaybackSigner interface {
	SignPlaybackURL(ctx context.Context, videoID string, ttl time.Duration) (url string, expiresAt time.Time, err error)
}

// ReplayInputs is what the handler passes after looking up the stream by
// shortlink. ClientExpiresAt is accepted for logging/observability only —
// the gate deliberately ignores it.
type ReplayInputs struct {
	StreamID        uuid.UUID
	State           ReplayState
	ExpiresAt       time.Time // authoritative server value
	ReplayVideoID   string
	ClientExpiresAt time.Time // IGNORED — do not use for decisions
}

// ReplayDecision is the gate's verdict.
type ReplayDecision struct {
	Allowed     bool
	BannerFlag  bool
	State       ReplayState
	ExpiresAt   time.Time
	PlaybackURL string
	URLExpires  time.Time
	WarnWindow  time.Duration
}

// ReplayGate evaluates replay availability.
type ReplayGate struct {
	signer     PlaybackSigner
	warnWindow time.Duration
	now        func() time.Time
	signTTL    time.Duration
}

// NewReplayGate constructs a gate. warnWindow defaults to 48h, clock to
// time.Now. Signed URLs are minted with a 5-minute TTL.
func NewReplayGate(signer PlaybackSigner, warnWindow time.Duration, clock func() time.Time) *ReplayGate {
	if warnWindow <= 0 {
		warnWindow = 48 * time.Hour
	}
	if clock == nil {
		clock = time.Now
	}
	return &ReplayGate{
		signer:     signer,
		warnWindow: warnWindow,
		now:        clock,
		signTTL:    5 * time.Minute,
	}
}

// Decide evaluates the inputs and returns a ReplayDecision. Client-supplied
// expiry is never consulted.
func (g *ReplayGate) Decide(ctx context.Context, in ReplayInputs) (ReplayDecision, error) {
	now := g.now()

	switch in.State {
	case ReplayProcessing:
		return ReplayDecision{Allowed: false, State: ReplayProcessing, WarnWindow: g.warnWindow}, ErrReplayProcessing
	case ReplayExpired:
		return ReplayDecision{Allowed: false, State: ReplayExpired, ExpiresAt: in.ExpiresAt, WarnWindow: g.warnWindow}, ErrReplayExpired
	case ReplayAvailable:
		// fall through
	default:
		return ReplayDecision{Allowed: false, WarnWindow: g.warnWindow}, ErrReplayNotFound
	}

	// Server-authoritative expiry check.
	if !in.ExpiresAt.IsZero() && !now.Before(in.ExpiresAt) {
		return ReplayDecision{
			Allowed:    false,
			State:      ReplayExpired,
			ExpiresAt:  in.ExpiresAt,
			WarnWindow: g.warnWindow,
		}, ErrReplayExpired
	}

	url, urlExp, err := g.signer.SignPlaybackURL(ctx, in.ReplayVideoID, g.signTTL)
	if err != nil {
		return ReplayDecision{}, err
	}

	banner := false
	if !in.ExpiresAt.IsZero() && in.ExpiresAt.Sub(now) <= g.warnWindow {
		banner = true
	}

	return ReplayDecision{
		Allowed:     true,
		BannerFlag:  banner,
		State:       ReplayAvailable,
		ExpiresAt:   in.ExpiresAt,
		PlaybackURL: url,
		URLExpires:  urlExp,
		WarnWindow:  g.warnWindow,
	}, nil
}
