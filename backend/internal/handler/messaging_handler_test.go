package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
)

// newCreateChannelRequest builds an authenticated CreateChannel request with a
// valid JWT subject and workspace ID injected via the same context helpers the
// production middleware uses (WithJWTClaims + WithWorkspaceID), so getUserID and
// getWorkspaceID resolve exactly as they do in production.
func newCreateChannelRequest(t *testing.T, userID, wsID uuid.UUID, name string) *http.Request {
	t.Helper()
	body, err := json.Marshal(map[string]string{"name": name})
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/messaging/channels", bytes.NewReader(body))
	ctx := middleware.WithJWTClaims(req.Context(), map[string]interface{}{"sub": userID.String()})
	ctx = middleware.WithWorkspaceID(ctx, wsID.String())
	return req.WithContext(ctx)
}

// TestF066_CreateChannel_AddMemberError_IsLogged is the F-066 regression guard.
// Before the fix, CreateChannel discarded the AddMember return value entirely,
// so a failure to make the creator an admin member was swallowed silently
// (orphaned channel, no diagnostic). This test forces AddMember to fail and
// asserts the handler now LOGS the failure while still returning 201 (the
// channel itself was persisted, so the create succeeds from the client's view).
func TestF066_CreateChannel_AddMemberError_IsLogged(t *testing.T) {
	userID := uuid.New()
	wsID := uuid.New()

	var addMemberCalled bool
	h := &MessagingHandler{
		createChannelFn: func(ctx context.Context, ch *repository.Channel) error {
			// Mimic the real repo: assign an ID so the membership step has a
			// concrete channel to attach the creator to.
			ch.ID = uuid.New()
			return nil
		},
		addMemberFn: func(ctx context.Context, m *repository.ChannelMember) error {
			addMemberCalled = true
			if m.Role != "admin" {
				t.Errorf("creator membership role = %q, want admin", m.Role)
			}
			if m.UserID != userID {
				t.Errorf("creator membership user = %v, want %v", m.UserID, userID)
			}
			return context.DeadlineExceeded // simulate a persistence failure
		},
	}

	// Capture package-level log output so we can assert the error is no longer
	// swallowed. Restore the default logger afterwards.
	var logBuf bytes.Buffer
	origOut := log.Writer()
	origFlags := log.Flags()
	log.SetOutput(&logBuf)
	log.SetFlags(0)
	defer func() {
		log.SetOutput(origOut)
		log.SetFlags(origFlags)
	}()

	rr := httptest.NewRecorder()
	h.CreateChannel(rr, newCreateChannelRequest(t, userID, wsID, "general"))

	if !addMemberCalled {
		t.Fatal("AddMember was never invoked; creator-admin membership path not reached")
	}
	// The channel was created, so the client still sees success.
	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusCreated)
	}
	// The core of F-066: the AddMember failure must be observable in the logs.
	logged := logBuf.String()
	if !strings.Contains(logged, "CreateChannel") || !strings.Contains(strings.ToLower(logged), "add") {
		t.Fatalf("AddMember error was not logged (F-066 regression); log output = %q", logged)
	}
}

// TestF066_CreateChannel_HappyPath confirms the normal flow still wires the
// creator in as an admin member and returns 201 with the channel payload.
func TestF066_CreateChannel_HappyPath(t *testing.T) {
	userID := uuid.New()
	wsID := uuid.New()

	var memberAdded *repository.ChannelMember
	h := &MessagingHandler{
		createChannelFn: func(ctx context.Context, ch *repository.Channel) error {
			ch.ID = uuid.New()
			return nil
		},
		addMemberFn: func(ctx context.Context, m *repository.ChannelMember) error {
			memberAdded = m
			return nil
		},
	}

	rr := httptest.NewRecorder()
	h.CreateChannel(rr, newCreateChannelRequest(t, userID, wsID, "general"))

	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body=%s", rr.Code, http.StatusCreated, rr.Body.String())
	}
	if memberAdded == nil {
		t.Fatal("creator was not added as a member")
	}
	if memberAdded.UserID != userID || memberAdded.Role != "admin" {
		t.Fatalf("creator membership = %+v, want userID=%v role=admin", memberAdded, userID)
	}

	var resp struct {
		Data repository.Channel `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Data.CreatedBy != userID || resp.Data.WorkspaceID != wsID {
		t.Fatalf("channel = %+v, want createdBy=%v ws=%v", resp.Data, userID, wsID)
	}
}
