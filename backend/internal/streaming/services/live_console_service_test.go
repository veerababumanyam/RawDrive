package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/chat"
)

// --- fakes ---

type fakeChatMod struct {
	called  bool
	action  chat.ModerationAction
	lastErr error
}

func (f *fakeChatMod) ModerateMessage(_ context.Context, _ uuid.UUID, _ uuid.UUID, a chat.ModerationAction, _ time.Duration) error {
	f.called = true
	f.action = a
	return f.lastErr
}

type fakePresence struct {
	cur, peak, uniq int
	err             error
}

func (f fakePresence) GetViewerMetrics(_ context.Context, _ uuid.UUID) (int, int, int, time.Time, error) {
	if f.err != nil {
		return 0, 0, 0, time.Time{}, f.err
	}
	return f.cur, f.peak, f.uniq, time.Now().UTC(), nil
}

// --- tests ---

func TestLiveConsoleService_GetViewerMetrics_NilPresence_ReturnsZero(t *testing.T) {
	svc := NewLiveConsoleService(nil, nil, nil, nil)
	m, err := svc.GetViewerMetrics(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if m.Current != 0 || m.Peak != 0 || m.Unique != 0 {
		t.Errorf("expected zero metrics, got %+v", m)
	}
}

func TestLiveConsoleService_GetViewerMetrics_Presence_ReturnsValues(t *testing.T) {
	svc := NewLiveConsoleService(nil, nil, nil, fakePresence{cur: 10, peak: 20, uniq: 15})
	m, err := svc.GetViewerMetrics(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if m.Current != 10 || m.Peak != 20 || m.Unique != 15 {
		t.Errorf("expected 10/20/15, got %+v", m)
	}
}

func TestLiveConsoleService_GetIngestHealth_NoCF_ReturnsDisconnectedShell(t *testing.T) {
	svc := NewLiveConsoleService(nil, nil, nil, nil)
	h, err := svc.GetIngestHealth(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if h.Connected {
		t.Error("expected Connected=false")
	}
	if h.Status != "unknown" {
		t.Errorf("status = %q", h.Status)
	}
}

func TestLiveConsoleService_AssertOwner_NoDB_NotFound(t *testing.T) {
	svc := NewLiveConsoleService(nil, nil, nil, nil)
	_, err := svc.AssertOwner(context.Background(), uuid.New(), uuid.New())
	if !errors.Is(err, ErrLiveStreamNotFound) {
		t.Errorf("err = %v, want ErrLiveStreamNotFound", err)
	}
}

func TestLiveConsoleService_Moderate_InvalidAction_Rejected(t *testing.T) {
	mod := &fakeChatMod{}
	svc := NewLiveConsoleService(nil, nil, mod, nil)
	err := svc.Moderate(context.Background(), LiveModerationRequest{Action: "nuke"})
	if err == nil {
		t.Error("expected error for invalid action")
	}
	if mod.called {
		t.Error("chat mod should not have been called")
	}
}

func TestLiveConsoleService_Moderate_Delete_DelegatesToChat(t *testing.T) {
	mod := &fakeChatMod{}
	svc := NewLiveConsoleService(nil, nil, mod, nil)
	err := svc.Moderate(context.Background(), LiveModerationRequest{
		MessageID: uuid.New(), ActorID: uuid.New(), Action: "delete",
	})
	if err != nil {
		t.Fatalf("%v", err)
	}
	if !mod.called || mod.action != chat.ModerationDelete {
		t.Errorf("expected delete delegation, got called=%v action=%q", mod.called, mod.action)
	}
}

func TestLiveConsoleService_SetSlowMode_NilDB_NoError(t *testing.T) {
	svc := NewLiveConsoleService(nil, nil, nil, nil)
	if err := svc.SetSlowMode(context.Background(), uuid.New(), 5); err != nil {
		t.Errorf("err = %v", err)
	}
}

func TestLiveConsoleService_EndStream_NilDB_NoError(t *testing.T) {
	svc := NewLiveConsoleService(nil, nil, nil, nil)
	if err := svc.EndStream(context.Background(), uuid.New(), "manual", uuid.New()); err != nil {
		t.Errorf("err = %v", err)
	}
}

func TestLiveConsoleService_GetWaitingRoomSnapshot_NilDB_ReturnsEmpty(t *testing.T) {
	svc := NewLiveConsoleService(nil, nil, nil, nil)
	snap, err := svc.GetWaitingRoomSnapshot(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("%v", err)
	}
	if snap.Title != "" {
		t.Errorf("expected empty snapshot, got %+v", snap)
	}
}
