// Package handlers — production adapters bridging concrete streaming
// services (M30–M35) to the narrow handler-local interfaces declared in this
// package. These exist so backend/cmd/api/main.go can wire every mounted
// route to a real implementation without leaking handler-private types into
// service packages.
//
// Adapters intentionally stay thin: they translate types only. Domain logic
// lives in the underlying service. When an adapter returns a degenerate value
// (zero metrics, empty playback URL) it is because the upstream production
// service for that capability is not yet built — the adapter logs a TODO via
// comment so the next wave knows where to plug in.
package handlers

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/streaming/cf"
	"github.com/rawdrive/backend/internal/streaming/services"
	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// ─────────────────────────────────────────────────────────────────────────────
// ConsoleStore — pgx-backed implementation reading the streams + ingest
// reveal audit tables. Owner-scoped: cross-workspace queries return
// ErrStreamNotFound to defeat enumeration.
// ─────────────────────────────────────────────────────────────────────────────

// PgConsoleStore implements ConsoleStore over pgxpool.
type PgConsoleStore struct {
	pool *pgxpool.Pool
}

// NewPgConsoleStore wires the store.
func NewPgConsoleStore(pool *pgxpool.Pool) *PgConsoleStore {
	return &PgConsoleStore{pool: pool}
}

// LoadStreamForOwner returns the console projection for (streamID,
// workspaceID). A missing row OR a workspace-mismatch yields ErrStreamNotFound.
func (s *PgConsoleStore) LoadStreamForOwner(ctx context.Context, streamID, workspaceID uuid.UUID) (*ConsoleStream, error) {
	// Note on column choice: the M8 streams schema (migration 045) and the M31
	// extensions (083) do NOT carry package_id, scheduled_end_at, or srt_url.
	// We project the columns that exist and leave the others zero-valued —
	// the console payload accepts zero/empty for those without leaking secrets.
	const q = `
		SELECT id, workspace_id,
		       COALESCE(title, ''),
		       COALESCE(status, ''),
		       COALESCE(scheduled_at, '0001-01-01'::timestamptz),
		       COALESCE(access_level, ''),
		       COALESCE(chat_policy, ''),
		       COALESCE(replay_state, ''),
		       COALESCE(cf_rtmps_url, '')
		FROM streams
		WHERE id = $1 AND workspace_id = $2`
	var (
		c           ConsoleStream
		replayState string
	)
	err := s.pool.QueryRow(ctx, q, streamID, workspaceID).Scan(
		&c.ID, &c.WorkspaceID,
		&c.Title, &c.Status, &c.StartAt,
		&c.AccessPolicy, &c.ChatPolicy, &replayState,
		&c.RTMPSURL,
	)
	c.ReplayEnabled = replayState != "" && replayState != "none"
	c.EndAt = c.StartAt // sentinel — schema has no scheduled_end; T-30 gate uses StartAt only.
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStreamNotFound
		}
		return nil, err
	}
	// StreamKey + SRTPasskey are intentionally NOT loaded here. The console
	// handler's redactIngest gate must consult the IngestRevealService for
	// plaintext credentials — never the streams projection.
	return &c, nil
}

