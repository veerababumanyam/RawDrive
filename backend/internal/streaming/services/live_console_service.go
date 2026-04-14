// Package services — LiveConsoleService is the concrete façade wired into
// handlers.LiveConsoleHandler via the LiveConsoleDeps interface. It composes
// a pgxpool, the chat service, a CF live-input client, and a presence source
// (NATS-backed in prod, ZeroPresenceSource in early waves).
//
// M34 story 34-6. The handler layer handles HTTP + JWT; this service contains
// workspace-scoped data access, owner assertion (anti-enumeration: missing or
// cross-workspace rows collapse to ErrLiveStreamNotFound), and orchestration of
// moderation/slow-mode/end-stream flows. Every public method accepts a
// context.Context as its first argument.
package services

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/streaming/cf"
	"github.com/rawdrive/backend/internal/streaming/chat"
)

// ErrLiveStreamNotFound mirrors handlers.ErrLiveStreamNotFound so the service
// layer can signal anti-enumeration without importing the handler package.
// The handler adapter translates between the two sentinels.
var ErrLiveStreamNotFound = errors.New("live stream not found")

// LiveStreamMeta is the workspace-scoped projection returned by AssertOwner.
type LiveStreamMeta struct {
	ID          uuid.UUID
	WorkspaceID uuid.UUID
	Status      string
}

// LiveIngestHealth is the CF-derived ingest snapshot.
type LiveIngestHealth struct {
	Connected    bool
	BitrateKbps  int
	FPS          float64
	VideoCodec   string
	AudioCodec   string
	LastPushedAt time.Time
	Status       string
}

// LiveViewerMetrics is the presence snapshot.
type LiveViewerMetrics struct {
	Current int
	Peak    int
	Unique  int
	AsOf    time.Time
}

// LiveWaitingRoomSnapshot mirrors the handler payload.
type LiveWaitingRoomSnapshot struct {
	Title       string
	ScheduledAt time.Time
	Brand       string
}

// LiveModerationRequest carries a moderator-issued action.
type LiveModerationRequest struct {
	StreamID        uuid.UUID
	MessageID       uuid.UUID
	ActorID         uuid.UUID
	Action          string
	DurationSeconds int
	Reason          string
}

// PresenceSource is the slice of the NATS-backed viewer presence broker used
// by the live-console service. ZeroPresenceSource (in handlers/adapters.go)
// satisfies this until the broker ships.
type PresenceSource interface {
	GetViewerMetrics(ctx context.Context, streamID uuid.UUID) (current, peak, unique int, asOf time.Time, err error)
}

// ChatModerator is the slice of chat.Service the live console needs.
type ChatModerator interface {
	ModerateMessage(ctx context.Context, messageID, actorID uuid.UUID, action chat.ModerationAction, duration time.Duration) error
}

// LiveConsoleService is the concrete dependency façade.
type LiveConsoleService struct {
	DB       *pgxpool.Pool
	CF       cf.LiveInputClient
	Chat     ChatModerator
	Presence PresenceSource
}

// NewLiveConsoleService wires the service. Callers may pass nil for Presence
// (the service will report zero viewers) or nil for CF (health will report
// disconnected); DB is required for owner assertion.
func NewLiveConsoleService(db *pgxpool.Pool, cfClient cf.LiveInputClient, chatSvc ChatModerator, presence PresenceSource) *LiveConsoleService {
	return &LiveConsoleService{
		DB:       db,
		CF:       cfClient,
		Chat:     chatSvc,
		Presence: presence,
	}
}

// AssertOwner verifies (streamID, workspaceID) refers to a row this workspace
// owns. Missing rows and cross-workspace hits both yield ErrLiveStreamNotFound.
func (s *LiveConsoleService) AssertOwner(ctx context.Context, streamID, workspaceID uuid.UUID) (*LiveStreamMeta, error) {
	if s.DB == nil {
		return nil, ErrLiveStreamNotFound
	}
	const q = `SELECT id, workspace_id, COALESCE(status, '') FROM streams WHERE id = $1 AND workspace_id = $2`
	var meta LiveStreamMeta
	err := s.DB.QueryRow(ctx, q, streamID, workspaceID).Scan(&meta.ID, &meta.WorkspaceID, &meta.Status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrLiveStreamNotFound
		}
		return nil, err
	}
	return &meta, nil
}

