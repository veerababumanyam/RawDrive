package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/repository"
)

// --- errors ---

var (
	ErrBanned         = errors.New("chat: viewer is banned or timed out")
	ErrStreamNotLive  = errors.New("chat: stream is not live")
	ErrStreamEnded    = errors.New("chat: stream has ended")
	ErrSlowMode       = errors.New("chat: slow mode window not elapsed")
	ErrMessageTooLong = errors.New("chat: message exceeds 500 characters")
	ErrMessageEmpty   = errors.New("chat: message body is empty")
	ErrInvalidKind    = errors.New("chat: invalid reaction kind")
	ErrRateLimited    = errors.New("chat: rate limit exceeded")
	ErrInvalidAction  = errors.New("chat: invalid moderation action")
)

// SlowModeError wraps ErrSlowMode with an authoritative retry-after duration
// so handlers can surface Retry-After headers without re-querying the gate.
type SlowModeError struct {
	RetryAfter time.Duration
}

func (e *SlowModeError) Error() string {
	return fmt.Sprintf("%s (retry after %s)", ErrSlowMode.Error(), e.RetryAfter)
}
func (e *SlowModeError) Unwrap() error { return ErrSlowMode }

// RateLimitError surfaces retry-after for reaction rate-limit rejections.
type RateLimitError struct {
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	return fmt.Sprintf("%s (retry after %s)", ErrRateLimited.Error(), e.RetryAfter)
}
func (e *RateLimitError) Unwrap() error { return ErrRateLimited }

// --- dependencies ---

// chatRepo is the subset of repository.ChatRepo the service needs. Declared
// as an interface here so tests can mock persistence without a live DB. The
// production repository must satisfy this interface.
type chatRepo interface {
	PostAsViewer(ctx context.Context, streamID, workspaceID, viewerSessionID uuid.UUID, body string) (*repository.ChatMessage, error)
	EmitReaction(ctx context.Context, streamID, workspaceID uuid.UUID, viewerSessionID *uuid.UUID, kind repository.ReactionKind) error
	SoftDelete(ctx context.Context, messageID, moderatorUserID uuid.UUID) error
	IsViewerBanned(ctx context.Context, streamID, viewerSessionID uuid.UUID) (bool, *time.Time, error)
}

// LivenessChecker resolves stream lifecycle + per-stream slow-mode config.
type LivenessChecker interface {
	IsStreamLive(ctx context.Context, streamID uuid.UUID) (live bool, ended bool, err error)
	GetSlowModeSeconds(ctx context.Context, streamID uuid.UUID) (int, error)
}

// ModerationAction enumerates moderator-side actions.
type ModerationAction string

const (
	ModerationDelete  ModerationAction = "delete"
	ModerationTimeout ModerationAction = "timeout"
	ModerationBan     ModerationAction = "ban"
)

// Service is the server-authoritative chat core. HTTP wiring is the caller's
// concern (Round 3); this layer exposes typed errors handlers map to status codes.
type Service struct {
	repo     chatRepo
	gate     SlowModeGate
	liveness LivenessChecker
	clock    Clock
}

// NewService constructs a Service. Pass a nil clock to use time.Now.
func NewService(repo chatRepo, gate SlowModeGate, liveness LivenessChecker) *Service {
	return &Service{
		repo:     repo,
		gate:     gate,
		liveness: liveness,
		clock:    systemClock{},
	}
}

// SetClock lets tests inject a deterministic clock. Production code should not call this.
func (s *Service) SetClock(c Clock) {
	if c == nil {
		c = systemClock{}
	}
	s.clock = c
}

const maxMessageLen = 500

// PostViewerMessage runs the full gate chain (liveness → ban → slow-mode)
// and, on success, persists the row via ChatRepo.PostAsViewer. Publishing
// (NATS fan-out) is left to the caller in Round 3 — this core is publish-free.
func (s *Service) PostViewerMessage(
	ctx context.Context,
	streamID, workspaceID, viewerSessionID uuid.UUID,
	body string,
) (*repository.ChatMessage, error) {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return nil, ErrMessageEmpty
	}
	if !utf8.ValidString(trimmed) {
		return nil, ErrMessageEmpty
	}
	if utf8.RuneCountInString(trimmed) > maxMessageLen {
		return nil, ErrMessageTooLong
	}

	live, ended, err := s.liveness.IsStreamLive(ctx, streamID)
	if err != nil {
		return nil, fmt.Errorf("chat: liveness check: %w", err)
	}
	if ended {
		return nil, ErrStreamEnded
	}
	if !live {
		return nil, ErrStreamNotLive
	}

	banned, _, err := s.repo.IsViewerBanned(ctx, streamID, viewerSessionID)
	if err != nil {
		return nil, fmt.Errorf("chat: ban check: %w", err)
	}
	if banned {
		return nil, ErrBanned
	}

	windowSec, err := s.liveness.GetSlowModeSeconds(ctx, streamID)
	if err != nil {
		return nil, fmt.Errorf("chat: slow-mode lookup: %w", err)
	}
	allowed, retryAfter, err := s.gate.Allow(ctx, streamID, viewerSessionID, windowSec)
	if err != nil {
		return nil, fmt.Errorf("chat: slow-mode gate: %w", err)
	}
	if !allowed {
		return nil, &SlowModeError{RetryAfter: retryAfter}
	}

	return s.repo.PostAsViewer(ctx, streamID, workspaceID, viewerSessionID, trimmed)
}

// PostReaction enforces kind whitelist + per-session rate limit, then persists.
func (s *Service) PostReaction(
	ctx context.Context,
	streamID, workspaceID, viewerSessionID uuid.UUID,
	kind string,
) error {
	rk := repository.ReactionKind(kind)
	if !rk.IsValid() {
		return ErrInvalidKind
	}
	allowed, retryAfter, err := s.gate.ReactionRateLimit(ctx, streamID, viewerSessionID)
	if err != nil {
		return fmt.Errorf("chat: reaction rate limit: %w", err)
	}
	if !allowed {
		return &RateLimitError{RetryAfter: retryAfter}
	}
	return s.repo.EmitReaction(ctx, streamID, workspaceID, &viewerSessionID, rk)
}

// ModerateMessage executes a moderator action. For `delete`, it soft-deletes
// via the repository. Timeout/ban are stubs now — full ban enforcement wiring
// lands with the handler + audit pieces in Round 3.
func (s *Service) ModerateMessage(
	ctx context.Context,
	messageID, actorID uuid.UUID,
	action ModerationAction,
	duration time.Duration,
) error {
	switch action {
	case ModerationDelete:
		return s.repo.SoftDelete(ctx, messageID, actorID)
	case ModerationTimeout, ModerationBan:
		// Placeholder: requires chat_moderation_actions repo method (Round 3).
		return nil
	default:
		return ErrInvalidAction
	}
}