// CountRevealAudit returns the number of reveal-audit rows for (streamID,
// userID). Used by the console redactIngest gate to verify the caller has
// previously revealed at least once before exposing credentials in console.
func (s *PgConsoleStore) CountRevealAudit(ctx context.Context, streamID, userID uuid.UUID) (int, error) {
	const q = `
		SELECT COUNT(*) FROM ingest_reveal_audit
		WHERE stream_id = $1 AND revealed_by = $2`
	var n int
	if err := s.pool.QueryRow(ctx, q, streamID, userID).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// RevealService adapter — wraps services.RevealService and translates its
// typed sentinels into the handler's expected RevealService surface.
// ─────────────────────────────────────────────────────────────────────────────

// RevealServiceAdapter implements handlers.RevealService over the concrete
// services.RevealService.
type RevealServiceAdapter struct {
	svc *services.RevealService
}

// NewRevealServiceAdapter wires the adapter.
func NewRevealServiceAdapter(svc *services.RevealService) *RevealServiceAdapter {
	return &RevealServiceAdapter{svc: svc}
}

// Reveal proxies to the underlying service and maps its sentinels.
func (a *RevealServiceAdapter) Reveal(
	ctx context.Context,
	streamID, _ /*workspaceID*/ uuid.UUID,
	userID uuid.UUID,
	ipAddr, userAgent string,
) (*RevealResult, error) {
	resp, err := a.svc.Reveal(ctx, services.RevealRequest{
		StreamID:  streamID,
		ActorID:   userID,
		ActorIP:   ipAddr,
		UserAgent: userAgent,
	})
	if err != nil {
		// Map service sentinels → handler sentinels.
		if errors.Is(err, services.ErrRevealTooEarly) {
			return nil, ErrOutsideRevealWindow
		}
		// pgx ErrNoRows propagates from the StreamLookup; treat as not-found.
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrStreamNotFound
		}
		return nil, err
	}
	return &RevealResult{
		RTMPURL:   resp.RTMPSURL,
		StreamKey: resp.StreamKey,
		ExpiresAt: resp.RevealedAt.Add(30 * time.Minute),
	}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// StreamWorkspaceResolver — pgx-backed lookup of workspace_id for a stream.
// Used by ChatViewerHandler so viewer JWTs (which deliberately do not carry
// workspace_id) can be mapped to the owning workspace before service calls.
// ─────────────────────────────────────────────────────────────────────────────

// PgStreamWorkspaceResolver implements StreamWorkspaceResolver over pgxpool.
type PgStreamWorkspaceResolver struct {
	pool *pgxpool.Pool
}

// NewPgStreamWorkspaceResolver wires the resolver.
func NewPgStreamWorkspaceResolver(pool *pgxpool.Pool) *PgStreamWorkspaceResolver {
	return &PgStreamWorkspaceResolver{pool: pool}
}

// WorkspaceIDForStream returns the workspace owning streamID, or pgx.ErrNoRows.
func (r *PgStreamWorkspaceResolver) WorkspaceIDForStream(ctx context.Context, streamID uuid.UUID) (uuid.UUID, error) {
	const q = `SELECT workspace_id FROM streams WHERE id = $1`
	var ws uuid.UUID
	if err := r.pool.QueryRow(ctx, q, streamID).Scan(&ws); err != nil {
		return uuid.Nil, err
	}
	return ws, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ReplayStreamRepo — pgx-backed loader for the public replay handler.
// ─────────────────────────────────────────────────────────────────────────────

// PgReplayStreamRepo implements ReplayStreamRepo over pgxpool.
type PgReplayStreamRepo struct {
	pool *pgxpool.Pool
}

// NewPgReplayStreamRepo wires the repo.
func NewPgReplayStreamRepo(pool *pgxpool.Pool) *PgReplayStreamRepo {
	return &PgReplayStreamRepo{pool: pool}
}

// LoadReplay reads the replay metadata. Returns ErrReplayStreamNotFound when
// the row is missing, replay is disabled, or expiry is unset.
func (r *PgReplayStreamRepo) LoadReplay(ctx context.Context, streamID uuid.UUID) (*ReplayStreamMeta, error) {
	// Schema (083): replay_state, replay_expires_at, replay_url. There is NO
	// replay_video_id column today — we use cf_vod_uid as the video ID for
	// signing purposes (M8 column).
	const q = `
		SELECT id, workspace_id,
		       COALESCE(replay_state, ''),
		       COALESCE(replay_expires_at, '0001-01-01'::timestamptz),
		       COALESCE(cf_vod_uid, '')
		FROM streams
		WHERE id = $1`
	var (
		out     ReplayStreamMeta
		state   string
		expires time.Time
		videoID string
	)
	err := r.pool.QueryRow(ctx, q, streamID).Scan(
		&out.StreamID, &out.WorkspaceID,
		&state, &expires, &videoID,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrReplayStreamNotFound
		}
		return nil, err
	}
	out.State = viewer.ReplayState(state)
	out.ExpiresAt = expires
	out.ReplayVideoID = videoID
	return &out, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ZeroPresenceSource — placeholder PresenceSource returning zero counts until
// the live presence shim (NATS-backed viewer-count broker) lands. Mounting
// the cache against this source keeps the route operational but reports 0
// viewers — preferable to a 500 from a nil cache.
// ─────────────────────────────────────────────────────────────────────────────

// ZeroPresenceSource always reports 0 viewers. TODO(M35-wave-2): replace with
// the NATS-backed viewer presence broker when statepusher publishes counts.
type ZeroPresenceSource struct{}

// GetViewerMetrics implements viewer.PresenceSource.
func (ZeroPresenceSource) GetViewerMetrics(_ context.Context, _ uuid.UUID) (*viewer.LiveViewerMetricsShim, error) {
	return &viewer.LiveViewerMetricsShim{Current: 0, Peak: 0, Unique: 0}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// CFPlaybackSigner — adapts cf.SignedURLService to viewer.PlaybackSigner.
// ─────────────────────────────────────────────────────────────────────────────

// CFPlaybackSigner wraps cf.SignedURLService.
type CFPlaybackSigner struct {
	svc *cf.SignedURLService
}

// NewCFPlaybackSigner wires the signer. Returns nil when svc is nil so callers
// can pass through configuration availability without branching.
func NewCFPlaybackSigner(svc *cf.SignedURLService) *CFPlaybackSigner {
	if svc == nil {
		return nil
	}
	return &CFPlaybackSigner{svc: svc}
}

// SignPlaybackURL implements viewer.PlaybackSigner.
func (s *CFPlaybackSigner) SignPlaybackURL(_ context.Context, videoID string, ttl time.Duration) (string, time.Time, error) {
	if s == nil || s.svc == nil {
		return "", time.Time{}, fmt.Errorf("cf playback signer not configured")
	}
	res, err := s.svc.Sign(cf.PlaybackURLRequest{
		VideoID:    videoID,
		SessionExp: time.Now().UTC().Add(ttl),
	})
	if err != nil {
		return "", time.Time{}, err
	}
	return res.URL, res.ExpiresAt, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// PgChatLivenessChecker — pgx-backed chat.LivenessChecker reading the streams
// table for live/ended state and chat_slow_mode_seconds for the slow-mode
// window. Both columns exist on the M8 streams schema (migration 045).
// ─────────────────────────────────────────────────────────────────────────────

// PgChatLivenessChecker satisfies chat.LivenessChecker over pgxpool.
type PgChatLivenessChecker struct {
	pool *pgxpool.Pool
}

// NewPgChatLivenessChecker wires the checker.
func NewPgChatLivenessChecker(pool *pgxpool.Pool) *PgChatLivenessChecker {
	return &PgChatLivenessChecker{pool: pool}
}

// IsStreamLive reads streams.status. live → live=true,ended=false.
// ended/processing_vod/vod_ready → ended=true. anything else → both false.
func (l *PgChatLivenessChecker) IsStreamLive(ctx context.Context, streamID uuid.UUID) (bool, bool, error) {
	const q = `SELECT COALESCE(status, '') FROM streams WHERE id = $1`
	var status string
	if err := l.pool.QueryRow(ctx, q, streamID).Scan(&status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, true, nil // unknown stream → behave like ended
		}
		return false, false, err
	}
	switch status {
	case "live":
		return true, false, nil
	case "ended", "processing_vod", "vod_ready", "failed":
		return false, true, nil
	default:
		return false, false, nil
	}
}

// GetSlowModeSeconds reads streams.chat_slow_mode_seconds. Default 0 (off).
func (l *PgChatLivenessChecker) GetSlowModeSeconds(ctx context.Context, streamID uuid.UUID) (int, error) {
	const q = `SELECT COALESCE(chat_slow_mode_seconds, 0) FROM streams WHERE id = $1`
	var n int
	if err := l.pool.QueryRow(ctx, q, streamID).Scan(&n); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	return n, nil
}