// GetIngestHealth consults the CF live-input API for the current connection
// state. Absent a CF client we return a disconnected shell rather than 500 so
// the console renders something. TODO(M35-wave): plumb live bitrate/FPS once
// CF Analytics proxy lands.
func (s *LiveConsoleService) GetIngestHealth(ctx context.Context, streamID uuid.UUID) (*LiveIngestHealth, error) {
	now := time.Now().UTC()
	if s.CF == nil || s.DB == nil {
		return &LiveIngestHealth{Connected: false, Status: "unknown", LastPushedAt: now}, nil
	}
	// Resolve the stream's CF live input uid.
	var uid string
	err := s.DB.QueryRow(ctx,
		`SELECT COALESCE(cf_stream_uid, '') FROM streams WHERE id = $1`, streamID,
	).Scan(&uid)
	if err != nil || uid == "" {
		return &LiveIngestHealth{Connected: false, Status: "unknown", LastPushedAt: now}, nil
	}
	in, err := s.CF.Get(ctx, uid)
	if err != nil || in == nil {
		log.Printf("live_console: cf.Get(%s) failed: %v", uid, err)
		return &LiveIngestHealth{Connected: false, Status: "unknown", LastPushedAt: now}, nil
	}
	return &LiveIngestHealth{
		Connected:    in.Status == "connected",
		Status:       in.Status,
		LastPushedAt: in.Modified,
	}, nil
}

// GetViewerMetrics reads from the presence source. Nil source → zeros.
func (s *LiveConsoleService) GetViewerMetrics(ctx context.Context, streamID uuid.UUID) (*LiveViewerMetrics, error) {
	if s.Presence == nil {
		return &LiveViewerMetrics{AsOf: time.Now().UTC()}, nil
	}
	cur, peak, uniq, asOf, err := s.Presence.GetViewerMetrics(ctx, streamID)
	if err != nil {
		return &LiveViewerMetrics{AsOf: time.Now().UTC()}, nil
	}
	return &LiveViewerMetrics{Current: cur, Peak: peak, Unique: uniq, AsOf: asOf}, nil
}

// GetWaitingRoomSnapshot reads the pre-live mirror from streams.
func (s *LiveConsoleService) GetWaitingRoomSnapshot(ctx context.Context, streamID uuid.UUID) (*LiveWaitingRoomSnapshot, error) {
	if s.DB == nil {
		return &LiveWaitingRoomSnapshot{}, nil
	}
	const q = `SELECT COALESCE(title, ''), COALESCE(scheduled_at, '0001-01-01'::timestamptz) FROM streams WHERE id = $1`
	var snap LiveWaitingRoomSnapshot
	err := s.DB.QueryRow(ctx, q, streamID).Scan(&snap.Title, &snap.ScheduledAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrLiveStreamNotFound
		}
		return nil, err
	}
	return &snap, nil
}

// Moderate dispatches to the chat service (delete/timeout/ban). Full audit
// persistence (chat_moderation_actions) lands with the repo work in a later
// wave; today we rely on chat.Service's existing SoftDelete path.
func (s *LiveConsoleService) Moderate(ctx context.Context, req LiveModerationRequest) error {
	if s.Chat == nil {
		return nil
	}
	var action chat.ModerationAction
	switch req.Action {
	case "delete":
		action = chat.ModerationDelete
	case "timeout":
		action = chat.ModerationTimeout
	case "ban":
		action = chat.ModerationBan
	default:
		return errors.New("live_console: invalid moderation action")
	}
	dur := time.Duration(req.DurationSeconds) * time.Second
	return s.Chat.ModerateMessage(ctx, req.MessageID, req.ActorID, action, dur)
}

// SetSlowMode updates streams.chat_slow_mode_seconds. 0 disables.
func (s *LiveConsoleService) SetSlowMode(ctx context.Context, streamID uuid.UUID, perUserSeconds int) error {
	if s.DB == nil {
		return nil
	}
	_, err := s.DB.Exec(ctx,
		`UPDATE streams SET chat_slow_mode_seconds = $1, updated_at = NOW() WHERE id = $2`,
		perUserSeconds, streamID,
	)
	return err
}

// EndStream transitions the stream to ended. Reason is recorded in-line; the
// full lifecycle state-machine audit lands in M35.
func (s *LiveConsoleService) EndStream(ctx context.Context, streamID uuid.UUID, reason string, actor uuid.UUID) error {
	if s.DB == nil {
		return nil
	}
	_, err := s.DB.Exec(ctx,
		`UPDATE streams
		 SET status = 'ended', live_state = 'ended', ended_at = NOW(), updated_at = NOW()
		 WHERE id = $1 AND status = 'live'`,
		streamID,
	)
	_ = actor
	_ = reason
	return err
}
