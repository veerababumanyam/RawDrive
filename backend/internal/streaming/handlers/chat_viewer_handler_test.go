package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/chat"
	"github.com/rawdrive/backend/internal/streaming/repository"
	"github.com/rawdrive/backend/internal/streaming/viewer"
)

// --- mocks ---

type fakeChatService struct {
	mu sync.Mutex

	postErr     error
	postMsg     *repository.ChatMessage
	postCalls   int

	reactErr   error
	reactCalls int
}

func (f *fakeChatService) PostViewerMessage(
	ctx context.Context,
	streamID, workspaceID, viewerSessionID uuid.UUID,
	body string,
) (*repository.ChatMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.postCalls++
	if f.postErr != nil {
		return nil, f.postErr
	}
	if f.postMsg != nil {
		return f.postMsg, nil
	}
	return &repository.ChatMessage{
		ID:          uuid.New(),
		StreamID:    streamID,
		WorkspaceID: workspaceID,
		Body:        body,
		PostedAt:    time.Now(),
	}, nil
}

func (f *fakeChatService) PostReaction(
	ctx context.Context,
	streamID, workspaceID, viewerSessionID uuid.UUID,
	kind string,
) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reactCalls++
	return f.reactErr
}

type fakeWorkspaceResolver struct {
	ws  uuid.UUID
	err error
}

func (f *fakeWorkspaceResolver) WorkspaceIDForStream(ctx context.Context, streamID uuid.UUID) (uuid.UUID, error) {
	if f.err != nil {
		return uuid.Nil, f.err
	}
	return f.ws, nil
}

type chatFakeFlag struct {
	on bool
}

func (f *chatFakeFlag) IsEnabled(ctx context.Context, workspaceID uuid.UUID) (bool, string) {
	return f.on, "test"
}

// helpers ------------------------------------------------------------------

func newTestHandler(t *testing.T, svc *fakeChatService, flagOn bool) (*ChatViewerHandler, *viewer.Service, uuid.UUID, uuid.UUID) {
	t.Helper()
	key := []byte("01234567890123456789012345678901")
	vsvc := viewer.NewService(viewer.Config{SigningKey: key, SlidingTTL: 15 * time.Minute, MaxLifetime: time.Hour})
	streamID := uuid.New()
	wsID := uuid.New()
	h := NewChatViewerHandler(svc, vsvc, &fakeWorkspaceResolver{ws: wsID}, &chatFakeFlag{on: flagOn})
	return h, vsvc, streamID, wsID
}

func issueToken(t *testing.T, vsvc *viewer.Service, streamID uuid.UUID) string {
	t.Helper()
	pair, err := vsvc.IssueSession(streamID.String(), viewer.AccessLevelOpen)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	return pair.AccessToken
}

