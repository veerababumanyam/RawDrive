package chat

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/repository"
)

// --- mocks ---

type mockRepo struct {
	mu           sync.Mutex
	posts        []repository.ChatMessage
	postErr      error
	softDeleteFn func(ctx context.Context, msgID, modID uuid.UUID) error
	bans         map[uuid.UUID]bool
}

func (m *mockRepo) PostAsViewer(ctx context.Context, streamID, workspaceID, sess uuid.UUID, body string) (*repository.ChatMessage, error) {
	if m.postErr != nil {
		return nil, m.postErr
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	msg := repository.ChatMessage{
		ID:              uuid.New(),
		StreamID:        streamID,
		WorkspaceID:     workspaceID,
		ViewerSessionID: &sess,
		Body:            body,
		PostedAt:        time.Now(),
	}
	m.posts = append(m.posts, msg)
	return &msg, nil
}

func (m *mockRepo) EmitReaction(ctx context.Context, streamID, workspaceID uuid.UUID, sess *uuid.UUID, kind repository.ReactionKind) error {
	return nil
}

func (m *mockRepo) SoftDelete(ctx context.Context, msgID, modID uuid.UUID) error {
	if m.softDeleteFn != nil {
		return m.softDeleteFn(ctx, msgID, modID)
	}
	return nil
}

func (m *mockRepo) IsViewerBanned(ctx context.Context, streamID, sess uuid.UUID) (bool, *time.Time, error) {
	if m.bans != nil && m.bans[sess] {
		return true, nil, nil
	}
	return false, nil, nil
}

type mockLiveness struct {
	live, ended bool
}

func (m *mockLiveness) IsStreamLive(ctx context.Context, streamID uuid.UUID) (bool, bool, error) {
	return m.live, m.ended, nil
}

func (m *mockLiveness) GetSlowModeSeconds(ctx context.Context, streamID uuid.UUID) (int, error) {
	return 5, nil
}

type stubGate struct {
	allow      bool
	retryAfter time.Duration
	reactAllow bool
	reactRetry time.Duration
	allowCalls int
	reactCalls int
}

func (s *stubGate) Allow(ctx context.Context, streamID, sess uuid.UUID, window int) (bool, time.Duration, error) {
	s.allowCalls++
	if window == 0 {
		return true, 0, nil
	}
	return s.allow, s.retryAfter, nil
}

func (s *stubGate) ReactionRateLimit(ctx context.Context, streamID, sess uuid.UUID) (bool, time.Duration, error) {
	s.reactCalls++
	return s.reactAllow, s.reactRetry, nil
}

func newService(t *testing.T) (*Service, *mockRepo, *mockLiveness, *stubGate) {
	t.Helper()
	repo := &mockRepo{bans: map[uuid.UUID]bool{}}
	live := &mockLiveness{live: true}
	gate := &stubGate{allow: true, reactAllow: true}
	svc := NewService(repo, gate, live)
	return svc, repo, live, gate
}

func TestPostViewerMessage_Success_PersistsRow(t *testing.T) {
	svc, repo, _, _ := newService(t)
	ctx := context.Background()
	msg, err := svc.PostViewerMessage(ctx, uuid.New(), uuid.New(), uuid.New(), "hello")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if msg == nil || msg.Body != "hello" {
		t.Fatalf("unexpected msg: %+v", msg)
	}
	if len(repo.posts) != 1 {
		t.Fatalf("expected 1 persisted row, got %d", len(repo.posts))
	}
}

func TestPostViewerMessage_BannedUser_ReturnsErrBanned(t *testing.T) {
	svc, repo, _, _ := newService(t)
	sess := uuid.New()
	repo.bans[sess] = true
	_, err := svc.PostViewerMessage(context.Background(), uuid.New(), uuid.New(), sess, "hi")
	if !errors.Is(err, ErrBanned) {
		t.Fatalf("expected ErrBanned, got %v", err)
	}
	if len(repo.posts) != 0 {
		t.Fatalf("banned user should not have persisted")
	}
}

func TestPostViewerMessage_SlowModeViolation_ReturnsRetryAfter(t *testing.T) {
	svc, repo, _, gate := newService(t)
	gate.allow = false
	gate.retryAfter = 3 * time.Second
	_, err := svc.PostViewerMessage(context.Background(), uuid.New(), uuid.New(), uuid.New(), "hi")
	if !errors.Is(err, ErrSlowMode) {
		t.Fatalf("expected ErrSlowMode, got %v", err)
	}
	var sme *SlowModeError
	if !errors.As(err, &sme) {
		t.Fatalf("expected SlowModeError, got %T", err)
	}
	if sme.RetryAfter != 3*time.Second {
		t.Fatalf("expected retryAfter=3s, got %v", sme.RetryAfter)
	}
	if len(repo.posts) != 0 {
		t.Fatalf("slow-mode should not persist")
	}
}

func TestPostViewerMessage_StreamNotLive_ReturnsErrStreamNotLive(t *testing.T) {
	svc, _, live, _ := newService(t)
	live.live = false
	_, err := svc.PostViewerMessage(context.Background(), uuid.New(), uuid.New(), uuid.New(), "hi")
	if !errors.Is(err, ErrStreamNotLive) {
		t.Fatalf("expected ErrStreamNotLive, got %v", err)
	}
}

func TestPostViewerMessage_StreamEnded_ReturnsErrStreamEnded(t *testing.T) {
	svc, _, live, _ := newService(t)
	live.live = false
	live.ended = true
	_, err := svc.PostViewerMessage(context.Background(), uuid.New(), uuid.New(), uuid.New(), "hi")
	if !errors.Is(err, ErrStreamEnded) {
		t.Fatalf("expected ErrStreamEnded, got %v", err)
	}
}

func TestPostViewerMessage_TooLong_ReturnsErrMessageTooLong(t *testing.T) {
	svc, _, _, _ := newService(t)
	body := strings.Repeat("x", 501)
	_, err := svc.PostViewerMessage(context.Background(), uuid.New(), uuid.New(), uuid.New(), body)
	if !errors.Is(err, ErrMessageTooLong) {
		t.Fatalf("expected ErrMessageTooLong, got %v", err)
	}
}

func TestPostViewerMessage_EmptyBody_ReturnsErrEmptyBody(t *testing.T) {
	svc, _, _, _ := newService(t)
	_, err := svc.PostViewerMessage(context.Background(), uuid.New(), uuid.New(), uuid.New(), "   ")
	if err == nil {
		t.Fatalf("expected error for empty body")
	}
}

func TestPostReaction_Success_PersistsAndBatches(t *testing.T) {
	svc, _, _, _ := newService(t)
	err := svc.PostReaction(context.Background(), uuid.New(), uuid.New(), uuid.New(), "heart")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
}

func TestPostReaction_InvalidKind_Returns400(t *testing.T) {
	svc, _, _, _ := newService(t)
	err := svc.PostReaction(context.Background(), uuid.New(), uuid.New(), uuid.New(), "nope")
	if !errors.Is(err, ErrInvalidKind) {
		t.Fatalf("expected ErrInvalidKind, got %v", err)
	}
}

func TestPostReaction_RateLimitExceeded_Returns429(t *testing.T) {
	svc, _, _, gate := newService(t)
	gate.reactAllow = false
	gate.reactRetry = 500 * time.Millisecond
	err := svc.PostReaction(context.Background(), uuid.New(), uuid.New(), uuid.New(), "heart")
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected ErrRateLimited, got %v", err)
	}
}

func TestModerateMessage_Delete_SoftDeletes(t *testing.T) {
	svc, repo, _, _ := newService(t)
	called := false
	repo.softDeleteFn = func(ctx context.Context, msgID, modID uuid.UUID) error {
		called = true
		return nil
	}
	err := svc.ModerateMessage(context.Background(), uuid.New(), uuid.New(), ModerationDelete, 0)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !called {
		t.Fatalf("SoftDelete should have been called")
	}
}