func doPost(t *testing.T, h http.HandlerFunc, streamID uuid.UUID, token, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/v1/public/streams/"+streamID.String()+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	// Inject chi URL param.
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("streamID", streamID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

// --- tests ---

func TestPostChat_Unauthenticated_401(t *testing.T) {
	svc := &fakeChatService{}
	h, _, streamID, _ := newTestHandler(t, svc, true)
	rec := doPost(t, h.PostMessage, streamID, "", "/chat", `{"body":"hi"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
	if svc.postCalls != 0 {
		t.Fatalf("service should not be called")
	}
}

func TestPostChat_Success_201(t *testing.T) {
	svc := &fakeChatService{}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostMessage, streamID, tok, "/chat", `{"body":"hello"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d body=%s", rec.Code, rec.Body.String())
	}
	if svc.postCalls != 1 {
		t.Fatalf("want 1 call, got %d", svc.postCalls)
	}
}

func TestPostChat_Banned_403(t *testing.T) {
	svc := &fakeChatService{postErr: chat.ErrBanned}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostMessage, streamID, tok, "/chat", `{"body":"x"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403, got %d", rec.Code)
	}
}

func TestPostChat_SlowMode_429_WithRetryAfter(t *testing.T) {
	svc := &fakeChatService{postErr: &chat.SlowModeError{RetryAfter: 4 * time.Second}}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostMessage, streamID, tok, "/chat", `{"body":"x"}`)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429, got %d", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "4" {
		t.Fatalf("Retry-After want 4, got %q", got)
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["error"] != "slow_mode" {
		t.Fatalf("want error slow_mode, got %v", body["error"])
	}
}

func TestPostChat_TooLong_400(t *testing.T) {
	svc := &fakeChatService{postErr: chat.ErrMessageTooLong}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostMessage, streamID, tok, "/chat", `{"body":"toolong"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestPostChat_StreamNotLive_409(t *testing.T) {
	svc := &fakeChatService{postErr: chat.ErrStreamNotLive}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostMessage, streamID, tok, "/chat", `{"body":"x"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d", rec.Code)
	}
}

func TestPostChat_StreamEnded_410(t *testing.T) {
	svc := &fakeChatService{postErr: chat.ErrStreamEnded}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostMessage, streamID, tok, "/chat", `{"body":"x"}`)
	if rec.Code != http.StatusGone {
		t.Fatalf("want 410, got %d", rec.Code)
	}
}

func TestPostReaction_Success_202(t *testing.T) {
	svc := &fakeChatService{}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostReaction, streamID, tok, "/reactions", `{"kind":"heart"}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("want 202, got %d body=%s", rec.Code, rec.Body.String())
	}
	if svc.reactCalls != 1 {
		t.Fatalf("want 1 call, got %d", svc.reactCalls)
	}
}

func TestPostReaction_RateLimit_429(t *testing.T) {
	svc := &fakeChatService{reactErr: &chat.RateLimitError{RetryAfter: 2 * time.Second}}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostReaction, streamID, tok, "/reactions", `{"kind":"heart"}`)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429, got %d", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "2" {
		t.Fatalf("Retry-After want 2, got %q", got)
	}
}

func TestPostReaction_InvalidKind_400(t *testing.T) {
	svc := &fakeChatService{reactErr: chat.ErrInvalidKind}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostReaction, streamID, tok, "/reactions", `{"kind":"nope"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestFeatureFlagOff_404_AllChatEndpoints(t *testing.T) {
	svc := &fakeChatService{}
	h, vsvc, streamID, _ := newTestHandler(t, svc, false)
	tok := issueToken(t, vsvc, streamID)
	for _, path := range []struct {
		name string
		fn   http.HandlerFunc
		p    string
		b    string
	}{
		{"chat", h.PostMessage, "/chat", `{"body":"x"}`},
		{"reaction", h.PostReaction, "/reactions", `{"kind":"heart"}`},
	} {
		rec := doPost(t, path.fn, streamID, tok, path.p, path.b)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s: want 404, got %d", path.name, rec.Code)
		}
	}
	if svc.postCalls != 0 || svc.reactCalls != 0 {
		t.Fatalf("service should not be invoked when flag off")
	}
}

func TestPostChat_EmptyBody_400(t *testing.T) {
	svc := &fakeChatService{postErr: chat.ErrMessageEmpty}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	tok := issueToken(t, vsvc, streamID)
	rec := doPost(t, h.PostMessage, streamID, tok, "/chat", `{"body":""}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestPostChat_StreamIDMismatch_403(t *testing.T) {
	// Viewer token bound to different stream than path param.
	svc := &fakeChatService{}
	h, vsvc, streamID, _ := newTestHandler(t, svc, true)
	other := uuid.New()
	tok := issueToken(t, vsvc, other)
	rec := doPost(t, h.PostMessage, streamID, tok, "/chat", `{"body":"x"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403 on stream mismatch, got %d", rec.Code)
	}
	if svc.postCalls != 0 {
		t.Fatalf("service should not be called on mismatch")
	}
}

var _ = bytes.NewBuffer // silence unused import when refactoring
